// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "openexpert-notion-"));
  process.env["OPENEXPERT_DATA_DIR"] = dir;
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env["OPENEXPERT_DATA_DIR"];
});

describe("notion oauth state", () => {
  it("signs and verifies a state", async () => {
    const { signState, verifyState } = await import("./notion-tokens.server");
    const { state } = signState();
    expect(verifyState(state).ok).toBe(true);
  });

  it("rejects a tampered state", async () => {
    const { signState, verifyState } = await import("./notion-tokens.server");
    const { state } = signState();
    expect(verifyState(`${state}x`).ok).toBe(false);
    expect(verifyState("nope").ok).toBe(false);
  });

  it("asks to authorize in the user's own workspace", async () => {
    const prevO = process.env["OPENEXPERT_NOTION_CLIENT_ID"];
    const prev = process.env["NOTION_CLIENT_ID"];
    const prevS = process.env["NOTION_CLIENT_SECRET"];
    process.env["OPENEXPERT_NOTION_CLIENT_ID"] = "cid";
    delete process.env["NOTION_CLIENT_ID"];
    process.env["NOTION_CLIENT_SECRET"] = "sec";
    try {
      const { authorizationUrl } = await import("./notion-tokens.server");
      const url = new URL(authorizationUrl("http://localhost:3000", "st"));
      expect(url.searchParams.get("owner")).toBe("user");
      expect(url.searchParams.get("client_id")).toBe("cid");
      expect(url.searchParams.get("redirect_uri")).toBe(
        "http://localhost:3000/auth/notion/callback",
      );
    } finally {
      if (prevO === undefined) delete process.env["OPENEXPERT_NOTION_CLIENT_ID"];
      else process.env["OPENEXPERT_NOTION_CLIENT_ID"] = prevO;
      if (prev === undefined) delete process.env["NOTION_CLIENT_ID"];
      else process.env["NOTION_CLIENT_ID"] = prev;
      if (prevS === undefined) delete process.env["NOTION_CLIENT_SECRET"];
      else process.env["NOTION_CLIENT_SECRET"] = prevS;
    }
  });
});
