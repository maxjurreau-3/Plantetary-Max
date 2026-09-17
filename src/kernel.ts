export type KernelEnvelope = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  identity: string;
  governanceContext: Record<string, unknown>;
};

type KernelEnvironment = {
  PLANETARY_MODE: string;
  UMBRELLA_ENFORCEMENT: string;
  MAXOS_MODULE: string;
};

type UniverseState = {
  started: boolean;
  tick: number;
  ecosystem: Record<string, unknown>;
  createdAt: string;
  lastTickAt: string | null;
  lastMutation: Record<string, unknown>;
};

type GovernanceViolation = {
  messageId: string;
  type: string;
  reason: string;
  occurredAt: string;
};

type UmbrellaState = {
  active: boolean;
  enforcement: string;
  policy: string;
  allowedOperations: string[];
  decisions: number;
  allowed: number;
  denied: number;
  violations: GovernanceViolation[];
  lastDecision: {
    messageId: string;
    type: string;
    allowed: boolean;
    reason: string;
    decidedAt: string;
  } | null;
};

type IdentityRecord = {
  id: string;
  label: string;
  roles: string[];
  firstSeenAt: string;
  lastSeenAt: string;
  messageCount: number;
};

type ModuleRecord = {
  id: string;
  name: string;
  status: 'ready';
  version: string;
  capabilities: string[];
  registeredAt: string;
};

type KernelLog = {
  id: string;
  sequence: number;
  level: 'info' | 'warn' | 'error';
  event: string;
  message: string;
  messageId?: string;
  type?: string;
  identityId?: string;
  timestamp: string;
};

type PersistedKernelState = {
  schemaVersion: 1;
  bootedAt: string;
  sequence: number;
  universe: UniverseState;
  umbrella: UmbrellaState;
  identities: Record<string, IdentityRecord>;
  modules: Record<string, ModuleRecord>;
  logs: KernelLog[];
};

type KernelErrorCode =
  | 'INVALID_JSON'
  | 'INVALID_MESSAGE'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'METHOD_NOT_ALLOWED'
  | 'NOT_FOUND';

type KernelError = {
  ok: false;
  messageId?: string;
  error: { code: KernelErrorCode; message: string };
};

const STATE_KEY = 'portal-os-kernel-state';
const MAX_LOGS = 200;
const MAX_VIOLATIONS = 100;
const SUPPORTED_OPERATIONS = [
  'kernel.ping',
  'universe.state',
  'universe.umbrella',
  'universe.tick'
] as const;

export class KernelDO implements DurableObject {
  private readonly state: DurableObjectState;
  private readonly env: KernelEnvironment;
  private readonly ready: Promise<void>;

  constructor(state: DurableObjectState, env: KernelEnvironment) {
    this.state = state;
    this.env = env;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const persisted = await this.state.storage.get<PersistedKernelState>(STATE_KEY);
      if (!persisted) {
        await this.state.storage.put(STATE_KEY, createInitialState(this.env));
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const url = new URL(request.url);
    if (url.pathname !== '/api/kernel/message') {
      return jsonError('NOT_FOUND', 'Kernel route not found', 404);
    }
    if (request.method !== 'POST') {
      return jsonError('METHOD_NOT_ALLOWED', 'Kernel messages require POST', 405);
    }

    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return jsonError('INVALID_JSON', 'Request body must be JSON', 400);
    }

    const validationError = validateEnvelope(input);
    if (validationError) {
      return jsonError('INVALID_MESSAGE', validationError, 400);
    }
    return this.processEnvelope(input as KernelEnvelope);
  }

  private async processEnvelope(envelope: KernelEnvelope): Promise<Response> {
    const identityKey = await identityDigest(envelope.identity);
    return this.state.storage.transaction(async (transaction) => {
      const kernel =
        (await transaction.get<PersistedKernelState>(STATE_KEY)) ?? createInitialState(this.env);
      const now = new Date().toISOString();
      kernel.sequence += 1;
      const sequence = kernel.sequence;
      const identity = registerIdentity(kernel, identityKey, envelope, now);

      appendLog(kernel, {
        sequence,
        level: 'info',
        event: 'envelope.received',
        message: `Processing ${envelope.type}`,
        messageId: envelope.id,
        type: envelope.type,
        identityId: identity.id,
        timestamp: now
      });

      const governance = govern(kernel, envelope, now);
      if (!governance.allowed) {
        appendLog(kernel, {
          sequence,
          level: 'warn',
          event: 'governance.denied',
          message: governance.reason,
          messageId: envelope.id,
          type: envelope.type,
          identityId: identity.id,
          timestamp: now
        });
        await transaction.put(STATE_KEY, kernel);
        return jsonError(
          governance.code,
          governance.reason,
          governance.code === 'FORBIDDEN' ? 403 : 400,
          envelope.id
        );
      }

      let result: Record<string, unknown>;
      try {
        result = executeOperation(kernel, envelope, now);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid operation payload';
        appendLog(kernel, {
          sequence,
          level: 'warn',
          event: 'envelope.rejected',
          message,
          messageId: envelope.id,
          type: envelope.type,
          identityId: identity.id,
          timestamp: now
        });
        await transaction.put(STATE_KEY, kernel);
        return jsonError('INVALID_MESSAGE', message, 400, envelope.id);
      }

      appendLog(kernel, {
        sequence,
        level: 'info',
        event: 'envelope.processed',
        message: `${envelope.type} completed`,
        messageId: envelope.id,
        type: envelope.type,
        identityId: identity.id,
        timestamp: now
      });
      await transaction.put(STATE_KEY, kernel);
      return Response.json({
        ok: true,
        messageId: envelope.id,
        type: envelope.type,
        sequence,
        processedAt: now,
        identity,
        governance: {
          policy: kernel.umbrella.policy,
          enforcement: kernel.umbrella.enforcement,
          decision: 'allow'
        },
        result
      });
    });
  }
}

