import { Hono } from 'hono';

type KernelEnvelope = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  identity: string;
  governanceContext: Record<string, unknown>;
};

type KernelService = {
  fetch(request: Request): Promise<Response>;
};

type Bindings = {
  KERNEL_SERVICE?: KernelService;
  KERNEL_URL?: string;

  PLANETARY_MODE: string;
  UMBRELLA_ENFORCEMENT: string;
  MAXOS_MODULE: string;
};

type KernelResult = {
  ok?: boolean;
  error?: { code?: string; message?: string };
  [key: string]: unknown;
};

const app = new Hono<{ Bindings: Bindings }>();

// ⭐ ROOT ROUTE — Planetary‑Max UI
app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>Planetary‑Max UI</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            background: #0b0b0c;
            color: #e6e6e6;
            padding: 40px;
          }
          h1 {
            font-size: 2.4rem;
            margin-bottom: 10px;
          }
          .card {
            background: #1a1a1d;
            padding: 20px;
            border-radius: 8px;
            margin-top: 20px;
          }
          a {
            color: #4da3ff;
            text-decoration: none;
          }
        </style>
      </head>
      <body>
        <h1>Planetary‑Max</h1>
        <div class="card">
          <p><strong>Worker:</strong> planetary-max</p>
          <p><strong>Mode:</strong> ${c.env.PLANETARY_MODE}</p>
          <p><strong>Umbrella:</strong> ${c.env.UMBRELLA_ENFORCEMENT}</p>
          <p><strong>Module:</strong> ${c.env.MAXOS_MODULE}</p>
        </div>

        <div class="card">
          <p><a href="/max-os-1">Open MAX‑OS‑1 Console →</a></p>
        </div>
      </body>
    </html>
  `);
});

// ⭐ MAX‑OS‑1 SYSTEM CONSOLE
app.get('/max-os-1', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>MAX‑OS‑1 Console</title>
        <style>
          body {
            font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
            background: #050608;
            color: #e6e6e6;
            padding: 24px;
          }
          h1 {
            font-size: 1.8rem;
            margin-bottom: 8px;
          }
          .meta {
            font-size: 0.9rem;
            color: #9a9a9a;
            margin-bottom: 16px;
          }
          .console {
            background: #0b0c10;
            border-radius: 8px;
            padding: 16px;
            border: 1px solid #20222a;
          }
          .output {
            height: 260px;
            overflow-y: auto;
            margin-bottom: 12px;
            font-size: 0.9rem;
            line-height: 1.4;
          }
          .line {
            margin-bottom: 4px;
          }
          .line span.prompt {
            color: #4da3ff;
          }
          .line span.error {
            color: #ff4d6a;
          }
          .input-row {
            display: flex;
            gap: 8px;
            margin-top: 8px;
          }
          input[type="text"] {
            flex: 1;
            background: #050608;
            border: 1px solid #30323a;
            border-radius: 4px;
            padding: 6px 8px;
            color: #e6e6e6;
            font-family: inherit;
            font-size: 0.9rem;
          }
          button {
            background: #4da3ff;
            border: none;
            border-radius: 4px;
            padding: 6px 12px;
            color: #050608;
            font-weight: 600;
            cursor: pointer;
            font-size: 0.9rem;
          }
          button:disabled {
            opacity: 0.6;
            cursor: default;
          }
          a {
            color: #4da3ff;
            text-decoration: none;
            font-size: 0.85rem;
          }
          .nav {
            margin-top: 16px;
          }
        </style>
      </head>
      <body>
        <h1>MAX‑OS‑1 Console</h1>
        <div class="meta">
          System: MAX‑OS‑1 · Mode: ${c.env.PLANETARY_MODE} · Umbrella: ${c.env.UMBRELLA_ENFORCEMENT} · Module: ${c.env.MAXOS_MODULE}
        </div>

        <div class="console">
          <div id="output" class="output">
            <div class="line">
              <span class="prompt">max-os-1@kernel</span> boot: console online
            </div>
            <div class="line">
              type a <code>type</code> and optional JSON <code>payload</code>, then press ENTER
            </div>
            <div class="line">
              example: <code>universe.state {"surface":"worker-universe"}</code>
            </div>
          </div>
          <div class="input-row">
            <input id="command" type="text" placeholder='type payloadJSON (optional)' />
            <button id="send">SEND</button>
          </div>
        </div>

        <div class="nav">
          <a href="/">← Back to Planetary‑Max</a>
        </div>

        <script>
          const outputEl = document.getElementById('output');
          const commandEl = document.getElementById('command');
          const sendEl = document.getElementById('send');

          function appendLine(text, opts = {}) {
            const div = document.createElement('div');
            div.className = 'line';
            if (opts.error) {
              const span = document.createElement('span');
              span.className = 'error';
              span.textContent = text;
              div.appendChild(span);
            } else if (opts.prompt) {
              const span = document.createElement('span');
              span.className = 'prompt';
              span.textContent = opts.prompt + ' ';
              div.appendChild(span);
              div.appendChild(document.createTextNode(text));
            } else {
              div.textContent = text;
            }
            outputEl.appendChild(div);
            outputEl.scrollTop = outputEl.scrollHeight;
          }

          async function sendCommand() {
            const raw = commandEl.value.trim();
            if (!raw) return;

            appendLine(raw, { prompt: 'max-os-1>' });
            commandEl.value = '';
            sendEl.disabled = true;

            let type = raw;
            let payload = {};

            const spaceIdx = raw.indexOf(' ');
            if (spaceIdx !== -1) {
              type = raw.slice(0, spaceIdx).trim();
              const payloadStr = raw.slice(spaceIdx + 1).trim();
              if (payloadStr) {
                try {
                  payload = JSON.parse(payloadStr);
                } catch (e) {
                  appendLine('payload JSON parse error: ' + e.message, { error: true });
                  sendEl.disabled = false;
                  return;
                }
              }
            }

            try {
              const res = await fetch('/api/kernel/message', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': 'Bearer max-os-1-console'
                },
                body: JSON.stringify({
                  type,
                  payload,
                  governanceContext: { surface: 'max-os-1-console' }
                })
              });

              const json = await res.json();
              appendLine('status ' + res.status + ' · ok=' + (json.ok !== false));
              appendLine(JSON.stringify(json, null, 2));
            } catch (e) {
              appendLine('kernel bridge error: ' + e.message, { error: true });
            } finally {
              sendEl.disabled = false;
            }
          }

          sendEl.addEventListener('click', sendCommand);
          commandEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              sendCommand();
            }
          });
        </script>
      </body>
    </html>
  `);
});

