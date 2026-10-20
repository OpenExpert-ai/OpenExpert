// SPDX-License-Identifier: MIT
// Regression test for the global `Host` gate: a request whose `Host` is not one
// the server serves is refused before any route or server function sees it.
// That is what stops a DNS rebinding page — `evil.test` resolved to 127.0.0.1 —
// from becoming same-origin with the app.
import { describe, expect, it } from "vitest";

import server from "./server";

const ctx = {} as never;

const call = (url: string, host: string) =>
  server.fetch(new Request(url, { headers: { host } }), {}, ctx);

describe("server entry", () => {
  it("refuses a Host the server does not serve", async () => {
    const res = await call("http://evil.test:3000/api/backup", "evil.test:3000");
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("Forbidden");
    // The security headers still apply to the refusal.
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });

  it("does not refuse the loopback host before the handler runs", async () => {
    const res = await call("http://localhost:3000/", "localhost:3000");
    expect(res.status).not.toBe(403);
  });
});
