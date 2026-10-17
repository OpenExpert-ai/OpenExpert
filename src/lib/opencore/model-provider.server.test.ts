// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";

import { gatewayHeaders } from "./model-provider.server";

describe("gatewayHeaders", () => {
  it("identifica la aplicación en lugar de llegar como un SDK anónimo", () => {
    const h = gatewayHeaders();
    expect(h["user-agent"]).toMatch(/^OpenExpert\//);
  });

  it("nombra la conversación cuando la hay: hay puertas que sin esto responden 400", () => {
    expect(gatewayHeaders("conv-123")["x-opencode-session"]).toBe("conv-123");
  });

  it("no inventa una sesión cuando no la hay", () => {
    expect(gatewayHeaders()).not.toHaveProperty("x-opencode-session");
    expect(gatewayHeaders("")).not.toHaveProperty("x-opencode-session");
  });
});
