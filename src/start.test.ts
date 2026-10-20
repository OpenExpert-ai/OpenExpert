// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";

// `src/start.ts` is pure wiring: it hands TanStack two middlewares. The mock
// captures what it registers so a regression is a failing assertion and not a
// silent hole — PR #65 removed the CSRF middleware by accident and nothing
// failed, which is exactly what this file exists to prevent.
const captured = vi.hoisted(() => ({
  middlewareServer: [] as ((ctx: { next: () => Promise<unknown> }) => Promise<unknown>)[],
  csrfOptions: [] as { filter?: (ctx: { handlerType: string }) => boolean }[],
  startFactory: undefined as undefined | (() => { requestMiddleware?: unknown[] }),
}));

vi.mock("@tanstack/react-start", () => ({
  createMiddleware: () => ({
    server: (fn: (ctx: { next: () => Promise<unknown> }) => Promise<unknown>) => {
      captured.middlewareServer.push(fn);
      return { __kind: "error-middleware", fn };
    },
  }),
  createCsrfMiddleware: (options: { filter?: (ctx: { handlerType: string }) => boolean }) => {
    captured.csrfOptions.push(options);
    return { __kind: "csrf-middleware", options };
  },
  createStart: (factory: () => { requestMiddleware?: unknown[] }) => {
    captured.startFactory = factory;
    return { __kind: "start", factory };
  },
}));

await import("./start");

const errorMiddleware = () => {
  const fn = captured.middlewareServer[0];
  if (!fn) throw new Error("start.ts no registró el middleware de errores");
  return fn;
};

const registered = () => {
  const factory = captured.startFactory;
  if (!factory) throw new Error("start.ts no llamó a createStart");
  return factory().requestMiddleware ?? [];
};

describe("middleware CSRF de las server functions", () => {
  it("registra el middleware CSRF una sola vez", () => {
    expect(captured.csrfOptions).toHaveLength(1);
  });

  it("lo cuelga de requestMiddleware (si alguien lo quita, esto falla)", () => {
    // El test que habría parado el PR #65: sin `src/start.ts` Start instala el
    // CSRF solo; declarando el fichero se opta por no instalarlo y hay que
    // volver a añadirlo a mano.
    const kinds = registered().map((m) => (m as { __kind?: string }).__kind);
    expect(kinds).toEqual(["error-middleware", "csrf-middleware"]);
  });

  it("solo protege las server functions", () => {
    const filter = captured.csrfOptions[0]?.filter;
    expect(filter).toBeTypeOf("function");
    expect(filter!({ handlerType: "serverFn" })).toBe(true);
    for (const handlerType of [
      "serverRoute",
      "router",
      "functionMiddleware",
      "requestMiddleware",
    ]) {
      expect(filter!({ handlerType })).toBe(false);
    }
  });
});

describe("middleware de errores", () => {
  it("devuelve la respuesta de next() cuando no hay error", async () => {
    const response = new Response("ok", { status: 200 });
    await expect(errorMiddleware()({ next: async () => response })).resolves.toBe(response);
  });

  it("deja pasar los errores con statusCode (redirects, 404 de ruta)", async () => {
    const redirect = Object.assign(new Error("Redirect"), { statusCode: 307 });
    const run = errorMiddleware()({ next: async () => Promise.reject(redirect) });
    await expect(run).rejects.toBe(redirect);
  });

  it("convierte cualquier otro throw en la página 500 en HTML", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = (await errorMiddleware()({
        next: async () => Promise.reject(new Error("secreto interno")),
      })) as Response;
      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(500);
      expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
      const body = await response.text();
      expect(body).toContain("Esta página no se pudo cargar");
      expect(body).not.toContain("secreto interno");
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
