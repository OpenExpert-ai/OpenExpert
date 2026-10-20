// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";

// The SSR entrypoint is TanStack's; the mock stands in for h3 so the tests can
// send back exactly the bodies h3 produces when it swallows a throw.
const entry = vi.hoisted(() => ({ fetch: vi.fn() }));
const logged = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@tanstack/react-start/server-entry", () => ({
  default: { fetch: entry.fetch },
}));
vi.mock("./lib/logger.server", () => ({ logger: logged }));

import server from "./server";

const request = (path = "/") => new Request(`http://localhost:3000${path}`);

function respondWith(response: Response) {
  entry.fetch.mockResolvedValueOnce(response);
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const call = async () => {
  const res = await server.fetch(request(), undefined, undefined);
  return { res, body: await res.text() };
};

describe("server.fetch: respuesta normal", () => {
  it("deja pasar la respuesta y añade las cabeceras de seguridad y el request id", async () => {
    respondWith(new Response("ok", { status: 200 }));
    const { res, body } = await call();
    expect(res.status).toBe(200);
    expect(body).toBe("ok");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("x-request-id")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("cada petición lleva su propio request id", async () => {
    respondWith(new Response("a"));
    const first = await call();
    respondWith(new Response("b"));
    const second = await call();
    expect(first.res.headers.get("x-request-id")).not.toBe(second.res.headers.get("x-request-id"));
  });

  it("no toca los 4xx ni los 500 que no son el cuerpo de h3", async () => {
    respondWith(json({ error: "no encontrado" }, 404));
    const notFound = await call();
    expect(notFound.res.status).toBe(404);
    expect(notFound.body).toBe('{"error":"no encontrado"}');

    respondWith(json({ unhandled: false, message: "HTTPError" }, 500));
    const unhandledFalse = await call();
    expect(unhandledFalse.res.status).toBe(500);

    respondWith(json({ unhandled: true, message: "Otra cosa" }, 500));
    const otherMessage = await call();
    expect(otherMessage.res.status).toBe(500);
    expect(otherMessage.body).toContain("Otra cosa");
  });
});

describe('server.fetch: detector de cuerpo {"unhandled":true,"message":"HTTPError"}', () => {
  it("convierte el 500 JSON que h3 deja escapar en la página de error HTML", async () => {
    // Es el cuerpo exacto que produce h3 al tragarse un throw en un handler:
    // sin esto el navegador recibe un JSON con "HTTPError" y sin stack.
    respondWith(json({ status: 500, unhandled: true, message: "HTTPError" }, 500));
    const { res, body } = await call();
    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(body).toContain("Esta página no se pudo cargar");
    const requestId = res.headers.get("x-request-id")!;
    expect(body).toContain(requestId);
    expect(logged.error).toHaveBeenCalledWith("ssr.swallowed", expect.anything(), { requestId });
  });

  it("deja intacto un 500 de error si el cuerpo no es JSON, o es JSON inválido", async () => {
    respondWith(new Response("<html>boom</html>", { status: 500, headers: {} }));
    const html = await call();
    expect(html.res.status).toBe(500);
    expect(html.body).toBe("<html>boom</html>");

    respondWith(
      new Response("{no es json", { status: 500, headers: { "content-type": "application/json" } }),
    );
    const broken = await call();
    expect(broken.res.status).toBe(500);
    expect(broken.body).toBe("{no es json");

    respondWith(new Response("unhandled", { status: 500, headers: {} }));
    const noJsonContentType = await call();
    expect(noJsonContentType.body).toBe("unhandled");
  });

  it("añade la CSP solo en producción, también al 500 de h3", async () => {
    const previous = process.env["NODE_ENV"];
    process.env["NODE_ENV"] = "production";
    try {
      respondWith(json({ unhandled: true, message: "HTTPError" }, 500));
      const { res } = await call();
      expect(res.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
    } finally {
      if (previous === undefined) delete process.env["NODE_ENV"];
      else process.env["NODE_ENV"] = previous;
    }
  });
});

describe("server.fetch: excepciones", () => {
  it("convierte un throw del entrypoint en un 500 HTML sin filtrar el mensaje", async () => {
    entry.fetch.mockRejectedValueOnce(new Error("detalle interno con secreto"));
    const { res, body } = await call();
    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(body).toContain("Esta página no se pudo cargar");
    expect(body).not.toContain("detalle interno con secreto");
    expect(logged.error).toHaveBeenCalledWith(
      "ssr.unhandled",
      expect.any(Error),
      expect.objectContaining({ requestId: expect.any(String), path: "/" }),
    );
  });

  it("usa la ruta de la petición en el log del throw", async () => {
    entry.fetch.mockRejectedValueOnce(new Error("boom"));
    entry.fetch.mockResolvedValueOnce(new Response("ok"));
    const res = await server.fetch(request("/experts?x=1"), undefined, undefined);
    expect(res.status).toBe(500);
    expect(logged.error).toHaveBeenLastCalledWith(
      "ssr.unhandled",
      expect.any(Error),
      expect.objectContaining({ path: "/experts" }),
    );
  });
});

const ctx = {} as never;

const callWithHost = (url: string, host: string) =>
  server.fetch(new Request(url, { headers: { host } }), {}, ctx);

describe("server entry", () => {
  it("refuses a Host the server does not serve", async () => {
    const res = await callWithHost("http://evil.test:3000/api/backup", "evil.test:3000");
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("Forbidden");
    // The security headers still apply to the refusal.
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });

  it("does not refuse the loopback host before the handler runs", async () => {
    const res = await callWithHost("http://localhost:3000/", "localhost:3000");
    expect(res.status).not.toBe(403);
  });
});
