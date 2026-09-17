import { EnvelopeDurableObject } from './durable';
import {
  optionalRecord,
  ProtocolError,
  success,
  type JsonObject,
  type KernelEnvelope
} from './protocol';

interface UniverseEvent {
  id: string;
  epoch: number;
  kind: string;
  data: JsonObject;
  timestamp: string;
}
interface UniverseState {
  id: string;
  epoch: number;
  phase: 'nascent' | 'expanding' | 'stable';
  energy: number;
  entropy: number;
  dimensions: number;
  substrateRevision: number;
  events: UniverseEvent[];
  createdAt: string;
  updatedAt: string;
}

export class UniverseEngineDO extends EnvelopeDurableObject {
  constructor(state: DurableObjectState) {
    super(state, 'portal-os.universe-engine');
  }

  protected async handle(envelope: KernelEnvelope): Promise<Response> {
    switch (envelope.type) {
      case 'universe.state': return this.getState(envelope);
      case 'universe.tick': return this.tick(envelope);
      case 'universe.substrate': return this.substrate(envelope);
      default:
        throw new ProtocolError('UNKNOWN_OPERATION', `Unsupported universe operation: ${envelope.type}`, 404);
    }
  }

  private async getState(envelope: KernelEnvelope): Promise<Response> {
    return success(envelope, { universe: await this.loadState() }, this.serviceIdentity);
  }

  private async tick(envelope: KernelEnvelope): Promise<Response> {
    const universe = await this.loadState();
    const stepsValue = envelope.payload.steps;
    const steps = typeof stepsValue === 'number' ? stepsValue : 1;
    if (!Number.isInteger(steps) || steps < 1 || steps > 1000) {
      throw new ProtocolError('INVALID_PAYLOAD', 'steps must be an integer from 1 to 1000');
    }
    const impulseValue = envelope.payload.impulse;
    const impulse = typeof impulseValue === 'number' && Number.isFinite(impulseValue) ? impulseValue : 0;
    universe.epoch += steps;
    universe.energy = Math.max(0, universe.energy + impulse - steps * 0.01);
    universe.entropy = Math.min(1, universe.entropy + steps * 0.0001);
    universe.phase = universe.epoch < 10 ? 'nascent' : universe.epoch < 1000 ? 'expanding' : 'stable';
    universe.substrateRevision += 1;
    universe.updatedAt = new Date().toISOString();
    const event: UniverseEvent = {
      id: crypto.randomUUID(),
      epoch: universe.epoch,
      kind: typeof envelope.payload.event === 'string' ? envelope.payload.event : 'tick',
      data: optionalRecord(envelope.payload, 'data'),
      timestamp: universe.updatedAt
    };
    universe.events = [...universe.events, event].slice(-200);
    await this.state.storage.put('universe:state', universe);
    return success(envelope, { universe, event }, this.serviceIdentity);
  }

  private async substrate(envelope: KernelEnvelope): Promise<Response> {
    const universe = await this.loadState();
    const storageEntries = await this.state.storage.list({ prefix: 'universe:' });
    return success(
      envelope,
      {
        substrate: {
          universeId: universe.id,
          revision: universe.substrateRevision,
          durable: true,
          records: storageEntries.size,
          coherence: 'coherent',
          lastMutationAt: universe.updatedAt
        }
      },
      this.serviceIdentity
    );
  }

  private async loadState(): Promise<UniverseState> {
    const existing = await this.state.storage.get<UniverseState>('universe:state');
    if (existing) return existing;
    const now = new Date().toISOString();
    const initial: UniverseState = {
      id: crypto.randomUUID(), epoch: 0, phase: 'nascent', energy: 1, entropy: 0,
      dimensions: 4, substrateRevision: 0, events: [], createdAt: now, updatedAt: now
    };
    await this.state.storage.put('universe:state', initial);
    return initial;
  }
}
