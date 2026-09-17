export type JsonObject = Record<string, unknown>;

export interface AuthenticationBindings {
  PORTAL_SYSTEM_TOKEN?: string;
  PORTAL_SERVICE_TOKEN?: string;
  PORTAL_OBSERVER_TOKEN?: string;
  FEDERATION_TOKEN?: string;
  PORTAL_HEALTH_TOKEN?: string;
}

export interface KernelEnvelope {
  id: string;
  type: string;
  payload: JsonObject;
  identity: string;
  governanceContext: JsonObject;
}

export interface KernelError {
  code: string;
  message: string;
}

export interface KernelSuccess {
  ok: true;
  envelope: KernelEnvelope;
}

export interface KernelFailure {
  ok: false;
  error: KernelError;
  envelope?: KernelEnvelope;
}

export type KernelResult = KernelSuccess | KernelFailure;

export interface LogEntry {
  id: string;
  timestamp: string;
  envelopeId: string;
  identity: string;
  operation: string;
  status: 'accepted' | 'completed' | 'rejected' | 'failed';
  details: JsonObject;
}

export class ProtocolError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}

export function createEnvelope(
  type: string,
  payload: JsonObject,
  identity: string,
  governanceContext: JsonObject = {}
): KernelEnvelope {
  return { id: crypto.randomUUID(), type, payload, identity, governanceContext };
}

export function responseEnvelope(
  request: KernelEnvelope,
  payload: JsonObject,
  identity: string
): KernelEnvelope {
  return {
    id: crypto.randomUUID(),
    type: `${request.type}.result`,
    payload: { ...payload, requestId: request.id },
    identity,
    governanceContext: { ...request.governanceContext, handledAt: new Date().toISOString() }
  };
}

export function success(
  request: KernelEnvelope,
  payload: JsonObject,
  identity: string,
  status = 200
): Response {
  return Response.json(
    { ok: true, envelope: responseEnvelope(request, payload, identity) } satisfies KernelSuccess,
    { status }
  );
}

export function failure(
  code: string,
  message: string,
  status: number,
  envelope?: KernelEnvelope
): Response {
  return Response.json(
    { ok: false, error: { code, message }, envelope } satisfies KernelFailure,
    { status }
  );
}

export function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isEnvelope(value: unknown): value is KernelEnvelope {
  return (
    isRecord(value) &&
    typeof value.id === 'string' && isUuid(value.id) &&
    typeof value.type === 'string' && value.type.trim().length > 0 &&
    isRecord(value.payload) &&
    typeof value.identity === 'string' && value.identity.trim().length > 0 &&
    isRecord(value.governanceContext)
  );
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function readEnvelope(request: Request): Promise<KernelEnvelope> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ProtocolError('INVALID_JSON', 'Request body must be valid JSON');
  }
  if (!isEnvelope(body)) {
    throw new ProtocolError(
      'INVALID_ENVELOPE',
      'Envelope requires id, type, object payload, identity, and object governanceContext'
    );
  }
  return body;
}

export function requiredString(payload: JsonObject, key: string): string {
  const value = payload[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ProtocolError('INVALID_PAYLOAD', `${key} must be a non-empty string`);
  }
  return value.trim();
}

export function optionalStrings(payload: JsonObject, key: string): string[] {
  const value = payload[key];
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new ProtocolError('INVALID_PAYLOAD', `${key} must be an array of strings`);
  }
  return [...new Set(value as string[])];
}

export function optionalRecord(payload: JsonObject, key: string): JsonObject {
  const value = payload[key];
  if (value === undefined) return {};
  if (!isRecord(value)) {
    throw new ProtocolError('INVALID_PAYLOAD', `${key} must be an object`);
  }
  return value;
}

export async function bearerIdentity(
  header: string | null,
  env: AuthenticationBindings
): Promise<string | null> {
  const match = /^Bearer\s+(.+)$/i.exec(header ?? '');
  const token = match?.[1]?.trim();
  if (!token) return null;

  const configured: Array<[string | undefined, string]> = [
    [env.PORTAL_SYSTEM_TOKEN, 'system'],
    [env.PORTAL_SERVICE_TOKEN, 'portal-worker'],
    [env.PORTAL_OBSERVER_TOKEN, 'observer'],
    [env.FEDERATION_TOKEN, 'planetary-federation']
  ];
  for (const [credential, identity] of configured) {
    if (credential && await secureEqual(token, credential)) return identity;
  }
  return null;
}

export async function secureEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right))
  ]);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

export function errorResponse(error: unknown, envelope?: KernelEnvelope): Response {
  if (error instanceof ProtocolError) {
    return failure(error.code, error.message, error.status, envelope);
  }
  console.error('Portal-OS subsystem failure', error);
  return failure('INTERNAL_ERROR', 'Subsystem operation failed', 500, envelope);
}

export function forwardEnvelope(
  stub: DurableObjectStub,
  envelope: KernelEnvelope,
  headers: HeadersInit = {}
): Promise<Response> {
  const requestHeaders = new Headers(headers);
  requestHeaders.set('Content-Type', 'application/json');
  return stub.fetch('http://portal-os.internal/api/kernel/message', {
    method: 'POST',
    headers: requestHeaders,
    body: JSON.stringify(envelope)
  });
}

export function objectStub(namespace: DurableObjectNamespace, name = 'primary'): DurableObjectStub {
  return namespace.get(namespace.idFromName(name));
}
