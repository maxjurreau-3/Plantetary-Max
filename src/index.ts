import { Hono } from 'hono';
import { KernelDO, type KernelEnvelope } from './kernel';

type Bindings = {
  KERNEL_DO: DurableObjectNamespace;
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

app.get('/', (c) => {
  const mode = escapeHtml(c.env.PLANETARY_MODE);
  const umbrella = escapeHtml(c.env.UMBRELLA_ENFORCEMENT);
  const moduleName = escapeHtml(c.env.MAXOS_MODULE);
  return c.html(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Planetary-Max</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      * { box-sizing: border-box; }
      body { min-height: 100vh; margin: 0; display: grid; place-items: center; color: #e8f5ff; background: radial-gradient(circle at 20% 0%, #17304c 0, #080d16 38%, #020408 78%); }
      main { width: min(760px, calc(100% - 32px)); }
      .eyebrow { color: #67d6ff; font: 700 12px/1.2 ui-monospace, monospace; letter-spacing: .18em; text-transform: uppercase; }
      h1 { margin: 10px 0 8px; font-size: clamp(40px, 8vw, 76px); letter-spacing: -.06em; }
      .subtitle { max-width: 600px; margin: 0 0 28px; color: #91a9ba; font-size: 18px; }
      .surface { border: 1px solid #28445b; border-radius: 18px; padding: 22px; background: linear-gradient(145deg, rgba(14,27,42,.92), rgba(5,10,18,.9)); box-shadow: 0 28px 80px #0009, inset 0 1px #65d6ff20; }
      dl { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 0 0 22px; }
      dl div { padding: 13px; border: 1px solid #1e3548; border-radius: 10px; background: #07111d; }
      dt { color: #68869c; font: 700 10px ui-monospace, monospace; letter-spacing: .12em; text-transform: uppercase; }
      dd { margin: 6px 0 0; color: #bdeaff; font: 14px ui-monospace, monospace; overflow-wrap: anywhere; }
      a { display: inline-flex; padding: 12px 16px; border-radius: 9px; color: #031018; background: #65d6ff; font-weight: 800; text-decoration: none; }
      a:hover { background: #a1e8ff; }
      @media (max-width: 600px) { dl { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <main>
      <div class="eyebrow">Portal-OS Worker</div>
      <h1>Planetary-Max</h1>
      <p class="subtitle">The Planetary-Max root surface, backed by the local Portal-OS durable kernel.</p>
      <section class="surface">
        <dl>
          <div><dt>Mode</dt><dd>${mode}</dd></div>
          <div><dt>Umbrella</dt><dd>${umbrella}</dd></div>
          <div><dt>Module</dt><dd>${moduleName}</dd></div>
        </dl>
        <a href="/max-os-1">Open MAX-OS-1 console →</a>
      </section>
    </main>
  </body>
</html>`);
});

app.get('/max-os-1', (c) => {
  const mode = escapeHtml(c.env.PLANETARY_MODE);
  const umbrella = escapeHtml(c.env.UMBRELLA_ENFORCEMENT);
  const moduleName = escapeHtml(c.env.MAXOS_MODULE);
  return c.html(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>MAX-OS-1 console</title>
    <style>
      :root { color-scheme: dark; --cyan: #63ddff; --line: #253849; --panel: rgba(7,15,25,.94); font-family: "SFMono-Regular", Consolas, monospace; }
      * { box-sizing: border-box; }
      body { height: 100vh; margin: 0; display: flex; flex-direction: column; overflow: hidden; color: #d8edf7; background: radial-gradient(circle at 50% -20%, #16314e, #050911 52%, #010204); }
      header { min-height: 58px; padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 1px solid var(--line); background: #050a11e8; }
      h1 { margin: 0 0 3px; font-size: 14px; letter-spacing: .08em; text-transform: uppercase; }
      .meta { color: #6f8b9e; font-size: 11px; }
      header a { color: var(--cyan); font-size: 12px; text-decoration: none; }
      #console { flex: 1; min-height: 0; display: flex; gap: 10px; padding: 10px; }
      .panel { min-width: 0; display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); transition: flex .4s ease, border-color .3s, box-shadow .3s, transform .3s; }
      .panel.active { border-color: #63ddff70; box-shadow: 0 0 24px #21bfe526; transform: translateY(-1px); }
      .panel-head { padding: 9px 11px; display: flex; justify-content: space-between; border-bottom: 1px solid var(--line); color: #7390a3; font-size: 10px; letter-spacing: .12em; text-transform: uppercase; }
      .state { color: var(--cyan); letter-spacing: 0; text-transform: none; }
      .panel-body { flex: 1; min-height: 0; overflow: auto; padding: 10px; font-size: 12px; line-height: 1.5; }
      #terminal-output { white-space: pre-wrap; overflow-wrap: anywhere; }
      .terminal-line { margin-bottom: 5px; }
      .prompt { color: var(--cyan); }
      .system { color: #7e99aa; }
      .error { color: #ff7189; }
      .input-row { display: flex; gap: 7px; padding: 10px; border-top: 1px solid var(--line); }
      input { min-width: 0; flex: 1; border: 1px solid #29445a; border-radius: 6px; padding: 8px 9px; color: #e4f7ff; background: #030811; font: inherit; }
      button { border: 0; border-radius: 6px; padding: 8px 12px; color: #041018; background: var(--cyan); font-weight: 800; cursor: pointer; }
      .inspector { margin-bottom: 8px; border: 1px solid #1e3345; border-radius: 7px; background: #040a12; }
      .inspector h2 { margin: 0; padding: 7px 8px; border-bottom: 1px solid #1e3345; color: #6f8da1; font-size: 10px; letter-spacing: .1em; text-transform: uppercase; }
      pre { margin: 0; padding: 8px; white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; color: #bdd7e4; }
      .log { margin-bottom: 7px; padding-bottom: 7px; border-bottom: 1px solid #172837; overflow-wrap: anywhere; }
      .log-meta { color: #607d91; font-size: 10px; }
      .log-info { color: #a8dff1; } .log-warn { color: #ffd075; } .log-error { color: #ff7189; }
      .quantum { position: relative; }
      .quantum::after { content: ""; position: absolute; inset: 0; pointer-events: none; opacity: .16; background: repeating-linear-gradient(0deg, transparent 0 3px, #54d8ff12 4px); }
      @media (max-width: 820px) { body { height: auto; min-height: 100vh; overflow: auto; } #console { flex-direction: column; } .panel { min-height: 360px; } }
    </style>
  </head>
  <body>
    <header>
      <div><h1>MAX-OS-1 console · quantum triple-panel</h1><div class="meta">Portal-OS Worker · mode ${mode} · umbrella ${umbrella} · module ${moduleName}</div></div>
      <a href="/">← Planetary-Max</a>
    </header>
    <main id="console" class="quantum">
      <section id="terminal-panel" class="panel active" style="flex:1.2">
        <div class="panel-head"><span>Terminal</span><span id="terminal-state" class="state">idle</span></div>
        <div id="terminal-output" class="panel-body"></div>
        <div class="input-row"><input id="terminal-input" aria-label="Kernel command" autocomplete="off"><button id="terminal-send">Send</button></div>
      </section>
      <section id="inspector-panel" class="panel" style="flex:1">
        <div class="panel-head"><span>Inspector</span><span id="inspector-state" class="state">syncing</span></div>
        <div class="panel-body">
          <div class="inspector"><h2>Universe</h2><pre id="universe-inspector">Loading durable state…</pre></div>
          <div class="inspector"><h2>Umbrella governance</h2><pre id="umbrella-inspector">Loading governance…</pre></div>
          <div class="inspector"><h2>Registries</h2><pre id="registry-inspector">Loading identities and modules…</pre></div>
        </div>
      </section>
      <section id="logs-panel" class="panel" style="flex:.8">
        <div class="panel-head"><span>Kernel logs</span><span id="logs-state" class="state">durable</span></div>
        <div id="logs-output" class="panel-body"></div>
      </section>
    </main>
    <script>
      const elements = {
        terminal: document.getElementById('terminal-output'), input: document.getElementById('terminal-input'),
        send: document.getElementById('terminal-send'), terminalState: document.getElementById('terminal-state'),
        universe: document.getElementById('universe-inspector'), umbrella: document.getElementById('umbrella-inspector'),
        registry: document.getElementById('registry-inspector'), inspectorState: document.getElementById('inspector-state'),
        logs: document.getElementById('logs-output'), logsState: document.getElementById('logs-state'),
        panels: [document.getElementById('terminal-panel'), document.getElementById('inspector-panel'), document.getElementById('logs-panel')]
      };
      const history = [];
      let historyIndex = 0;
      let lastState = null;

      function terminalLine(text, kind) {
        const line = document.createElement('div');
        line.className = 'terminal-line ' + (kind || '');
        line.textContent = text;
        elements.terminal.appendChild(line);
        elements.terminal.scrollTop = elements.terminal.scrollHeight;
      }

      function renderLogs(logs) {
        elements.logs.replaceChildren();
        (logs || []).slice(-40).reverse().forEach(function (entry) {
          const row = document.createElement('div');
          row.className = 'log log-' + entry.level;
          const meta = document.createElement('div');
          meta.className = 'log-meta';
          meta.textContent = '#' + entry.sequence + ' · ' + entry.event + ' · ' + entry.timestamp;
          const message = document.createElement('div');
          message.textContent = entry.message;
          row.append(meta, message);
          elements.logs.appendChild(row);
        });
        elements.logsState.textContent = String((logs || []).length) + ' retained';
      }

      function applyQuantumLayout(state) {
        const universe = state && state.universe ? state.universe : {};
        const kernel = state && state.kernel ? state.kernel : {};
        const tickPhase = Number(universe.tick || 0) % 13 / 13;
        const registryMass = state && state.registry ? (state.registry.identities.length + state.registry.modules.length) : 0;
        const load = Math.min(1, Number(kernel.logCount || 0) / 200);
        elements.panels[0].style.flex = (1.08 + tickPhase * .55).toFixed(2);
        elements.panels[1].style.flex = (1 + Math.min(.5, registryMass / 24)).toFixed(2);
        elements.panels[2].style.flex = (.78 + load * .65).toFixed(2);
        const active = load > .72 ? 2 : tickPhase > .62 ? 1 : 0;
        elements.panels.forEach(function (panel, index) { panel.classList.toggle('active', index === active); });
      }

      function inspectState(response) {
        const result = response && response.result ? response.result : {};
        if (result.universe) elements.universe.textContent = JSON.stringify(result.universe, null, 2);
        if (result.umbrella) elements.umbrella.textContent = JSON.stringify(result.umbrella, null, 2);
        if (result.registry) elements.registry.textContent = JSON.stringify(result.registry, null, 2);
        if (result.kernel && result.kernel.logs) renderLogs(result.kernel.logs);
        if (result.kernel || result.registry) {
          lastState = result;
          applyQuantumLayout(result);
        }
        elements.inspectorState.textContent = 'sequence ' + String(response.sequence || 0);
      }

      async function sendEnvelope(type, payload, silent) {
        elements.terminalState.textContent = 'running';
        const started = performance.now();
        try {
          const response = await fetch('/api/kernel/message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer max-os-1-console' },
            body: JSON.stringify({ type: type, payload: payload || {}, governanceContext: { surface: 'max-os-1-console' } })
          });
          const body = await response.json();
          if (!silent) terminalLine(JSON.stringify(body, null, 2), body.ok === false ? 'error' : '');
          inspectState(body);
          elements.terminalState.textContent = body.ok === false ? 'error' : 'idle';
          elements.logsState.textContent = Math.round(performance.now() - started) + 'ms';
          return body;
        } catch (error) {
          terminalLine('Kernel bridge error: ' + error.message, 'error');
          elements.terminalState.textContent = 'error';
          return null;
        }
      }

      async function refreshInspectors() {
        const state = await sendEnvelope('universe.state', {}, true);
        const umbrella = await sendEnvelope('universe.umbrella', {}, true);
        if (state) inspectState(state);
        if (umbrella) inspectState(umbrella);
      }

      function parseCommand(value) {
        const command = value.trim();
        const split = command.indexOf(' ');
        const type = split < 0 ? command : command.slice(0, split);
        const source = split < 0 ? '' : command.slice(split + 1).trim();
        const payload = source ? JSON.parse(source) : {};
        if (!payload || Array.isArray(payload) || typeof payload !== 'object') throw new Error('Payload must be a JSON object');
        return { type: type, payload: payload };
      }

      async function runCommand(value) {
        const raw = value.trim();
        if (!raw) return;
        history.push(raw); historyIndex = history.length; elements.input.value = '';
        terminalLine('max-os-1> ' + raw, 'prompt');
        if (raw === 'clear') { elements.terminal.replaceChildren(); return; }
        if (raw === 'help') {
          terminalLine('kernel.ping · universe.state · universe.umbrella · universe.tick {"ticks":1,"changes":{"resources":-1}} · logs.tail · clear', 'system');
          return;
        }
        if (raw === 'logs.tail') { if (lastState && lastState.kernel) renderLogs(lastState.kernel.logs); else await refreshInspectors(); return; }
        try {
          const command = parseCommand(raw);
          await sendEnvelope(command.type, command.payload, false);
          if (command.type === 'universe.tick') await refreshInspectors();
        } catch (error) { terminalLine(error.message, 'error'); elements.terminalState.textContent = 'error'; }
      }

      elements.send.addEventListener('click', function () { runCommand(elements.input.value); });
      elements.input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') runCommand(elements.input.value);
        if (event.key === 'ArrowUp' && history.length) { event.preventDefault(); historyIndex = Math.max(0, historyIndex - 1); elements.input.value = history[historyIndex] || ''; }
        if (event.key === 'ArrowDown' && history.length) { event.preventDefault(); historyIndex = Math.min(history.length, historyIndex + 1); elements.input.value = history[historyIndex] || ''; }
      });
      terminalLine('MAX-OS-1 console online · KernelDO link established', 'system');
      terminalLine('Type help for kernel commands.', 'system');
      refreshInspectors();
    </script>
  </body>
</html>`);
});

app.get('/health', (c) =>
  c.json({ status: 'ok', service: 'Portal-OS Worker', kernel: 'KernelDO' })
);

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

  if (!isRecord(body) || typeof body.type !== 'string' || !body.type.trim()) {
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
  if (body.governanceContext !== undefined && !isRecord(body.governanceContext)) {
    return c.json(
      { ok: false, error: { code: 'INVALID_MESSAGE', message: 'governanceContext must be an object' } },
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

app.get('/universe/state', (c) =>
  universeRequest(c.env, c.req.header('Authorization'), 'universe.state', {})
);

app.get('/universe/umbrella', (c) =>
  universeRequest(c.env, c.req.header('Authorization'), 'universe.umbrella', {})
);

app.post('/universe/tick', async (c) => {
  let payload: Record<string, unknown> = {};
  if ((c.req.header('Content-Type') ?? '').includes('application/json')) {
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

function universeRequest(
  env: Bindings,
  authorization: string | undefined,
  type: string,
  payload: Record<string, unknown>
): Promise<Response> {
  const identity = bearerToken(authorization);
  if (!identity) {
    return Promise.resolve(
      Response.json(
        { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Bearer token required' } },
        { status: 401 }
      )
    );
  }
  return kernelResponse(
    env,
    createEnvelope(type, payload, identity, { surface: 'worker-universe' })
  );
}

export function createEnvelope(
  type: string,
  payload: Record<string, unknown>,
  identity: string,
  governanceContext: Record<string, unknown>
): KernelEnvelope {
  return { id: crypto.randomUUID(), type, payload, identity, governanceContext };
}

async function kernelResponse(env: Bindings, envelope: KernelEnvelope): Promise<Response> {
  try {
    const stub = env.KERNEL_DO.getByName('planetary-max-kernel');
    const response = await stub.fetch('http://kernel-do/api/kernel/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope)
    });
    const result = await response.json<KernelResult>();
    return Response.json(result, { status: response.status });
  } catch (error) {
    console.error('Portal-OS Worker to KernelDO bridge failed', error);
    return Response.json(
      { ok: false, error: { code: 'KERNEL_UNAVAILABLE', message: 'KernelDO bridge unavailable' } },
      { status: 503 }
    );
  }
}

function bearerToken(header: string | undefined): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(header ?? '');
  return match?.[1]?.trim() || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return entities[character];
  });
}

export { KernelDO };
export default app;
