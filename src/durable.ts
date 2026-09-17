import {
  errorResponse,
  failure,
  type JsonObject,
  type KernelEnvelope,
  type LogEntry,
  ProtocolError,
  readEnvelope
} from './protocol';

export abstract class EnvelopeDurableObject {
  constructor(
    protected readonly state: DurableObjectState,
    protected readonly serviceIdentity: string
  ) {}

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return failure('METHOD_NOT_ALLOWED', 'Durable Object accepts POST envelopes only', 405);
    }
    let envelope: KernelEnvelope | undefined;
    try {
      envelope = await readEnvelope(request);
      const readOnlyLiveness = await this.isReadOnlyRequest(request, envelope);
      if (!readOnlyLiveness) await this.writeLog(envelope, 'accepted', {});
      const response = await this.handle(envelope, request);
      if (!readOnlyLiveness) {
        await this.writeLog(envelope, response.ok ? 'completed' : 'failed', {
          responseStatus: response.status
        });
      }
      return response;
    } catch (error) {
      if (envelope) {
        await this.writeLog(envelope, error instanceof ProtocolError ? 'rejected' : 'failed', {
          code: error instanceof ProtocolError ? error.code : 'INTERNAL_ERROR'
        });
      }
      return errorResponse(error, envelope);
    }
  }

  protected abstract handle(envelope: KernelEnvelope, request?: Request): Promise<Response>;

  protected async isReadOnlyRequest(
    _request: Request,
    _envelope: KernelEnvelope
  ): Promise<boolean> {
    return false;
  }

  protected async logs(limit = 100): Promise<LogEntry[]> {
    const entries = await this.state.storage.list<LogEntry>({ prefix: 'log:' });
    return [...entries.values()]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, Math.max(1, Math.min(limit, 500)));
  }

  private async writeLog(
    envelope: KernelEnvelope,
    status: LogEntry['status'],
    details: JsonObject
  ): Promise<void> {
    const entry: LogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      envelopeId: envelope.id,
      identity: envelope.identity,
      operation: envelope.type,
      status,
      details
    };
    await this.state.storage.put(`log:${entry.timestamp}:${entry.id}`, entry);
    const logKeys = [...(await this.state.storage.list({ prefix: 'log:' })).keys()];
    if (logKeys.length > 500) {
      await this.state.storage.delete(logKeys.slice(0, logKeys.length - 500));
    }
  }
}
