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

// ROOT — Planetary‑Max identity surface
app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>Planetary‑Max</title>
        <style>
          body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            background: radial-gradient(circle at top, #151822 0, #050608 55%, #020305 100%);
            color: #e6e6e6;
            margin: 0;
            padding: 40px;
          }
          h1 {
            font-size: 2.4rem;
            margin-bottom: 8px;
          }
          .subtitle {
            color: #9a9a9a;
            margin-bottom: 24px;
          }
          .card {
            background: rgba(10, 12, 18, 0.9);
            border-radius: 12px;
            padding: 20px;
            border: 1px solid #262a36;
            max-width: 520px;
          }
          .row {
            margin-bottom: 8px;
          }
          .label {
            color: #9a9a9a;
            font-size: 0.85rem;
          }
          .value {
            font-size: 0.95rem;
          }
          a {
            color: #4da3ff;
            text-decoration: none;
          }
          a:hover {
            text-decoration: underline;
          }
          .nav {
            margin-top: 24px;
          }
        </style>
      </head>
      <body>
        <h1>Planetary‑Max</h1>
        <div class="subtitle">Worker universe surface · MAX‑OS‑1 subsystem available</div>

        <div class="card">
          <div class="row">
            <div class="label">Worker</div>
            <div class="value">planetary-max</div>
          </div>
          <div class="row">
            <div class="label">Mode</div>
            <div class="value">${c.env.PLANETARY_MODE}</div>
          </div>
          <div class="row">
            <div class="label">Umbrella</div>
            <div class="value">${c.env.UMBRELLA_ENFORCEMENT}</div>
          </div>
          <div class="row">
            <div class="label">Module</div>
            <div class="value">${c.env.MAXOS_MODULE}</div>
          </div>
        </div>

        <div class="nav">
          <a href="/max-os-1">Open MAX‑OS‑1 Console →</a>
        </div>
      </body>
    </html>
  `);
});

// MAX‑OS‑1 full‑screen triple‑panel console
app.get('/max-os-1', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>MAX‑OS‑1 Console</title>
        <style>
          :root {
            color-scheme: dark;
          }
          * {
            box-sizing: border-box;
          }
          body {
            margin: 0;
            padding: 0;
            font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
            background: radial-gradient(circle at top, #151822 0, #050608 55%, #020305 100%);
            color: #e6e6e6;
            height: 100vh;
            display: flex;
            flex-direction: column;
          }
          .chrome {
            padding: 10px 16px;
            border-bottom: 1px solid #262a36;
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: rgba(5, 6, 8, 0.95);
          }
          .title {
            font-size: 0.95rem;
          }
          .meta {
            font-size: 0.8rem;
            color: #9a9a9a;
          }
          .chrome a {
            color: #4da3ff;
            text-decoration: none;
            font-size: 0.8rem;
          }
          .chrome a:hover {
            text-decoration: underline;
          }
          .root {
            flex: 1;
            display: flex;
            padding: 10px;
            gap: 10px;
            overflow: hidden;
          }
          .panel {
            background: rgba(10, 12, 18, 0.9);
            border-radius: 10px;
            border: 1px solid #262a36;
            display: flex;
            flex-direction: column;
            min-width: 0;
            overflow: hidden;
            transition: flex 0.35s ease, transform 0.25s ease, box-shadow 0.25s ease;
          }
          .panel-header {
            padding: 8px 10px;
            border-bottom: 1px solid #262a36;
            font-size: 0.8rem;
            color: #9a9a9a;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .panel-header span.label {
            text-transform: uppercase;
            letter-spacing: 0.08em;
            font-size: 0.75rem;
          }
          .panel-header span.state {
            font-size: 0.75rem;
          }
          .panel-body {
            flex: 1;
            padding: 8px 10px;
            overflow: auto;
            font-size: 0.8rem;
            line-height: 1.4;
          }
          .panel-body pre {
            margin: 0;
            white-space: pre-wrap;
            word-wrap: break-word;
          }
          .panel-body code {
            font-family: inherit;
          }
          .terminal-output {
            margin-bottom: 8px;
          }
          .line {
            margin-bottom: 3px;
          }
          .line .prompt {
            color: #4da3ff;
          }
          .line .error {
            color: #ff4d6a;
          }
          .line .system {
            color: #9a9a9a;
          }
          .input-row {
            display: flex;
            gap: 6px;
            padding-top: 6px;
            border-top: 1px solid #262a36;
          }
          .input-row input[type="text"] {
            flex: 1;
            background: #050608;
            border: 1px solid #30323a;
            border-radius: 4px;
            padding: 5px 7px;
            color: #e6e6e6;
            font-family: inherit;
            font-size: 0.8rem;
          }
          .input-row button {
            background: #4da3ff;
            border: none;
            border-radius: 4px;
            padding: 5px 10px;
            color: #050608;
            font-weight: 600;
            cursor: pointer;
            font-size: 0.8rem;
          }
          .input-row button:disabled {
            opacity: 0.6;
            cursor: default;
          }
          .hint {
            font-size: 0.7rem;
            color: #777b88;
            margin-top: 4px;
          }
          .inspect-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            grid-auto-rows: minmax(60px, auto);
            gap: 6px;
          }
          .inspect-card {
            border-radius: 6px;
            border: 1px solid #262a36;
            padding: 6px 7px;
            background: rgba(8, 9, 13, 0.9);
            font-size: 0.75rem;
          }
          .inspect-card .label {
            color: #9a9a9a;
            font-size: 0.7rem;
            margin-bottom: 2px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
          }
          .inspect-card pre {
            margin: 0;
            white-space: pre-wrap;
            word-wrap: break-word;
          }
          .log-line {
            margin-bottom: 3px;
            font-size: 0.75rem;
          }
          .log-line .tag {
            color: #777b88;
          }
          .log-line .error {
            color: #ff4d6a;
          }
          .log-line .ok {
            color: #4da3ff;
          }
          .panel.highlight {
            box-shadow: 0 0 0 1px #4da3ff33, 0 0 18px #4da3ff33;
            transform: translateY(-1px);
          }
        </style>
      </head>
      <body>
        <div class="chrome">
          <div>
            <div class="title">MAX‑OS‑1 Console · Triple‑Panel</div>
            <div class="meta">
              Mode: ${c.env.PLANETARY_MODE} · Umbrella: ${c.env.UMBRELLA_ENFORCEMENT} · Module: ${c.env.MAXOS_MODULE}
            </div>
          </div>
          <div>
            <a href="/">← Planetary‑Max</a>
          </div>
        </div>

        <div class="root">
          <!-- LEFT: TERMINAL -->
          <div class="panel" id="panel-terminal" style="flex: 1.2;">
            <div class="panel-header">
              <span class="label">Terminal</span>
              <span class="state" id="terminal-state">idle</span>
            </div>
            <div class="panel-body">
              <div id="terminal-output" class="terminal-output"></div>
              <div class="input-row">
                <input id="terminal-input" type="text" placeholder='command [optional JSON payload]' autocomplete="off" />
                <button id="terminal-send">SEND</button>
              </div>
              <div class="hint">
                ENTER to send · ↑/↓ for history · try: <code>help</code>, <code>universe.state</code>, <code>universe.umbrella</code>, <code>universe.tick {"ticks":1}</code>
              </div>
            </div>
          </div>

          <!-- CENTER: INSPECTORS -->
          <div class="panel" id="panel-inspect" style="flex: 1;">
            <div class="panel-header">
              <span class="label">Inspectors</span>
              <span class="state" id="inspect-state">sync: universe.tick</span>
            </div>
            <div class="panel-body">
              <div class="inspect-grid">
                <div class="inspect-card">
                  <div class="label">Universe</div>
                  <pre id="inspect-universe">waiting for universe.state…</pre>
                </div>
                <div class="inspect-card">
                  <div class="label">Umbrella</div>
                  <pre id="inspect-umbrella">waiting for universe.umbrella…</pre>
                </div>
                <div class="inspect-card">
                  <div class="label">Identity</div>
                  <pre id="inspect-identity">identity: max-os-1-console</pre>
                </div>
                <div class="inspect-card">
                  <div class="label">Module</div>
                  <pre id="inspect-module">module: ${c.env.MAXOS_MODULE}</pre>
                </div>
                <div class="inspect-card">
                  <div class="label">Environment</div>
                  <pre id="inspect-env">mode: ${c.env.PLANETARY_MODE}\numbrella: ${c.env.UMBRELLA_ENFORCEMENT}</pre>
                </div>
              </div>
            </div>
          </div>

          <!-- RIGHT: LOGS -->
          <div class="panel" id="panel-logs" style="flex: 0.8;">
            <div class="panel-header">
              <span class="label">Logs</span>
              <span class="state" id="logs-state">kernel bridge</span>
            </div>
            <div class="panel-body" id="logs-output">
              <div class="log-line"><span class="tag">[boot]</span> MAX‑OS‑1 console online · surface=max-os-1-console</div>
              <div class="log-line"><span class="tag">[hint]</span> use <code>help</code> for built‑in commands</div>
            </div>
          </div>
        </div>

        <script>
          const terminalOutputEl = document.getElementById('terminal-output');
          const terminalInputEl = document.getElementById('terminal-input');
          const terminalSendEl = document.getElementById('terminal-send');
          const terminalStateEl = document.getElementById('terminal-state');

          const inspectUniverseEl = document.getElementById('inspect-universe');
          const inspectUmbrellaEl = document.getElementById('inspect-umbrella');
          const inspectIdentityEl = document.getElementById('inspect-identity');
          const inspectModuleEl = document.getElementById('inspect-module');
          const inspectEnvEl = document.getElementById('inspect-env');
          const inspectStateEl = document.getElementById('inspect-state');

          const logsOutputEl = document.getElementById('logs-output');
          const logsStateEl = document.getElementById('logs-state');

          const panelTerminalEl = document.getElementById('panel-terminal');
          const panelInspectEl = document.getElementById('panel-inspect');
          const panelLogsEl = document.getElementById('panel-logs');

          const history = [];
          let historyIndex = -1;

          function appendTerminalLine(text, opts = {}) {
            const div = document.createElement('div');
            div.className = 'line';
            if (opts.prompt) {
              const span = document.createElement('span');
              span.className = 'prompt';
              span.textContent = opts.prompt + ' ';
              div.appendChild(span);
              div.appendChild(document.createTextNode(text));
            } else if (opts.error) {
              const span = document.createElement('span');
              span.className = 'error';
              span.textContent = text;
              div.appendChild(span);
            } else if (opts.system) {
              const span = document.createElement('span');
              span.className = 'system';
              span.textContent = text;
              div.appendChild(span);
            } else {
              div.textContent = text;
            }
            terminalOutputEl.appendChild(div);
            terminalOutputEl.scrollTop = terminalOutputEl.scrollHeight;
          }

          function appendLogLine(text, opts = {}) {
            const div = document.createElement('div');
            div.className = 'log-line';
            const tagSpan = document.createElement('span');
            tagSpan.className = 'tag';
            tagSpan.textContent = '[' + (opts.tag || 'log') + '] ';
            div.appendChild(tagSpan);
            const msgSpan = document.createElement('span');
            if (opts.error) msgSpan.className = 'error';
            if (opts.ok) msgSpan.className = 'ok';
            msgSpan.textContent = text;
            div.appendChild(msgSpan);
            logsOutputEl.appendChild(div);
            logsOutputEl.scrollTop = logsOutputEl.scrollHeight;
          }

          function setPanelHighlight(panelEl) {
            [panelTerminalEl, panelInspectEl, panelLogsEl].forEach(p => {
              if (p === panelEl) p.classList.add('highlight');
              else p.classList.remove('highlight');
            });
          }

          function applyQuantumLayout(signal) {
            // signal: { entropy, strictness, moduleWeight, kernelLoad }
            const entropy = signal.entropy ?? 0.5;
            const strictness = signal.strictness ?? 0.5;
            const moduleWeight = signal.moduleWeight ?? 0.5;
            const kernelLoad = signal.kernelLoad ?? 0.5;

            const terminalFlex = 1 + entropy * 0.6 + kernelLoad * 0.4;
            const inspectFlex = 1 + moduleWeight * 0.5 + strictness * 0.3;
            const logsFlex = 0.7 + kernelLoad * 0.6 + strictness * 0.2;

            panelTerminalEl.style.flex = terminalFlex.toFixed(2);
            panelInspectEl.style.flex = inspectFlex.toFixed(2);
            panelLogsEl.style.flex = logsFlex.toFixed(2);

            if (kernelLoad > 0.7) {
              logsStateEl.textContent = 'kernel: high load';
              setPanelHighlight(panelLogsEl);
            } else if (entropy > 0.7) {
              inspectStateEl.textContent = 'sync: high entropy';
              setPanelHighlight(panelInspectEl);
            } else {
              logsStateEl.textContent = 'kernel bridge';
              inspectStateEl.textContent = 'sync: universe.tick';
              setPanelHighlight(panelTerminalEl);
            }
          }

          function parseCommand(raw) {
            const trimmed = raw.trim();
            if (!trimmed) return null;
            const spaceIdx = trimmed.indexOf(' ');
            if (spaceIdx === -1) {
              return { type: trimmed, payload: {} };
            }
            const type = trimmed.slice(0, spaceIdx).trim();
            const payloadStr = trimmed.slice(spaceIdx + 1).trim();
            if (!payloadStr) return { type, payload: {} };
            try {
              const payload = JSON.parse(payloadStr);
              return { type, payload };
            } catch (e) {
              throw new Error('payload JSON parse error: ' + e.message);
            }
          }

          function isBuiltIn(type) {
            return [
              'help',
              'clear',
              'system.identity',
              'system.env',
              'kernel.ping',
              'universe.state',
              'universe.umbrella',
              'universe.tick',
              'logs.tail'
            ].includes(type);
          }

          async function runBuiltIn(type, payload) {
            if (type === 'help') {
              appendTerminalLine('built‑in commands:', { system: true });
              appendTerminalLine('  help                · show this help', { system: true });
              appendTerminalLine('  clear               · clear terminal output', { system: true });
              appendTerminalLine('  system.identity     · show console identity', { system: true });
              appendTerminalLine('  system.env          · show environment', { system: true });
              appendTerminalLine('  kernel.ping         · send ping to kernel', { system: true });
              appendTerminalLine('  universe.state      · fetch universe state', { system: true });
              appendTerminalLine('  universe.umbrella   · fetch umbrella state', { system: true });
              appendTerminalLine('  universe.tick {...} · tick universe', { system: true });
              appendTerminalLine('  logs.tail           · show recent logs', { system: true });
              return;
            }
            if (type === 'clear') {
              terminalOutputEl.innerHTML = '';
              appendTerminalLine('terminal cleared', { system: true });
              return;
            }
            if (type === 'system.identity') {
              appendTerminalLine('identity: max-os-1-console', { system: true });
              inspectIdentityEl.textContent = 'identity: max-os-1-console';
              return;
            }
            if (type === 'system.env') {
              appendTerminalLine(inspectEnvEl.textContent, { system: true });
              return;
            }
            if (type === 'logs.tail') {
              appendTerminalLine('logs.tail not yet streaming; showing last 5 log lines:', { system: true });
              const lines = Array.from(logsOutputEl.querySelectorAll('.log-line'));
              const tail = lines.slice(-5);
              tail.forEach((line) => {
                appendTerminalLine(line.textContent || '', { system: true });
              });
              return;
            }
            // kernel-backed built-ins
            if (type === 'kernel.ping') {
              await sendKernelMessage('kernel.ping', payload || {});
              return;
            }
            if (type === 'universe.state') {
              const res = await sendKernelMessage('universe.state', payload || {});
              if (res) {
                inspectUniverseEl.textContent = JSON.stringify(res, null, 2);
                applyQuantumLayout({
                  entropy: Math.random() * 0.4 + 0.4,
                  strictness: Math.random() * 0.3 + 0.3,
                  moduleWeight: Math.random() * 0.5 + 0.25,
                  kernelLoad: Math.random() * 0.3 + 0.2
                });
              }
              return;
            }
            if (type === 'universe.umbrella') {
              const res = await sendKernelMessage('universe.umbrella', payload || {});
              if (res) {
                inspectUmbrellaEl.textContent = JSON.stringify(res, null, 2);
                applyQuantumLayout({
                  entropy: Math.random() * 0.3 + 0.3,
                  strictness: Math.random() * 0.6 + 0.2,
                  moduleWeight: Math.random() * 0.4 + 0.3,
                  kernelLoad: Math.random() * 0.3 + 0.2
                });
              }
              return;
            }
            if (type === 'universe.tick') {
              const res = await sendKernelMessage('universe.tick', payload || {});
              if (res) {
                appendTerminalLine('universe.tick applied', { system: true });
                // after tick, refresh inspectors
                await runBuiltIn('universe.state', {});
                await runBuiltIn('universe.umbrella', {});
              }
              return;
            }
          }

          async function sendKernelMessage(type, payload) {
            try {
              const started = performance.now();
              logsStateEl.textContent = 'kernel: sending…';
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
              const elapsed = performance.now() - started;
              const json = await res.json();
              const ok = json.ok !== false;
              appendTerminalLine('status ' + res.status + ' · ok=' + ok);
              appendTerminalLine(JSON.stringify(json, null, 2));
              appendLogLine(
                'type=' + type + ' · status=' + res.status + ' · ' + elapsed.toFixed(0) + 'ms',
                { tag: 'kernel', ok, error: !ok }
              );
              logsStateEl.textContent = 'kernel bridge';
              applyQuantumLayout({
                entropy: Math.random(),
                strictness: Math.random(),
                moduleWeight: Math.random(),
                kernelLoad: Math.min(1, elapsed / 800)
              });
              return json;
            } catch (e) {
              appendTerminalLine('kernel bridge error: ' + e.message, { error: true });
              appendLogLine('bridge error: ' + e.message, { tag: 'error', error: true });
              logsStateEl.textContent = 'kernel: error';
              applyQuantumLayout({
                entropy: 0.2,
                strictness: 0.8,
                moduleWeight: 0.5,
                kernelLoad: 0.9
              });
              return null;
            }
          }

          async function handleCommand(raw) {
            const trimmed = raw.trim();
            if (!trimmed) return;
            history.push(trimmed);
            historyIndex = history.length;
            appendTerminalLine(trimmed, { prompt: 'max-os-1>' });
            terminalInputEl.value = '';
            terminalStateEl.textContent = 'running';
            setPanelHighlight(panelTerminalEl);

            let parsed;
            try {
              parsed = parseCommand(trimmed);
              if (!parsed) {
                terminalStateEl.textContent = 'idle';
                return;
              }
            } catch (e) {
              appendTerminalLine(e.message, { error: true });
              terminalStateEl.textContent = 'error';
              return;
            }

            const { type, payload } = parsed;

            if (isBuiltIn(type)) {
              await runBuiltIn(type, payload);
              terminalStateEl.textContent = 'idle';
              return;
            }

            await sendKernelMessage(type, payload);
            terminalStateEl.textContent = 'idle';
          }

          terminalSendEl.addEventListener('click', () => {
            handleCommand(terminalInputEl.value);
          });

          terminalInputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              handleCommand(terminalInputEl.value);
            } else if (e.key === 'ArrowUp') {
              if (history.length === 0) return;
              historyIndex = Math.max(0, historyIndex - 1);
              terminalInputEl.value = history[historyIndex] || '';
              e.preventDefault();
            } else if (e.key === 'ArrowDown') {
              if (history.length === 0) return;
              historyIndex = Math.min(history.length, historyIndex + 1);
              terminalInputEl.value = history[historyIndex] || '';
              e.preventDefault();
            }
          });

          // initial inspectors sync
          (async () => {
            appendTerminalLine('max-os-1@kernel boot: console online', { system: true });
            await runBuiltIn('universe.state', {});
            await runBuiltIn('universe.umbrella', {});
          })();
        </script>
      </body>
    </html>
  `);
});

// health
app.get('/health', (c) => c.json({ status: 'ok', service: 'portal-os-worker' }));

// kernel bridge API
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

// universe helpers
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
  const match = /^Bearer\\s+(.+)$/i.exec(header ?? '');
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
