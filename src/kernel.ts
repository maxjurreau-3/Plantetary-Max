import { EnvelopeDurableObject } from './durable';
import {
  createEnvelope,
  failure,
  forwardEnvelope,
  objectStub,
  ProtocolError,
  secureEqual,
  success,
  type KernelEnvelope,
  type KernelResult
} from './protocol';

export interface PortalBindings {
  KERNEL_DO: DurableObjectNamespace;
  PROCESS_ENGINE_DO: DurableObjectNamespace;
  MODULE_ENGINE_DO: DurableObjectNamespace;
  IDENTITY_ENGINE_DO: DurableObjectNamespace;
  UMBRELLA_ENGINE_DO: DurableObjectNamespace;
  UNIVERSE_ENGINE_DO: DurableObjectNamespace;
  FEDERATION_DO: DurableObjectNamespace;
  PLANETARY_MODE: string;
  UMBRELLA_ENFORCEMENT: string;
  MAXOS_MODULE: string;
  PORTAL_SYSTEM_TOKEN?: string;
  PORTAL_SERVICE_TOKEN?: string;
  PORTAL_OBSERVER_TOKEN?: string;
  FEDERATION_TOKEN?: string;
  FEDERATION_ALLOWED_ORIGINS?: string;
  PORTAL_HEALTH_TOKEN?: string;
}

interface KernelState {
  bootId: string;
  bootedAt: string;
  messagesHandled: number;
  lastMessageAt: string | null;
  moduleRegistry: Record<string, { name: string; version: string; registeredAt: string }>;
  identityRegistry: Record<string, { displayName: string; registeredAt: string }>;
}

export class KernelDO extends EnvelopeDurableObject {
  constructor(state: DurableObjectState, private readonly env: PortalBindings) {
    super(state, 'portal-os.kernel');
  }

  protected async handle(envelope: KernelEnvelope, request?: Request): Promise<Response> {
    const readOnlyLiveness = request ? await this.isReadOnlyRequest(request, envelope) : false;
    if (readOnlyLiveness) {
      const kernel = (await this.state.storage.get<KernelState>('kernel:state')) ?? this.initialState();
      return this.pingResponse(envelope, kernel);
    }

    const kernel = await this.loadState();
    kernel.messagesHandled += 1;
    kernel.lastMessageAt = new Date().toISOString();
    await this.state.storage.put('kernel:state', kernel);

    if (!await this.isAuthorized(envelope)) {
      return failure('FORBIDDEN', 'Umbrella governance denied this operation', 403, envelope);
    }
    if (envelope.type === 'kernel.ping') return this.pingResponse(envelope, kernel);
    if (envelope.type === 'kernel.state') {
      return success(envelope, { kernel, logs: await this.logs(100) }, this.serviceIdentity);
    }

    const response = await forwardEnvelope(objectStub(this.namespaceFor(envelope.type)), envelope);
    await this.captureRegistry(envelope, response.clone());
    return response;
  }

  protected async isReadOnlyRequest(request: Request, envelope: KernelEnvelope): Promise<boolean> {
    const suppliedCredential = request.headers.get('X-Portal-Health-Token');
    return Boolean(
      this.env.PORTAL_HEALTH_TOKEN &&
      suppliedCredential &&
      envelope.type === 'kernel.ping' &&
      envelope.identity === 'portal-os.health' &&
      envelope.governanceContext.surface === 'health' &&
      await secureEqual(suppliedCredential, this.env.PORTAL_HEALTH_TOKEN)
    );
  }

  private async isAuthorized(envelope: KernelEnvelope): Promise<boolean> {
    const enforcementEnvelope = createEnvelope(
      'umbrella.enforce',
      { operation: envelope.type, identity: envelope.identity },
      envelope.identity,
      envelope.governanceContext
    );
    const response = await forwardEnvelope(objectStub(this.env.UMBRELLA_ENGINE_DO), enforcementEnvelope);
    const result = await response.json<KernelResult>().catch(() => null);
    if (!result?.ok) {
      throw new ProtocolError('GOVERNANCE_UNAVAILABLE', 'Umbrella governance could not decide', 503);
    }
    return result.envelope.payload.decision === 'allow';
  }

  private pingResponse(envelope: KernelEnvelope, kernel: KernelState): Response {
    return success(
      envelope,
      {
        kernel: { ...kernel, status: 'online' },
        worker: 'Portal-OS Worker',
        console: 'MAX-OS-1 console',
        cluster: 'Planetary-Max'
      },
      this.serviceIdentity
    );
  }

  private namespaceFor(type: string): DurableObjectNamespace {
    if (type.startsWith('process.')) return this.env.PROCESS_ENGINE_DO;
    if (type.startsWith('module.')) return this.env.MODULE_ENGINE_DO;
    if (type.startsWith('identity.')) return this.env.IDENTITY_ENGINE_DO;
    if (type.startsWith('umbrella.') || type === 'universe.umbrella') return this.env.UMBRELLA_ENGINE_DO;
    if (type.startsWith('universe.')) return this.env.UNIVERSE_ENGINE_DO;
    if (type.startsWith('federation.') || type.startsWith('cluster.')) return this.env.FEDERATION_DO;
    throw new ProtocolError('UNKNOWN_OPERATION', `Kernel cannot route operation: ${type}`, 404);
  }

  private async captureRegistry(envelope: KernelEnvelope, response: Response): Promise<void> {
    if (!response.ok) return;
    const result = await response.json<KernelResult>().catch(() => null);
    if (!result?.ok) return;
    const kernel = await this.loadState();
    const now = new Date().toISOString();
    if (envelope.type === 'module.register') {
      const id = typeof envelope.payload.id === 'string' ? envelope.payload.id : envelope.payload.name;
      if (typeof id === 'string' && typeof envelope.payload.name === 'string') {
        kernel.moduleRegistry[id] = {
          name: envelope.payload.name,
          version: typeof envelope.payload.version === 'string' ? envelope.payload.version : '1.0.0',
          registeredAt: now
        };
      }
    }
    if (envelope.type === 'identity.register' && typeof envelope.payload.id === 'string') {
      kernel.identityRegistry[envelope.payload.id] = {
        displayName: typeof envelope.payload.displayName === 'string' ? envelope.payload.displayName : envelope.payload.id,
        registeredAt: now
      };
    }
    await this.state.storage.put('kernel:state', kernel);
  }

  private async loadState(): Promise<KernelState> {
    const existing = await this.state.storage.get<KernelState>('kernel:state');
    if (existing) return existing;
    const initial = this.initialState();
    await this.state.storage.put('kernel:state', initial);
    return initial;
  }

  private initialState(): KernelState {
    return {
      bootId: crypto.randomUUID(),
      bootedAt: new Date().toISOString(),
      messagesHandled: 0,
      lastMessageAt: null,
      moduleRegistry: {},
      identityRegistry: {}
    };
  }
}
