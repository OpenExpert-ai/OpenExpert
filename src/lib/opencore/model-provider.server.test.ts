// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";

import { opencodeGoHeaders } from "./model-provider.server";

describe("opencodeGoHeaders", () => {
  it("identifica la aplicación en lugar de llegar como un SDK anónimo", () => {
    const h = opencodeGoHeaders();
    expect(h["user-agent"]).toMatch(/^OpenExpert\//);
  });

  it("nombra la conversación cuando la hay: hay puertas que sin esto responden 400", () => {
    expect(opencodeGoHeaders("conv-123")["x-opencode-session"]).toBe("conv-123");
  });

  it("no inventa una sesión cuando no la hay", () => {
    expect(opencodeGoHeaders()).not.toHaveProperty("x-opencode-session");
    expect(opencodeGoHeaders("")).not.toHaveProperty("x-opencode-session");
  });
});
