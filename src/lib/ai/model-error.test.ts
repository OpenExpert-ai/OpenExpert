// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { friendlyModelError } from "./model-error";

describe("friendlyModelError", () => {
  it("explains a model without tool calling and names the fix", () => {
    const out = friendlyModelError(
      "registry.ollama.ai/library/dolphin3:8b does not support tools",
      "dolphin3:8b",
    );
    expect(out).toContain("dolphin3:8b");
    expect(out).toContain("no admite herramientas");
    expect(out).toContain("llama3.1");
  });

  it("leaves any other provider error untouched", () => {
    expect(friendlyModelError("401 Unauthorized", "gemini-2.5-flash")).toBe("401 Unauthorized");
  });
});
