// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { decryptBackup, encryptBackup, isEncryptedBackup } from "./backup-crypto";

describe("backup encryption", () => {
  it("round-trips a backup with the right passphrase", () => {
    const plain = JSON.stringify({ format: "openexpert-backup", db: "abc" });
    const encrypted = encryptBackup(plain, "contraseña-larga");
    expect(isEncryptedBackup(encrypted)).toBe(true);
    expect(encrypted).not.toContain("abc");
    expect(decryptBackup(encrypted, "contraseña-larga")).toBe(plain);
  });

  it("rejects a wrong passphrase and a short one", () => {
    const encrypted = encryptBackup("{}", "contraseña-larga");
    expect(() => decryptBackup(encrypted, "otra-contraseña")).toThrow(
      "Contraseña incorrecta o copia dañada.",
    );
    expect(() => encryptBackup("{}", "corta")).toThrow("al menos 8");
  });

  it("does not mistake a plain backup for an encrypted one", () => {
    expect(isEncryptedBackup('{"format":"openexpert-backup"}')).toBe(false);
    expect(isEncryptedBackup("not json")).toBe(false);
  });
});
