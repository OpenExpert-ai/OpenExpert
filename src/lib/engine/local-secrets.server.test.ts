// SPDX-License-Identifier: MIT
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// `local-secrets` derives every path from `dataDir()` at call time, but the
// module graph (db.server → config.server) reads the environment on import, so
// the directory has to be in place before the dynamic import.
let dir: string;
let local: typeof import("./local-secrets.server");

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "openexpert-local-secrets-"));
  process.env["OPENEXPERT_DATA_DIR"] = dir;
  local = await import("./local-secrets.server");
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env["OPENEXPERT_DATA_DIR"];
});

beforeEach(() => {
  for (const f of [
    "credentials.json",
    "drive-grants.json",
    "local-roots.json",
    "notion.json",
    "drive-consent.json",
    "secret.key",
  ]) {
    rmSync(join(dir, f), { force: true });
  }
});

const modeOf = (file: string) => statSync(join(dir, file)).mode & 0o777;
const rawOf = (file: string) => readFileSync(join(dir, file), "utf8");

const tokens = {
  access_token: "ya29.access-token-secreto",
  refresh_token: "1//refresh-token-secreto",
  expires_at: "2030-01-01T00:00:00.000Z",
};

describe("clave local", () => {
  it("genera una clave de 32 bytes con permisos 0600 en el primer cifrado", () => {
    local.saveTokens(tokens);
    const key = join(dir, "secret.key");
    expect(existsSync(key)).toBe(true);
    expect(readFileSync(key).byteLength).toBe(32);
    expect(modeOf("secret.key")).toBe(0o600);
  });

  it("reutiliza la clave existente: dos cifrados distintos se descifran con ella", () => {
    local.saveTokens(tokens);
    const key = readFileSync(join(dir, "secret.key"));
    local.saveGrantedFiles([]);
    expect(readFileSync(join(dir, "secret.key")).equals(key)).toBe(true);
    expect(local.loadTokens()).toEqual(tokens);
  });

  it("se niega a regenerar la clave si el fichero está dañado y conserva el original", () => {
    const damaged = randomBytes(16);
    writeFileSync(join(dir, "secret.key"), damaged, { mode: 0o600 });
    expect(() => local.saveTokens(tokens)).toThrow(/está dañado/);
    expect(readFileSync(join(dir, "secret.key")).equals(damaged)).toBe(true);
  });
});

describe("cifrado AES-256-GCM de los tokens de Drive", () => {
  it("guarda el token cifrado, no en claro, y lo recupera", () => {
    local.saveTokens(tokens);
    const raw = rawOf("credentials.json");
    expect(raw).not.toContain(tokens.access_token);
    expect(raw).not.toContain(tokens.refresh_token);
    expect(modeOf("credentials.json")).toBe(0o600);
    // iv (12) + auth tag (16) + ciphertext, en base64.
    expect(Buffer.from(raw, "base64").byteLength).toBeGreaterThan(28);
    expect(local.loadTokens()).toEqual(tokens);
  });

  it("usa un nonce nuevo en cada escritura", () => {
    local.saveTokens(tokens);
    const first = rawOf("credentials.json");
    local.saveTokens(tokens);
    expect(rawOf("credentials.json")).not.toBe(first);
  });

  it("devuelve null si el ciphertext fue manipulado (falla la etiqueta GCM)", () => {
    local.saveTokens(tokens);
    const buf = Buffer.from(rawOf("credentials.json"), "base64");
    buf[buf.byteLength - 1] = (buf[buf.byteLength - 1]! ^ 0xff) & 0xff;
    writeFileSync(join(dir, "credentials.json"), buf.toString("base64"), { mode: 0o600 });
    expect(local.loadTokens()).toBeNull();
  });

  it("devuelve null si la clave del equipo cambió", () => {
    local.saveTokens(tokens);
    writeFileSync(join(dir, "secret.key"), randomBytes(32), { mode: 0o600 });
    expect(local.loadTokens()).toBeNull();
  });

  it("devuelve null con un fichero corrupto, truncado o vacío", () => {
    writeFileSync(join(dir, "credentials.json"), "no-es-base64-valido", { mode: 0o600 });
    expect(local.loadTokens()).toBeNull();

    writeFileSync(join(dir, "credentials.json"), Buffer.alloc(12).toString("base64"), {
      mode: 0o600,
    });
    expect(local.loadTokens()).toBeNull();

    writeFileSync(join(dir, "credentials.json"), "", { mode: 0o600 });
    expect(local.loadTokens()).toBeNull();

    rmSync(join(dir, "credentials.json"));
    expect(local.loadTokens()).toBeNull();
  });

  it("removeTokens deja el fichero vacío y la lectura en null", () => {
    local.saveTokens(tokens);
    local.removeTokens();
    expect(rawOf("credentials.json")).toBe("");
    expect(local.loadTokens()).toBeNull();
  });
});