function createInitialState(env: KernelEnvironment): PersistedKernelState {
  const now = new Date().toISOString();
  const modules: ModuleRecord[] = [
    moduleRecord('kernel', 'Portal-OS Kernel', ['envelope.process', 'state.persist', 'logs.record'], now),
    moduleRecord('universe', 'MAX-OS-1 Universe', ['universe.state', 'universe.tick'], now),
    moduleRecord('umbrella', 'Umbrella Governance', ['governance.evaluate', 'universe.umbrella'], now),
    moduleRecord('identity', 'Portal-OS Identity Registry', ['identity.register', 'identity.resolve'], now),
    moduleRecord('substrate', 'KernelDO Durable Substrate', ['storage.transaction', 'state.recover'], now)
  ];
  return {
    schemaVersion: 1,
    bootedAt: now,
    sequence: 0,
    universe: {
      started: false,
      tick: 0,
      ecosystem: { population: 0, resources: 100 },
      createdAt: now,
      lastTickAt: null,
      lastMutation: {}
    },
    umbrella: {
      active: true,
      enforcement: env.UMBRELLA_ENFORCEMENT || 'strict',
      policy: 'planetary-umbrella',
      allowedOperations: [...SUPPORTED_OPERATIONS],
      decisions: 0,
      allowed: 0,
      denied: 0,
      violations: [],
      lastDecision: null
    },
    identities: {},
    modules: Object.fromEntries(modules.map((module) => [module.id, module])),
    logs: [
      {
        id: crypto.randomUUID(),
        sequence: 0,
        level: 'info',
        event: 'kernel.boot',
        message: `KernelDO ready in ${env.PLANETARY_MODE || 'single'} mode with ${env.MAXOS_MODULE || 'local'} universe module`,
        timestamp: now
      }
    ]
  };
}

function moduleRecord(
  id: string,
  name: string,
  capabilities: string[],
  registeredAt: string
): ModuleRecord {
  return { id, name, status: 'ready', version: '1.0.0', capabilities, registeredAt };
}

function registerIdentity(
  kernel: PersistedKernelState,
  identityKey: string,
  envelope: KernelEnvelope,
  now: string
): IdentityRecord {
  const existing = kernel.identities[identityKey];
  if (existing) {
    existing.lastSeenAt = now;
    existing.messageCount += 1;
    return existing;
  }
  const surface = envelope.governanceContext.surface;
  const identity: IdentityRecord = {
    id: `identity-${identityKey.slice(0, 16)}`,
    label: typeof surface === 'string' && surface.trim() ? surface.trim() : 'portal-os-client',
    roles: ['operator'],
    firstSeenAt: now,
    lastSeenAt: now,
    messageCount: 1
  };
  kernel.identities[identityKey] = identity;
  return identity;
}

function govern(
  kernel: PersistedKernelState,
  envelope: KernelEnvelope,
  now: string
): { allowed: boolean; reason: string; code: 'FORBIDDEN' | 'INVALID_MESSAGE' } {
  let allowed = true;
  let reason = 'Operation allowed by planetary umbrella';
  let code: 'FORBIDDEN' | 'INVALID_MESSAGE' = 'FORBIDDEN';

  if (!SUPPORTED_OPERATIONS.includes(envelope.type as (typeof SUPPORTED_OPERATIONS)[number])) {
    allowed = false;
    reason = `Unsupported kernel operation: ${envelope.type}`;
    code = 'INVALID_MESSAGE';
  } else if (envelope.governanceContext.deny === true) {
    allowed = false;
    reason = 'Operation denied by governance context';
  }

  kernel.umbrella.decisions += 1;
  if (allowed) {
    kernel.umbrella.allowed += 1;
  } else {
    kernel.umbrella.denied += 1;
    kernel.umbrella.violations.push({
      messageId: envelope.id,
      type: envelope.type,
      reason,
      occurredAt: now
    });
    kernel.umbrella.violations = kernel.umbrella.violations.slice(-MAX_VIOLATIONS);
  }
  kernel.umbrella.lastDecision = {
    messageId: envelope.id,
    type: envelope.type,
    allowed,
    reason,
    decidedAt: now
  };
  return { allowed, reason, code };
}

