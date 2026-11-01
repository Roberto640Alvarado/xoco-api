// Página de inicio de sesión del conector (HTML del servidor, sin depender
// del panel): la abre Claude/ChatGPT al conectar. Todo lo que viene del
// cliente se escapa.

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string);

interface LoginPageOptions {
  clientName: string;
  /** Parámetros OAuth que viajan ocultos en el formulario. */
  params: Record<string, string>;
  email?: string;
  error?: string;
}

const STYLE = `
  :root { color-scheme: light dark; --bg:#f6f1ec; --card:#ffffff; --ink:#2a1a12; --muted:#7a6a60; --brand:#4a2c1d; --line:#e6dcd3; --danger:#b91c1c; }
  @media (prefers-color-scheme: dark) { :root { --bg:#14100d; --card:#1f1915; --ink:#f3ece6; --muted:#b3a59a; --brand:#d9b89c; --line:#3a2f28; } }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; padding:16px; background:var(--bg); color:var(--ink); font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif; }
  main { width:100%; max-width:400px; background:var(--card); border:1px solid var(--line); border-radius:20px; padding:28px; box-shadow:0 10px 30px rgb(0 0 0 / .08); }
  .brand { display:flex; align-items:center; gap:10px; font-weight:700; letter-spacing:.02em; }
  .dot { width:34px; height:34px; border-radius:10px; background:var(--brand); }
  h1 { font-size:20px; margin:20px 0 6px; }
  p { margin:0 0 16px; color:var(--muted); font-size:14px; }
  ul { margin:0 0 18px; padding-left:18px; color:var(--muted); font-size:14px; }
  label { display:block; font-size:13px; font-weight:600; margin:12px 0 6px; }
  input { width:100%; padding:11px 12px; border-radius:10px; border:1px solid var(--line); background:transparent; color:var(--ink); font-size:16px; }
  input:focus { outline:2px solid var(--brand); outline-offset:1px; }
  button { width:100%; margin-top:20px; padding:12px; border:0; border-radius:10px; background:var(--brand); color:var(--card); font-weight:700; font-size:16px; cursor:pointer; }
  .error { margin:14px 0 0; padding:10px 12px; border-radius:10px; background:rgb(185 28 28 / .1); color:var(--danger); font-size:14px; }
  small { display:block; margin-top:16px; color:var(--muted); font-size:12px; text-align:center; }
`;

export function renderLoginPage({ clientName, params, email = '', error }: LoginPageOptions): string {
  const hidden = Object.entries(params)
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
    .join('');
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Conectar con Xocolatísimo</title><link rel="icon" href="/favicon.ico"><style>${STYLE}</style></head>
<body><main>
  <div class="brand"><span class="dot" aria-hidden="true"></span>XOCOLATÍSIMO</div>
  <h1>Conectar ${escapeHtml(clientName)}</h1>
  <p>${escapeHtml(clientName)} podrá <strong>consultar</strong> los datos del panel y de Odoo con tu usuario. No podrá modificar nada.</p>
  <ul><li>Solo para usuarios Super admin y Finanzas. Solo consulta: no puede cambiar nada.</li><li>Puedes desconectarlo cuando quieras desde ${escapeHtml(clientName)}.</li></ul>
  <form method="post" action="/oauth/authorize">
    ${hidden}
    <label for="email">Correo</label>
    <input id="email" name="email" type="email" autocomplete="username" required value="${escapeHtml(email)}">
    <label for="password">Contraseña</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required>
    ${error ? `<div class="error" role="alert">${escapeHtml(error)}</div>` : ''}
    <button type="submit">Permitir acceso</button>
  </form>
  <small>Usa el mismo correo y contraseña del panel de Xocolatísimo.</small>
</main></body></html>`;
}

export function renderErrorPage(message: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>No se pudo conectar</title><style>${STYLE}</style></head>
<body><main><div class="brand"><span class="dot" aria-hidden="true"></span>XOCOLATÍSIMO</div>
<h1>No se pudo conectar</h1><p>${escapeHtml(message)}</p></main></body></html>`;
}