describe("grants del Picker, raíces locales, Notion y consentimiento", () => {
  const grants = [{ id: "f1", name: "Hoja", mimeType: "application/pdf", addedAt: "2026-01-01" }];
  const roots = [{ path: "/tmp/docs", name: "docs", addedAt: "2026-01-01" }];
  const notion = {
    access_token: "secret_notion",
    workspace_id: "ws-1",
    workspace_name: "Mi espacio",
    bot_id: null,
    connected_at: "2026-01-01T00:00:00.000Z",
  };
  const consent = { at: "2026-01-01T00:00:00.000Z", privacyUrl: "https://example.test/privacy" };

  it("cifra y descifra los grants con permisos 0600", () => {
    local.saveGrantedFiles(grants);
    expect(rawOf("drive-grants.json")).not.toContain("Hoja");
    expect(modeOf("drive-grants.json")).toBe(0o600);
    expect(local.loadGrantedFiles()).toEqual(grants);
    local.removeGrantedFiles();
    expect(local.loadGrantedFiles()).toEqual([]);
  });

  it("cifra y descifra las raíces locales", () => {
    local.saveLocalRoots(roots);
    expect(rawOf("local-roots.json")).not.toContain("/tmp/docs");
    expect(modeOf("local-roots.json")).toBe(0o600);
    expect(local.loadLocalRoots()).toEqual(roots);
    local.removeLocalRoots();
    expect(local.loadLocalRoots()).toEqual([]);
  });

  it("cifra y descifra el token de Notion", () => {
    local.saveNotionToken(notion);
    expect(rawOf("notion.json")).not.toContain("secret_notion");
    expect(modeOf("notion.json")).toBe(0o600);
    expect(local.loadNotionToken()).toEqual(notion);
    local.removeNotionToken();
    expect(local.loadNotionToken()).toBeNull();
  });

  it("cifra y descifra el consentimiento de Drive", () => {
    local.saveDriveConsent(consent);
    expect(rawOf("drive-consent.json")).not.toContain("privacy");
    expect(modeOf("drive-consent.json")).toBe(0o600);
    expect(local.loadDriveConsent()).toEqual(consent);
    local.removeDriveConsent();
    expect(local.loadDriveConsent()).toBeNull();
  });

  it("un fichero de grants corrupto se lee como lista vacía, no rompe", () => {
    writeFileSync(join(dir, "drive-grants.json"), "%%%", { mode: 0o600 });
    expect(local.loadGrantedFiles()).toEqual([]);
    writeFileSync(join(dir, "local-roots.json"), "%%%", { mode: 0o600 });
    expect(local.loadLocalRoots()).toEqual([]);
  });

  it("crea el directorio de datos si no existe", () => {
    const nested = join(dir, "sub", "dir");
    process.env["OPENEXPERT_DATA_DIR"] = nested;
    try {
      local.saveDriveConsent(consent);
      expect(existsSync(join(nested, "drive-consent.json"))).toBe(true);
      expect(local.loadDriveConsent()).toEqual(consent);
    } finally {
      process.env["OPENEXPERT_DATA_DIR"] = dir;
    }
  });

});

describe("clave dañada: error explícito en vez de 'sin conexión'", () => {
  it("lanza SecretKeyError al leer si la clave no mide 32 bytes", () => {
    writeFileSync(join(dir, "secret.key"), Buffer.from("corta"), { mode: 0o600 });
    // blobs con forma de cifrado: el descifrado llega a la clave en vez de fallar antes por longitud
    const blob = Buffer.alloc(40).toString("base64");
    writeFileSync(join(dir, "credentials.json"), blob);
    writeFileSync(join(dir, "drive-grants.json"), blob);
    writeFileSync(join(dir, "notion.json"), blob);

    expect(() => local.loadTokens()).toThrow(local.SecretKeyError);
    expect(() => local.loadGrantedFiles()).toThrow(local.SecretKeyError);
    expect(() => local.loadNotionToken()).toThrow(local.SecretKeyError);
  });

  it("con el directorio vacío no hay error: es el estado normal de primer arranque", () => {
    expect(local.loadTokens()).toBeNull();
    expect(local.loadGrantedFiles()).toEqual([]);
    expect(local.loadLocalRoots()).toEqual([]);
    expect(local.loadNotionToken()).toBeNull();
  });
});