app.get('/health', (c) => c.json({ status: 'ok', service: 'portal-os-worker' }));

app.post('/api/kernel/message', async (c) => {
  const identity = bearerToken(c.req.header('Authorization'));
  if (!identity) {
    return c.json(
      { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Bearer token required' } },
      401
    );
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { ok: false, error: { code: 'INVALID_JSON', message: 'Request body must be JSON' } },
      400
    );
  }

  if (!isRecord(body) || typeof body.type !== 'string') {
    return c.json(
      { ok: false, error: { code: 'INVALID_MESSAGE', message: 'type and object payload are required' } },
      400
    );
  }

  const payload = body.payload === undefined ? {} : body.payload;
  if (!isRecord(payload)) {
    return c.json(
      { ok: false, error: { code: 'INVALID_MESSAGE', message: 'type and object payload are required' } },
      400
    );
  }

  const envelope = createEnvelope(
    body.type,
    payload,
    identity,
    isRecord(body.governanceContext) ? body.governanceContext : {}
  );

  return kernelResponse(c.env, envelope);
});

app.get('/universe/state', async (c) =>
  universeRequest(c.env, c.req.header('Authorization'), 'universe.state', {})
);

app.get('/universe/umbrella', async (c) =>
  universeRequest(c.env, c.req.header('Authorization'), 'universe.umbrella', {})
);

app.post('/universe/tick', async (c) => {
  let payload: Record<string, unknown> = {};
  const contentType = c.req.header('Content-Type') ?? '';

  if (contentType.includes('application/json')) {
    try {
      const body: unknown = await c.req.json();
      if (!isRecord(body)) {
        return c.json(
          { ok: false, error: { code: 'INVALID_JSON', message: 'Tick payload must be an object' } },
          400
        );
      }
      payload = body;
    } catch {
      return c.json(
        { ok: false, error: { code: 'INVALID_JSON', message: 'Request body must be JSON' } },
        400
      );
    }
  }

  return universeRequest(c.env, c.req.header('Authorization'), 'universe.tick', payload);
});

async function universeRequest(
  env: Bindings,
  authorization: string | undefined,
  type: string,
  payload: Record<string, unknown>
): Promise<Response> {
  const identity = bearerToken(authorization);
  if (!identity) {
    return Response.json(
      { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Bearer token required' } },
      { status: 401 }
    );
  }

  return kernelResponse(
    env,
    createEnvelope(type, payload, identity, { surface: 'worker-universe' })
  );
}

function createEnvelope(
  type: string,
  payload: Record<string, unknown>,
  identity: string,
  governanceContext: Record<string, unknown>
): KernelEnvelope {
  return {
    id: crypto.randomUUID(),
    type,
    payload,
    identity,
    governanceContext
  };
}

async function kernelResponse(env: Bindings, envelope: KernelEnvelope): Promise<Response> {
  try {
    const response = await callKernel(env, envelope);
    const result = await response.json<KernelResult>();
    const status =
      result.ok === false ? kernelErrorStatus(result.error?.code) : response.status;

    return Response.json(result, { status });
  } catch (error) {
    console.error('Worker to kernel bridge failed', error);
    return Response.json(
      {
        ok: false,
        error: { code: 'KERNEL_UNAVAILABLE', message: 'Kernel bridge unavailable' }
      },
      { status: 503 }
    );
  }
}

async function callKernel(env: Bindings, envelope: KernelEnvelope): Promise<Response> {
  const body = JSON.stringify(envelope);

  const request = new Request('http://kernel/api/kernel/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  });

  if (env.KERNEL_SERVICE) return env.KERNEL_SERVICE.fetch(request);

  if (env.KERNEL_URL) {
    const target = `${env.KERNEL_URL.replace(/\/$/, '')}/api/kernel/message`;
    return fetch(target, { method: 'POST', headers: request.headers, body });
  }

  throw new Error('Configure KERNEL_SERVICE or KERNEL_URL');
}

function bearerToken(header: string | undefined): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(header ?? '');
  return match?.[1]?.trim() || null;
}

function kernelErrorStatus(code: string | undefined): number {
  if (code === 'UNAUTHENTICATED') return 401;
  if (code === 'FORBIDDEN') return 403;
  if (code === 'INVALID_MESSAGE' || code === 'INVALID_JSON') return 400;
  return 500;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export { app, createEnvelope };
export default app;
