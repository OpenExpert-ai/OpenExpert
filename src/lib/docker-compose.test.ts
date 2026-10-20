// SPDX-License-Identifier: MIT
// Regression test for the Docker deployment: a published port without the
// `127.0.0.1:` prefix puts an app with no authentication on the LAN. The
// compose file is data, so the assertion reads it instead of the code.
// (It lives under `src/` because that is what `vitest.config.ts` includes.)
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const compose = readFileSync(new URL("../../docker/docker-compose.yml", import.meta.url), "utf8");

/** Every quoted port mapping in the file: `- "3000:3000"` or `- "127.0.0.1:3000:3000"`. */
function publishedPorts(): string[] {
  return [...compose.matchAll(/^\s*-\s*"([^"]+)"\s*$/gm)]
    .map((m) => m[1]!)
    .filter((value) => /^(?:[\d.]+:)?\d+:\d+$/.test(value));
}

describe("docker-compose", () => {
  it("publishes every service on loopback only", () => {
    const ports = publishedPorts();
    expect(ports.length).toBeGreaterThan(0);
    for (const port of ports) expect(port).toMatch(/^127\.0\.0\.1:\d+:\d+$/);
  });

  it("says why the ports are bound to loopback", () => {
    expect(compose).toMatch(/no login|NO login|sin login|NO tiene login|no tiene login/i);
  });
});
