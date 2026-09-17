import { EnvelopeDurableObject } from './durable';
import {
  optionalRecord,
  ProtocolError,
  requiredString,
  success,
  type JsonObject,
  type KernelEnvelope
} from './protocol';

type GovernanceMode = 'strict' | 'permissive';

interface GovernanceState {
  mode: GovernanceMode;
  threatLevel: number;
  signals: GovernanceSignal[];
  rules: GovernanceRule[];
  enforcementCount: number;
  updatedAt: string;
}
interface GovernanceRule {
  id: string;
  effect: 'allow' | 'deny';
  operations: string[];
  identities: string[];
  context: JsonObject;
}
interface GovernanceSignal {
  id: string;
  name: string;
  severity: number;
  data: JsonObject;
  identity: string;
  timestamp: string;
}
interface UmbrellaEnv { UMBRELLA_ENFORCEMENT?: string }

export class UmbrellaEngineDO extends EnvelopeDurableObject {
  constructor(state: DurableObjectState, private readonly env: UmbrellaEnv) {
    super(state, 'portal-os.umbrella-engine');
  }

  protected async handle(envelope: KernelEnvelope): Promise<Response> {
    switch (envelope.type) {
      case 'umbrella.state':
      case 'universe.umbrella': return this.getState(envelope);
      case 'umbrella.enforce': return this.enforce(envelope);
      case 'umbrella.signal': return this.signal(envelope);
      case 'umbrella.rule.upsert': return this.upsertRule(envelope);
      case 'umbrella.rule.remove': return this.removeRule(envelope);
      default:
        throw new ProtocolError('UNKNOWN_OPERATION', `Unsupported umbrella operation: ${envelope.type}`, 404);
    }
  }

  private async getState(envelope: KernelEnvelope): Promise<Response> {
    return success(envelope, { governance: await this.loadState() }, this.serviceIdentity);
  }

  private async enforce(envelope: KernelEnvelope): Promise<Response> {
    const operation = requiredString(envelope.payload, 'operation');
    const targetIdentity = typeof envelope.payload.identity === 'string' ? envelope.payload.identity : envelope.identity;
    const governance = await this.loadState();
    const requestContext = envelope.governanceContext;
    const matching = governance.rules.filter(
      (rule) =>
        (rule.operations.length === 0 || rule.operations.includes(operation)) &&
        (rule.identities.length === 0 || rule.identities.includes(targetIdentity)) &&
        Object.entries(rule.context).every(([key, value]) => requestContext[key] === value)
    );
    const denied = matching.some((rule) => rule.effect === 'deny');
    const explicitlyAllowed = matching.some((rule) => rule.effect === 'allow');
    const allowed = !denied && (governance.mode !== 'strict' || explicitlyAllowed);
    governance.enforcementCount += 1;
    governance.updatedAt = new Date().toISOString();
    await this.state.storage.put('governance:state', governance);
    return success(
      envelope,
      { decision: allowed ? 'allow' : 'deny', operation, identity: targetIdentity, matchedRules: matching.map((rule) => rule.id) },
      this.serviceIdentity,
      allowed ? 200 : 403
    );
  }

  private async upsertRule(envelope: KernelEnvelope): Promise<Response> {
    this.requireSystemIdentity(envelope);
    const effect = requiredString(envelope.payload, 'effect');
    if (effect !== 'allow' && effect !== 'deny') {
      throw new ProtocolError('INVALID_PAYLOAD', 'effect must be allow or deny');
    }
    const rule: GovernanceRule = {
      id: requiredString(envelope.payload, 'ruleId'),
      effect,
      operations: this.stringArray(envelope.payload.operations, 'operations'),
      identities: this.stringArray(envelope.payload.identities, 'identities'),
      context: optionalRecord(envelope.payload, 'context')
    };
    const governance = await this.loadState();
    governance.rules = [...governance.rules.filter((item) => item.id !== rule.id), rule];
    governance.updatedAt = new Date().toISOString();
    await this.state.storage.put('governance:state', governance);
    return success(envelope, { rule, governance }, this.serviceIdentity);
  }

