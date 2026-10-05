// SPDX-License-Identifier: MIT
// Server-rendered fallback shown when SSR throws before React can render.

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

export function renderErrorPage(reference?: string): string {
  const ref = reference
    ? `<p class="ref">Referencia: <code>${escapeHtml(reference)}</code></p>`
    : "";
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>La página no se pudo cargar</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #fafafa; color: #111; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: #4b5563; margin: 0 0 1.5rem; }
      .ref { margin: 0 0 1.5rem; font-size: 0.85rem; }
      code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.5rem 1rem; border-radius: 0.375rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #111; color: #fff; }
      .secondary { background: #fff; color: #111; border-color: #d1d5db; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Esta página no se pudo cargar</h1>
      <p>Algo ha fallado. Prueba a recargar o vuelve al inicio.</p>
      ${ref}
      <div class="actions">
        <button class="primary" onclick="location.reload()">Reintentar</button>
        <a class="secondary" href="/">Volver al inicio</a>
      </div>
    </div>
  </body>
</html>`;
}
