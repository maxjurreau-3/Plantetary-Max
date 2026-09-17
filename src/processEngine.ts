import { EnvelopeDurableObject } from './durable';
import {
  optionalRecord,
  ProtocolError,
  requiredString,
  success,
  type JsonObject,
  type KernelEnvelope
} from './protocol';

type ProcessStatus = 'running' | 'stopped' | 'terminated';

interface ProcessRecord {
  id: string;
  name: string;
  module: string | null;
  status: ProcessStatus;
  owner: string;
  metadata: JsonObject;
  createdAt: string;
  updatedAt: string;
  terminatedAt: string | null;
  lastSignal: { name: string; payload: JsonObject; at: string } | null;
}

export class ProcessEngineDO extends EnvelopeDurableObject {
  constructor(state: DurableObjectState) {
    super(state, 'portal-os.process-engine');
  }

  protected async handle(envelope: KernelEnvelope): Promise<Response> {
    switch (envelope.type) {
      case 'process.create': return this.create(envelope);
      case 'process.kill': return this.kill(envelope);
      case 'process.list': return this.list(envelope);
      case 'process.inspect': return this.inspect(envelope);
      case 'process.signal': return this.signal(envelope);
      default:
        throw new ProtocolError('UNKNOWN_OPERATION', `Unsupported process operation: ${envelope.type}`, 404);
    }
  }

  private async create(envelope: KernelEnvelope): Promise<Response> {
    const now = new Date().toISOString();
    const process: ProcessRecord = {
      id: crypto.randomUUID(),
      name: requiredString(envelope.payload, 'name'),
      module: typeof envelope.payload.module === 'string' ? envelope.payload.module : null,
      status: 'running',
      owner: envelope.identity,
      metadata: optionalRecord(envelope.payload, 'metadata'),
      createdAt: now,
      updatedAt: now,
      terminatedAt: null,
      lastSignal: null
    };
    await this.state.storage.put(`process:${process.id}`, process);
    return success(envelope, { process }, this.serviceIdentity, 201);
  }

  private async kill(envelope: KernelEnvelope): Promise<Response> {
    const process = await this.get(requiredString(envelope.payload, 'processId'));
    if (process.status === 'terminated') {
      throw new ProtocolError('PROCESS_TERMINATED', 'Process is already terminated', 409);
    }
    const now = new Date().toISOString();
    process.status = 'terminated';
    process.updatedAt = now;
    process.terminatedAt = now;
    await this.state.storage.put(`process:${process.id}`, process);
    return success(envelope, { process }, this.serviceIdentity);
  }

  private async list(envelope: KernelEnvelope): Promise<Response> {
    const records = await this.state.storage.list<ProcessRecord>({ prefix: 'process:' });
    const requestedStatus = envelope.payload.status;
    const processes = [...records.values()]
      .filter((process) => requestedStatus === undefined || process.status === requestedStatus)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return success(envelope, { processes, count: processes.length }, this.serviceIdentity);
  }

  private async inspect(envelope: KernelEnvelope): Promise<Response> {
    const process = await this.get(requiredString(envelope.payload, 'processId'));
    return success(envelope, { process }, this.serviceIdentity);
  }

  private async signal(envelope: KernelEnvelope): Promise<Response> {
    const process = await this.get(requiredString(envelope.payload, 'processId'));
    if (process.status === 'terminated') {
      throw new ProtocolError('PROCESS_TERMINATED', 'Cannot signal a terminated process', 409);
    }
    const signal = requiredString(envelope.payload, 'signal');
    const now = new Date().toISOString();
    process.lastSignal = { name: signal, payload: optionalRecord(envelope.payload, 'data'), at: now };
    process.status = signal === 'STOP' ? 'stopped' : signal === 'CONTINUE' ? 'running' : process.status;
    process.updatedAt = now;
    await this.state.storage.put(`process:${process.id}`, process);
    return success(envelope, { process, delivered: true }, this.serviceIdentity);
  }

  private async get(id: string): Promise<ProcessRecord> {
    const process = await this.state.storage.get<ProcessRecord>(`process:${id}`);
    if (!process) throw new ProtocolError('PROCESS_NOT_FOUND', `Process ${id} was not found`, 404);
    return process;
  }
}
