// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "openexpert-drive-"));
  process.env["OPENEXPERT_DATA_DIR"] = dir;
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env["OPENEXPERT_DATA_DIR"];
});

describe("OAuth state", () => {
  it("signs and verifies a state carrying the PKCE verifier", async () => {
    const { signState, verifyState } = await import("./drive-tokens.server");
    const { state, verifier } = signState();
    const checked = verifyState(state);
    expect(checked.ok).toBe(true);
    expect(checked.verifier).toBe(verifier);
  });

  it("rejects a tampered or malformed state", async () => {
    const { signState, verifyState } = await import("./drive-tokens.server");
    const { state } = signState();
    // Same length, different MAC → the constant-time compare must fail.
    const tampered = state.slice(0, -2) + "xx";
    expect(verifyState(tampered).ok).toBe(false);
    expect(verifyState("nope").ok).toBe(false);
  });
});
