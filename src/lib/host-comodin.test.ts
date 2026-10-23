// SPDX-License-Identifier: MIT
// A wildcard bind says where to listen, not which names are trusted.
//
// `SECURITY.md` and `docs/es/08-despliegue.md` both promise that the server only
// answers names it knows — loopback, the listen address and the entries of
// `OPENEXPERT_ALLOWED_ORIGINS` — and answers 403 to every other one. With
// `OPENEXPERT_HOST=0.0.0.0` the `Host` check waved every name through instead, and
// a request that carries no `Origin` (which is every same-origin request a page
// makes, and therefore the whole DNS-rebinding shape) reached the routes that
// only ask `isSameOrigin`: `GET /api/backup`, the bundle that carries
// `secrets.json`, the encrypted credentials and the `secret.key` that decrypts
// them.
import { afterEach, describe, expect, it, vi } from "vitest";
import { isAllowedHost, isSameOrigin } from "@/lib/http.server";

/** A request as the browser would send it for `host`, with an optional `Origin`. */
function request(host: string, init: { origin?: string; method?: string } = {}): Request {
  const headers: Record<string, string> = { host };
  if (init.origin) headers["origin"] = init.origin;
  return new Request(`http://${host}/api/backup`, {
    method: init.method ?? "GET",
    headers,
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("el comodín no convierte cualquier nombre en nombre conocido", () => {
  it("rechaza un Host ajeno cuando se escucha en 0.0.0.0", () => {
    vi.stubEnv("OPENEXPERT_HOST", "0.0.0.0");
    vi.stubEnv("OPENEXPERT_ALLOWED_ORIGINS", "");
    expect(isAllowedHost(request("evil.test:3000"))).toBe(false);
  });

  it("no da por buena la petición sin Origin que hace el DNS rebinding a la copia de seguridad", () => {
    vi.stubEnv("OPENEXPERT_HOST", "0.0.0.0");
    vi.stubEnv("OPENEXPERT_ALLOWED_ORIGINS", "");
    // La página del atacante se sirve en evil.test:3000, el DNS se reengancha a
    // 127.0.0.1 y su `fetch("/api/backup")` ya es same-origin: no manda Origin.
    expect(isSameOrigin(request("evil.test:3000"))).toBe(false);
    // Y con Origin, tampoco.
    expect(isSameOrigin(request("evil.test:3000", { origin: "http://evil.test:3000" }))).toBe(false);
  });

  it("sigue sirviendo el nombre que el operador declaró", () => {
    vi.stubEnv("OPENEXPERT_HOST", "0.0.0.0");
    vi.stubEnv("OPENEXPERT_ALLOWED_ORIGINS", "http://192.168.1.10:3000");
    expect(isAllowedHost(request("192.168.1.10:3000"))).toBe(true);
    expect(isSameOrigin(request("192.168.1.10:3000", { origin: "http://192.168.1.10:3000" }))).toBe(
      true,
    );
  });

  it("sigue sirviendo el bucle local con el comodín puesto", () => {
    vi.stubEnv("OPENEXPERT_HOST", "0.0.0.0");
    vi.stubEnv("OPENEXPERT_ALLOWED_ORIGINS", "");
    expect(isAllowedHost(request("localhost:3000"))).toBe(true);
  });
});
