import { EnvelopeDurableObject } from './durable';
import {
  createEnvelope,
  isEnvelope,
  isRecord,
  optionalRecord,
  optionalStrings,
  ProtocolError,
  requiredString,
  success,
  type JsonObject,
  type KernelEnvelope
} from './protocol';

interface FederationPeer {
  id: string;
  endpoint: string;
  universes: string[];
  metadata: JsonObject;
  status: 'registered' | 'online' | 'degraded';
  registeredAt: string;
  lastSeenAt: string | null;
}
interface ClusterOperation {
  id: string;
  type: string;
  targets: string[];
  results: Array<{ peerId: string; ok: boolean; status: number }>;
  createdAt: string;
  completedAt: string;
}
interface FederationEnv {
  FEDERATION_TOKEN?: string;
  FEDERATION_ALLOWED_ORIGINS?: string;
}

export class FederationDO extends EnvelopeDurableObject {
  constructor(state: DurableObjectState, private readonly env: FederationEnv) {
    super(state, 'planetary-max.federation');
  }

  protected async handle(envelope: KernelEnvelope): Promise<Response> {
    switch (envelope.type) {
      case 'federation.register': return this.register(envelope);
      case 'federation.list':
      case 'cluster.state': return this.clusterState(envelope);
      case 'federation.route': return this.route(envelope);
      case 'cluster.orchestrate': return this.orchestrate(envelope);
      default:
        throw new ProtocolError('UNKNOWN_OPERATION', `Unsupported federation operation: ${envelope.type}`, 404);
    }
  }

  private async register(envelope: KernelEnvelope): Promise<Response> {
    const id = requiredString(envelope.payload, 'peerId');
    const endpoint = this.validateEndpoint(requiredString(envelope.payload, 'endpoint'));
    const existing = await this.state.storage.get<FederationPeer>(`peer:${id}`);
    const peer: FederationPeer = {
      id,
      endpoint,
      universes: optionalStrings(envelope.payload, 'universes'),
      metadata: optionalRecord(envelope.payload, 'metadata'),
      status: 'registered',
      registeredAt: existing?.registeredAt ?? new Date().toISOString(),
      lastSeenAt: existing?.lastSeenAt ?? null
    };
    await this.state.storage.put(`peer:${id}`, peer);
    return success(envelope, { peer }, this.serviceIdentity, existing ? 200 : 201);
  }

  private async clusterState(envelope: KernelEnvelope): Promise<Response> {
    const peers = [...(await this.state.storage.list<FederationPeer>({ prefix: 'peer:' })).values()];
    const operations = [...(await this.state.storage.list<ClusterOperation>({ prefix: 'operation:' })).values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50);
    const universes = [...new Set(peers.flatMap((peer) => peer.universes))];
    return success(
      envelope,
      { cluster: { name: 'Planetary-Max', peers, universes, operations, peerCount: peers.length } },
      this.serviceIdentity
    );
  }

  private async route(envelope: KernelEnvelope): Promise<Response> {
    const peer = await this.getPeer(requiredString(envelope.payload, 'peerId'));
    const targetEnvelope = envelope.payload.envelope;
    if (!isEnvelope(targetEnvelope)) {
      throw new ProtocolError('INVALID_PAYLOAD', 'envelope must be a complete kernel envelope');
    }
    if (targetEnvelope.identity !== envelope.identity) {
      throw new ProtocolError('IDENTITY_MISMATCH', 'Cross-worker envelope identity must match the caller', 403);
    }
    const result = await this.send(peer, targetEnvelope);
    return success(
      envelope,
      { peerId: peer.id, response: result.body, status: result.status },
      this.serviceIdentity,
      [204, 205, 304].includes(result.status) ? 200 : result.status
    );
  }

  private async orchestrate(envelope: KernelEnvelope): Promise<Response> {
    const operationType = requiredString(envelope.payload, 'operation');
    const operationPayload = optionalRecord(envelope.payload, 'payload');
    const requestedTargets = optionalStrings(envelope.payload, 'targets');
    const peers = [...(await this.state.storage.list<FederationPeer>({ prefix: 'peer:' })).values()]
      .filter((peer) => requestedTargets.length === 0 || requestedTargets.includes(peer.id));
    if (peers.length === 0) throw new ProtocolError('NO_FEDERATION_TARGETS', 'No federation peers matched the operation', 404);
    const createdAt = new Date().toISOString();
    const outcomes = await Promise.all(peers.map(async (peer) => {
      try {
        const forwarded = createEnvelope(operationType, operationPayload, envelope.identity, {
          ...envelope.governanceContext,
          federation: { cluster: 'Planetary-Max', sourceEnvelopeId: envelope.id }
        });
        const result = await this.send(peer, forwarded);
        return { peerId: peer.id, ok: result.status >= 200 && result.status < 300, status: result.status };
      } catch {
        peer.status = 'degraded';
        await this.state.storage.put(`peer:${peer.id}`, peer);
        return { peerId: peer.id, ok: false, status: 503 };
      }
    }));
    const operation: ClusterOperation = {
      id: crypto.randomUUID(), type: operationType, targets: peers.map((peer) => peer.id), results: outcomes,
      createdAt, completedAt: new Date().toISOString()
    };
    await this.state.storage.put(`operation:${operation.id}`, operation);
    return success(envelope, { operation }, this.serviceIdentity, outcomes.every((item) => item.ok) ? 200 : 207);
  }

  private async send(peer: FederationPeer, envelope: KernelEnvelope): Promise<{ status: number; body: unknown }> {
    if (!this.env.FEDERATION_TOKEN) {
      throw new ProtocolError('FEDERATION_UNAVAILABLE', 'Federation credential is not configured', 503);
    }
    const response = await fetch(`${peer.endpoint}/api/kernel/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.env.FEDERATION_TOKEN}` },
      body: JSON.stringify({ ...envelope, identity: 'planetary-federation' }),
      signal: AbortSignal.timeout(10_000)
    });
    const body: unknown = await response.json().catch(() => ({ ok: false, error: { code: 'INVALID_PEER_RESPONSE' } }));
    peer.status = response.ok && isRecord(body) ? 'online' : 'degraded';
    peer.lastSeenAt = new Date().toISOString();
    await this.state.storage.put(`peer:${peer.id}`, peer);
    return { status: response.status, body };
  }

  private async getPeer(id: string): Promise<FederationPeer> {
    const peer = await this.state.storage.get<FederationPeer>(`peer:${id}`);
    if (!peer) throw new ProtocolError('PEER_NOT_FOUND', `Federation peer ${id} was not found`, 404);
    return peer;
  }

  private validateEndpoint(value: string): string {
    let url: URL;
    try { url = new URL(value); } catch {
      throw new ProtocolError('INVALID_PAYLOAD', 'endpoint must be an absolute URL');
    }
    if (url.username || url.password) {
      throw new ProtocolError('INVALID_PAYLOAD', 'endpoint must not contain credentials');
    }
    if (url.protocol !== 'https:') {
      throw new ProtocolError('INVALID_PAYLOAD', 'endpoint must use HTTPS');
    }
    const allowedOrigins = (this.env.FEDERATION_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    if (!allowedOrigins.includes(url.origin)) {
      throw new ProtocolError('FEDERATION_ORIGIN_DENIED', 'endpoint origin is not in the federation allowlist', 403);
    }
    return url.toString().replace(/\/$/, '');
  }
}
