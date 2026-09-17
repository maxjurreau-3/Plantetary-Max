import { Hono } from 'hono';
import { FederationDO } from './federation';
import { IdentityEngineDO } from './identityEngine';
import { KernelDO, type PortalBindings } from './kernel';
import { ModuleEngineDO } from './moduleEngine';
import { ProcessEngineDO } from './processEngine';
import {
  bearerIdentity,
  createEnvelope,
  failure,
  forwardEnvelope,
  isEnvelope,
  isRecord,
  objectStub,
  type JsonObject,
  type KernelEnvelope
} from './protocol';
import { UmbrellaEngineDO } from './umbrellaEngine';
import { UniverseEngineDO } from './universeEngine';
import { maxOsConsole, planetarySurface } from './ui';

const app = new Hono<{ Bindings: PortalBindings }>();

app.get('/', (c) =>
  c.html(planetarySurface(c.env.PLANETARY_MODE, c.env.UMBRELLA_ENFORCEMENT, c.env.MAXOS_MODULE))
);
app.get('/max-os-1', (c) => c.html(maxOsConsole()));

app.get('/health', async (c) => {
  const readOnlyHealth = Boolean(c.env.PORTAL_HEALTH_TOKEN);
  const envelope = createEnvelope(
    'kernel.ping',
    {},
    readOnlyHealth ? 'portal-os.health' : 'portal-worker',
    { surface: 'health', authenticated: true }
  );
  let reachable = false;
  try {
    const response = await forwardEnvelope(
      objectStub(c.env.KERNEL_DO),
      envelope,
      readOnlyHealth ? { 'X-Portal-Health-Token': c.env.PORTAL_HEALTH_TOKEN as string } : {}
    );
    reachable = response.ok;
  } catch (error) {
    console.error('Portal-OS health check could not reach KernelDO', error);
  }
  return Response.json(
    {
      status: reachable ? 'ok' : 'degraded',
      service: 'Portal-OS Worker',
      kernel: reachable ? 'online' : 'unavailable'
    },
    { status: reachable ? 200 : 503 }
  );
});

app.post('/api/kernel/message', async (c) => {
  const authenticatedIdentity = await bearerIdentity(c.req.header('Authorization') ?? null, c.env);
  if (!authenticatedIdentity) return failure('UNAUTHENTICATED', 'Valid bearer credential required', 401);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return failure('INVALID_JSON', 'Request body must be valid JSON', 400);
  }

  let envelope: KernelEnvelope;
  if (isEnvelope(body)) {
    if (body.identity !== authenticatedIdentity) {
      return failure('IDENTITY_MISMATCH', 'Envelope identity must match the bearer identity', 403);
    }
    envelope = {
      ...body,
      governanceContext: { ...body.governanceContext, authenticated: true }
    };
  } else if (
    isRecord(body) &&
    typeof body.type === 'string' &&
    !('id' in body) &&
    !('identity' in body)
  ) {
    if (body.payload !== undefined && !isRecord(body.payload)) {
      return failure('INVALID_MESSAGE', 'payload must be an object', 400);
    }
    envelope = createEnvelope(
      body.type,
      body.payload === undefined ? {} : body.payload as JsonObject,
      authenticatedIdentity,
      { ...(isRecord(body.governanceContext) ? body.governanceContext : {}), authenticated: true }
    );
  } else {
    return failure('INVALID_ENVELOPE', 'A complete envelope or type with object payload is required', 400);
  }

  try {
    return await forwardEnvelope(objectStub(c.env.KERNEL_DO), envelope);
  } catch (error) {
    console.error('Portal-OS Worker could not reach KernelDO', error);
    return failure('KERNEL_UNAVAILABLE', 'KernelDO is unavailable', 503, envelope);
  }
});

app.get('/universe/state', (c) => authenticatedOperation(c.env, c.req.header('Authorization'), 'universe.state', {}));
app.get('/universe/umbrella', (c) => authenticatedOperation(c.env, c.req.header('Authorization'), 'universe.umbrella', {}));
app.post('/universe/tick', async (c) => {
  let payload: JsonObject = {};
  if ((c.req.header('Content-Type') ?? '').includes('application/json')) {
    try {
      const body: unknown = await c.req.json();
      if (!isRecord(body)) return failure('INVALID_JSON', 'Tick payload must be an object', 400);
      payload = body;
    } catch {
      return failure('INVALID_JSON', 'Request body must be valid JSON', 400);
    }
  }
  return authenticatedOperation(c.env, c.req.header('Authorization'), 'universe.tick', payload);
});

async function authenticatedOperation(
  env: PortalBindings,
  authorization: string | undefined,
  type: string,
  payload: JsonObject
): Promise<Response> {
  const identity = await bearerIdentity(authorization ?? null, env);
  if (!identity) return failure('UNAUTHENTICATED', 'Valid bearer credential required', 401);
  const envelope = createEnvelope(type, payload, identity, {
    surface: 'Planetary-Max',
    authenticated: true
  });
  try {
    return await forwardEnvelope(objectStub(env.KERNEL_DO), envelope);
  } catch {
    return failure('KERNEL_UNAVAILABLE', 'KernelDO is unavailable', 503, envelope);
  }
}

export {
  app,
  createEnvelope,
  FederationDO,
  IdentityEngineDO,
  KernelDO,
  ModuleEngineDO,
  ProcessEngineDO,
  UmbrellaEngineDO,
  UniverseEngineDO
};
export default app;
