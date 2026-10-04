// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { missingKeyHint, selectModel } from "../src/model-provider.js";
import { gatewayHeaders, loadGatewayConfig } from "../src/gateway.js";

describe("selectModel", () => {
  it("defaults to google / gemini-2.5-flash", () => {
    const sel = selectModel({});
    expect(sel.provider).toBe("google");
    expect(sel.modelId).toBe("gemini-2.5-flash");
    expect(sel.keySource).toBe("GOOGLE_API_KEY");
  });

  it("recognises the openexpert gateway", () => {
    const sel = selectModel({ OPENEXPERT_MODEL_PROVIDER: "openexpert" });
    expect(sel.provider).toBe("openexpert");
    expect(sel.keySource).toBe("OPENEXPERT_API_KEY");
  });

  it("falls back to llama3.1 for ollama", () => {
    const sel = selectModel({ OPENEXPERT_MODEL_PROVIDER: "ollama" });
    expect(sel.provider).toBe("ollama");
    expect(sel.modelId).toBe("llama3.1");
    expect(sel.keySource).toBe("none (local)");
  });

  it("ignores unknown providers", () => {
    const sel = selectModel({ OPENEXPERT_MODEL_PROVIDER: "wat" });
    expect(sel.provider).toBe("google");
  });
});

describe("missingKeyHint", () => {
  it("flags missing google key", () => {
    const sel = selectModel({ OPENEXPERT_MODEL_PROVIDER: "google" });
    expect(missingKeyHint(sel, {})).toMatch(/GOOGLE_API_KEY/);
  });

  it("flags missing openai-compatible key", () => {
    const sel = selectModel({ OPENEXPERT_MODEL_PROVIDER: "openai-compatible" });
    expect(missingKeyHint(sel, {})).toMatch(/OPENEXPERT_MODEL_KEY/);
  });

  it("flags missing gateway URL or token", () => {
    const sel = selectModel({ OPENEXPERT_MODEL_PROVIDER: "openexpert" });
    expect(missingKeyHint(sel, {})).toMatch(/OPENEXPERT_GATEWAY_URL/);
    expect(missingKeyHint(sel, { OPENEXPERT_GATEWAY_URL: "https://gw.example/v1" })).toMatch(
      /OPENEXPERT_API_KEY/,
    );
    expect(
      missingKeyHint(sel, {
        OPENEXPERT_GATEWAY_URL: "https://gw.example/v1",
        OPENEXPERT_API_KEY: "x",
      }),
    ).toBeNull();
  });

  it("never flags ollama", () => {
    const sel = selectModel({ OPENEXPERT_MODEL_PROVIDER: "ollama" });
    expect(missingKeyHint(sel, {})).toBeNull();
  });
});

describe("loadGatewayConfig", () => {
  it("returns null when either URL or key is missing", () => {
    expect(loadGatewayConfig({})).toBeNull();
    expect(loadGatewayConfig({ OPENEXPERT_GATEWAY_URL: "https://gw" })).toBeNull();
    expect(loadGatewayConfig({ OPENEXPERT_API_KEY: "x" })).toBeNull();
  });

  it("normalises trailing slashes on the base URL", () => {
    const cfg = loadGatewayConfig({
      OPENEXPERT_GATEWAY_URL: "https://gw.example/v1///",
      OPENEXPERT_API_KEY: "abc",
    });
    expect(cfg?.baseURL).toBe("https://gw.example/v1");
  });
});

describe("gatewayHeaders", () => {
  it("sets bearer auth and a user-agent", () => {
    const headers = gatewayHeaders({
      baseURL: "https://gw.example",
      apiKey: "tok",
    });
    expect(headers["Authorization"]).toBe("Bearer tok");
    expect(headers["User-Agent"]).toBe("@openexpert/opencore");
  });

  it("includes the account header when provided", () => {
    const headers = gatewayHeaders({
      baseURL: "https://gw.example",
      apiKey: "tok",
      account: "acct_123",
    });
    expect(headers["X-OpenExpert-Account"]).toBe("acct_123");
  });
});