  private async removeRule(envelope: KernelEnvelope): Promise<Response> {
    this.requireSystemIdentity(envelope);
    const ruleId = requiredString(envelope.payload, 'ruleId');
    const governance = await this.loadState();
    const previousLength = governance.rules.length;
    governance.rules = governance.rules.filter((rule) => rule.id !== ruleId);
    if (governance.rules.length === previousLength) {
      throw new ProtocolError('RULE_NOT_FOUND', `Governance rule ${ruleId} was not found`, 404);
    }
    governance.updatedAt = new Date().toISOString();
    await this.state.storage.put('governance:state', governance);
    return success(envelope, { removedRuleId: ruleId, governance }, this.serviceIdentity);
  }

  private requireSystemIdentity(envelope: KernelEnvelope): void {
    if (envelope.identity !== 'system') {
      throw new ProtocolError('FORBIDDEN', 'Only the system identity can modify governance rules', 403);
    }
  }

  private stringArray(value: unknown, name: string): string[] {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
      throw new ProtocolError('INVALID_PAYLOAD', `${name} must be an array of strings`);
    }
    return [...new Set(value)];
  }

  private async signal(envelope: KernelEnvelope): Promise<Response> {
    const severityValue = envelope.payload.severity;
    const severity = typeof severityValue === 'number' && Number.isFinite(severityValue)
      ? Math.max(0, Math.min(10, severityValue))
      : 1;
    const signal: GovernanceSignal = {
      id: crypto.randomUUID(),
      name: requiredString(envelope.payload, 'signal'),
      severity,
      data: optionalRecord(envelope.payload, 'data'),
      identity: envelope.identity,
      timestamp: new Date().toISOString()
    };
    const governance = await this.loadState();
    governance.signals = [...governance.signals, signal].slice(-100);
    governance.threatLevel = Math.max(severity, ...governance.signals.slice(-10).map((item) => item.severity));
    governance.updatedAt = signal.timestamp;
    await this.state.storage.put('governance:state', governance);
    return success(envelope, { signal, threatLevel: governance.threatLevel }, this.serviceIdentity, 201);
  }

  private async loadState(): Promise<GovernanceState> {
    const existing = await this.state.storage.get<GovernanceState>('governance:state');
    if (existing) {
      if (!this.isGovernanceMode(existing.mode)) {
        existing.mode = 'strict';
        existing.updatedAt = new Date().toISOString();
        await this.state.storage.put('governance:state', existing);
      }
      return existing;
    }
    const configuredMode = this.isGovernanceMode(this.env.UMBRELLA_ENFORCEMENT)
      ? this.env.UMBRELLA_ENFORCEMENT
      : 'strict';
    const initial: GovernanceState = {
      mode: configuredMode,
      threatLevel: 0,
      signals: [],
      rules: [
        { id: 'kernel-health', effect: 'allow', operations: ['kernel.ping'], identities: [], context: {} },
        {
          id: 'authenticated-runtime',
          effect: 'allow',
          operations: [],
          identities: ['system', 'portal-worker', 'planetary-federation'],
          context: { authenticated: true }
        },
        {
          id: 'observer-readonly',
          effect: 'allow',
          operations: [
            'kernel.state', 'kernel.ping', 'universe.state', 'universe.umbrella',
            'umbrella.state', 'umbrella.enforce', 'process.list',
            'process.inspect', 'module.state', 'identity.inspect', 'cluster.state', 'federation.list'
          ],
          identities: ['observer'],
          context: { authenticated: true }
        }
      ],
      enforcementCount: 0,
      updatedAt: new Date().toISOString()
    };
    await this.state.storage.put('governance:state', initial);
    return initial;
  }

  private isGovernanceMode(value: unknown): value is GovernanceMode {
    return value === 'strict' || value === 'permissive';
  }
}
