import { EnvelopeDurableObject } from './durable';
import {
  isRecord,
  optionalRecord,
  ProtocolError,
  requiredString,
  success,
  type JsonObject,
  type KernelEnvelope
} from './protocol';

type HookKind = 'echo' | 'state.get' | 'state.merge' | 'counter.increment';
interface ModuleHook { kind: HookKind; stateKey?: string }
interface ModuleRecord {
  id: string;
  name: string;
  version: string;
  owner: string;
  hooks: Record<string, ModuleHook>;
  state: JsonObject;
  executions: number;
  registeredAt: string;
  updatedAt: string;
}

export class ModuleEngineDO extends EnvelopeDurableObject {
  constructor(state: DurableObjectState) {
    super(state, 'portal-os.module-engine');
  }

  protected async handle(envelope: KernelEnvelope): Promise<Response> {
    switch (envelope.type) {
      case 'module.register': return this.register(envelope);
      case 'module.execute': return this.execute(envelope);
      case 'module.state': return this.moduleState(envelope);
      default:
        throw new ProtocolError('UNKNOWN_OPERATION', `Unsupported module operation: ${envelope.type}`, 404);
    }
  }

  private async register(envelope: KernelEnvelope): Promise<Response> {
    const name = requiredString(envelope.payload, 'name');
    const id = typeof envelope.payload.id === 'string' ? envelope.payload.id.trim() : name;
    if (!id) throw new ProtocolError('INVALID_PAYLOAD', 'id must be a non-empty string');
    const hooks = this.parseHooks(envelope.payload.hooks);
    const existing = await this.state.storage.get<ModuleRecord>(`module:${id}`);
    const now = new Date().toISOString();
    const module: ModuleRecord = {
      id,
      name,
      version: typeof envelope.payload.version === 'string' ? envelope.payload.version : '1.0.0',
      owner: envelope.identity,
      hooks,
      state: existing?.state ?? optionalRecord(envelope.payload, 'initialState'),
      executions: existing?.executions ?? 0,
      registeredAt: existing?.registeredAt ?? now,
      updatedAt: now
    };
    await this.state.storage.put(`module:${id}`, module);
    return success(envelope, { module }, this.serviceIdentity, existing ? 200 : 201);
  }

  private async execute(envelope: KernelEnvelope): Promise<Response> {
    const module = await this.get(requiredString(envelope.payload, 'moduleId'));
    const hookName = requiredString(envelope.payload, 'hook');
    const hook = module.hooks[hookName];
    if (!hook) throw new ProtocolError('HOOK_NOT_FOUND', `Hook ${hookName} is not registered`, 404);
    const input = optionalRecord(envelope.payload, 'input');
    let output: unknown;
    switch (hook.kind) {
      case 'echo': output = input; break;
      case 'state.get': output = hook.stateKey ? module.state[hook.stateKey] : module.state; break;
      case 'state.merge':
        module.state = { ...module.state, ...input };
        output = module.state;
        break;
      case 'counter.increment': {
        const key = hook.stateKey ?? 'count';
        const storedValue = module.state[key];
        const current = typeof storedValue === 'number' ? storedValue : 0;
        const amount = typeof input.amount === 'number' && Number.isFinite(input.amount) ? input.amount : 1;
        module.state[key] = current + amount;
        output = module.state[key];
        break;
      }
    }
    module.executions += 1;
    module.updatedAt = new Date().toISOString();
    await this.state.storage.put(`module:${module.id}`, module);
    return success(
      envelope,
      { moduleId: module.id, hook: hookName, output, state: module.state },
      this.serviceIdentity
    );
  }

  private async moduleState(envelope: KernelEnvelope): Promise<Response> {
    if (typeof envelope.payload.moduleId === 'string') {
      return success(envelope, { module: await this.get(envelope.payload.moduleId) }, this.serviceIdentity);
    }
    const modules = [...(await this.state.storage.list<ModuleRecord>({ prefix: 'module:' })).values()];
    return success(envelope, { modules, count: modules.length }, this.serviceIdentity);
  }

  private parseHooks(value: unknown): Record<string, ModuleHook> {
    if (!isRecord(value) || Object.keys(value).length === 0) {
      throw new ProtocolError('INVALID_PAYLOAD', 'hooks must be a non-empty object');
    }
    const hooks: Record<string, ModuleHook> = {};
    const allowed = new Set<HookKind>(['echo', 'state.get', 'state.merge', 'counter.increment']);
    for (const [name, definition] of Object.entries(value)) {
      if (!isRecord(definition) || typeof definition.kind !== 'string' || !allowed.has(definition.kind as HookKind)) {
        throw new ProtocolError('INVALID_PAYLOAD', `Hook ${name} has an unsupported kind`);
      }
      hooks[name] = {
        kind: definition.kind as HookKind,
        ...(typeof definition.stateKey === 'string' ? { stateKey: definition.stateKey } : {})
      };
    }
    return hooks;
  }

  private async get(id: string): Promise<ModuleRecord> {
    const module = await this.state.storage.get<ModuleRecord>(`module:${id}`);
    if (!module) throw new ProtocolError('MODULE_NOT_FOUND', `Module ${id} was not found`, 404);
    return module;
  }
}
