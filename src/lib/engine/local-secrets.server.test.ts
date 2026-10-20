// SPDX-License-Identifier: MIT
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as local from "./local-secrets.server";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "openexpert-secrets-"));
  process.env["OPENEXPERT_DATA_DIR"] = dir;
});

afterEach(() => {
  delete process.env["OPENEXPERT_DATA_DIR"];
  rmSync(dir, { recursive: true, force: true });
});

const tokens = {
  access_token: "a",
  refresh_token: "r",
  expires_at: "2026-01-01T00:00:00.000Z",
};

describe("local credential custody", () => {
  it("creates the key on first use and round-trips the tokens", () => {
    expect(local.loadTokens()).toBeNull();
    local.saveTokens(tokens);
    expect(local.loadTokens()).toEqual(tokens);
    expect(readFileSync(join(dir, "secret.key")).length).toBe(32);
  });

  it("refuses to replace a damaged key file and keeps the original", () => {
    // The regression: a `secret.key` that was not 32 bytes long (a cut write, a half copy) was
    // silently replaced by a new key, and every credential encrypted with the old one became
    // unreadable for good — the UI then said "Drive is not connected".
    const keyFile = join(dir, "secret.key");
    const damaged = Buffer.from("clave-a-medias");
    writeFileSync(keyFile, damaged);

    expect(() => local.saveTokens(tokens)).toThrow(/está dañado/);
    // The original bytes are still there: nothing to recover from if they were overwritten.
    expect(readFileSync(keyFile).equals(damaged)).toBe(true);
  });

  it("surfaces a damaged key as an error instead of 'not connected'", () => {
    writeFileSync(join(dir, "secret.key"), Buffer.from("corta"));
    // Ciphertext-shaped blobs, so decryption reaches the key instead of failing earlier on length.
    const blob = Buffer.alloc(40).toString("base64");
    writeFileSync(join(dir, "credentials.json"), blob);
    writeFileSync(join(dir, "drive-grants.json"), blob);
    writeFileSync(join(dir, "notion.json"), blob);

    expect(() => local.loadTokens()).toThrow(local.SecretKeyError);
    expect(() => local.loadGrantedFiles()).toThrow(local.SecretKeyError);
    expect(() => local.loadNotionToken()).toThrow(local.SecretKeyError);
  });

  it("still returns empty when there is nothing stored", () => {
    // A first run is not a failure: no key file and no credentials is the normal empty state.
    expect(local.loadTokens()).toBeNull();
    expect(local.loadGrantedFiles()).toEqual([]);
    expect(local.loadLocalRoots()).toEqual([]);
    expect(local.loadNotionToken()).toBeNull();
  });
});
