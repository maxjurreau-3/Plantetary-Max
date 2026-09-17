import { EnvelopeDurableObject } from './durable';
import {
  optionalRecord,
  optionalStrings,
  ProtocolError,
  requiredString,
  success,
  type JsonObject,
  type KernelEnvelope
} from './protocol';

interface IdentityRecord {
  id: string;
  displayName: string;
  roles: string[];
  attributes: JsonObject;
  active: boolean;
  registeredBy: string;
  registeredAt: string;
  lastSelectedAt: string | null;
}

export class IdentityEngineDO extends EnvelopeDurableObject {
  constructor(state: DurableObjectState) {
    super(state, 'portal-os.identity-engine');
  }

  protected async handle(envelope: KernelEnvelope): Promise<Response> {
    switch (envelope.type) {
      case 'identity.register': return this.register(envelope);
      case 'identity.switch': return this.switchIdentity(envelope);
      case 'identity.inspect': return this.inspect(envelope);
      default:
        throw new ProtocolError('UNKNOWN_OPERATION', `Unsupported identity operation: ${envelope.type}`, 404);
    }
  }

  private async register(envelope: KernelEnvelope): Promise<Response> {
    const id = requiredString(envelope.payload, 'id');
    if (await this.state.storage.get(`identity:${id}`)) {
      throw new ProtocolError('IDENTITY_EXISTS', `Identity ${id} is already registered`, 409);
    }
    const identity: IdentityRecord = {
      id,
      displayName: typeof envelope.payload.displayName === 'string' ? envelope.payload.displayName : id,
      roles: optionalStrings(envelope.payload, 'roles'),
      attributes: optionalRecord(envelope.payload, 'attributes'),
      active: true,
      registeredBy: envelope.identity,
      registeredAt: new Date().toISOString(),
      lastSelectedAt: null
    };
    await this.state.storage.put(`identity:${id}`, identity);
    return success(envelope, { identity }, this.serviceIdentity, 201);
  }

  private async switchIdentity(envelope: KernelEnvelope): Promise<Response> {
    const identity = await this.get(requiredString(envelope.payload, 'id'));
    if (!identity.active) throw new ProtocolError('IDENTITY_INACTIVE', `Identity ${identity.id} is inactive`, 409);
    identity.lastSelectedAt = new Date().toISOString();
    await this.state.storage.put(`identity:${identity.id}`, identity);
    await this.state.storage.put('context:active', identity.id);
    return success(envelope, { activeIdentity: identity }, this.serviceIdentity);
  }

  private async inspect(envelope: KernelEnvelope): Promise<Response> {
    if (typeof envelope.payload.id === 'string') {
      return success(envelope, { identity: await this.get(envelope.payload.id) }, this.serviceIdentity);
    }
    const identities = [...(await this.state.storage.list<IdentityRecord>({ prefix: 'identity:' })).values()];
    const activeIdentityId = (await this.state.storage.get<string>('context:active')) ?? null;
    return success(envelope, { identities, activeIdentityId, count: identities.length }, this.serviceIdentity);
  }

  private async get(id: string): Promise<IdentityRecord> {
    const identity = await this.state.storage.get<IdentityRecord>(`identity:${id}`);
    if (!identity) throw new ProtocolError('IDENTITY_NOT_FOUND', `Identity ${id} was not found`, 404);
    return identity;
  }
}