function executeOperation(
  kernel: PersistedKernelState,
  envelope: KernelEnvelope,
  now: string
): Record<string, unknown> {
  switch (envelope.type) {
    case 'kernel.ping':
      return {
        pong: true,
        kernel: {
          name: 'Portal-OS Kernel',
          durableObject: 'KernelDO',
          phase: 'ready',
          bootedAt: kernel.bootedAt,
          sequence: kernel.sequence
        },
        universeTick: kernel.universe.tick
      };
    case 'universe.state':
      return universeSnapshot(kernel);
    case 'universe.umbrella':
      return {
        umbrella: clone(kernel.umbrella),
        registry: {
          identities: Object.values(kernel.identities).map(clone),
          modules: Object.values(kernel.modules).map(clone)
        }
      };
    case 'universe.tick':
      return applyUniverseTick(kernel, envelope.payload, now);
    default:
      throw new Error(`Unsupported kernel operation: ${envelope.type}`);
  }
}

function applyUniverseTick(
  kernel: PersistedKernelState,
  payload: Record<string, unknown>,
  now: string
): Record<string, unknown> {
  const requestedTicks = payload.ticks ?? 1;
  if (
    typeof requestedTicks !== 'number' ||
    !Number.isInteger(requestedTicks) ||
    requestedTicks < 1 ||
    requestedTicks > 1000
  ) {
    throw new Error('ticks must be an integer between 1 and 1000');
  }
  const changes = payload.changes ?? {};
  if (!isRecord(changes)) throw new Error('changes must be an object');

  for (const [key, value] of Object.entries(changes)) {
    const current = kernel.universe.ecosystem[key];
    kernel.universe.ecosystem[key] =
      typeof current === 'number' && typeof value === 'number' ? current + value : clone(value);
  }
  kernel.universe.started = true;
  kernel.universe.tick += requestedTicks;
  kernel.universe.lastTickAt = now;
  kernel.universe.lastMutation = clone(changes);
  return {
    operation: 'tick',
    appliedTicks: requestedTicks,
    changes: clone(changes),
    universe: clone(kernel.universe),
    umbrella: clone(kernel.umbrella)
  };
}

function universeSnapshot(kernel: PersistedKernelState): Record<string, unknown> {
  return {
    universe: clone(kernel.universe),
    kernel: {
      name: 'Portal-OS Kernel',
      durableObject: 'KernelDO',
      phase: 'ready',
      bootedAt: kernel.bootedAt,
      sequence: kernel.sequence,
      identityCount: Object.keys(kernel.identities).length,
      moduleCount: Object.keys(kernel.modules).length,
      logCount: kernel.logs.length,
      logs: kernel.logs.slice(-50).map(clone)
    },
    registry: {
      identities: Object.values(kernel.identities).map(clone),
      modules: Object.values(kernel.modules).map(clone)
    }
  };
}

function appendLog(kernel: PersistedKernelState, log: Omit<KernelLog, 'id'>): void {
  kernel.logs.push({ id: crypto.randomUUID(), ...log });
  kernel.logs = kernel.logs.slice(-MAX_LOGS);
}

function validateEnvelope(value: unknown): string | null {
  if (!isRecord(value)) return 'Message envelope must be an object';
  const required = ['id', 'type', 'payload', 'identity', 'governanceContext'] as const;
  const missing = required.filter((field) => !(field in value));
  if (missing.length) return `Message envelope missing: ${missing.join(', ')}`;
  if (typeof value.id !== 'string' || !isUuid(value.id)) return 'id must be a UUID';
  if (typeof value.type !== 'string' || !value.type.trim()) return 'type must be a non-empty string';
  if (!isRecord(value.payload)) return 'payload must be an object';
  if (typeof value.identity !== 'string' || !value.identity.trim()) return 'identity must be a non-empty string';
  if (!isRecord(value.governanceContext)) return 'governanceContext must be an object';
  return null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function identityDigest(identity: string): Promise<string> {
  const bytes = new TextEncoder().encode(identity);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function jsonError(
  code: KernelErrorCode,
  message: string,
  status: number,
  messageId?: string
): Response {
  const body: KernelError = { ok: false, messageId, error: { code, message } };
  return Response.json(body, { status });
}
