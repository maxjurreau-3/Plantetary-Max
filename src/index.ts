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
          <p><a href="/max-os-1">Open MAX‑OS‑1 UI →</a></p>
        </div>
      </body>
    </html>
  `);
});

// ⭐ MAX‑OS‑1 UI ROUTE
app.get('/max-os-1', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>MAX‑OS‑1 UI</title>
        <style>
