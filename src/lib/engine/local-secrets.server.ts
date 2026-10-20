// SPDX-License-Identifier: MIT
// Local credential custody: the Google Drive OAuth tokens and the user's
// Drive Picker grants for the single owner.
// All sensitive bytes are AES-256-GCM encrypted with a key file generated
// once on the local machine (mode 0600). The encrypted blobs sit next to
// the key file in ~/.openexpert/.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dataDir } from "@/lib/db.server";

export type LocalTokens = {
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
};

export type DriveGrant = {
  id: string;
  name: string;
  mimeType: string;
  addedAt: string;
};

const ALGO = "aes-256-gcm";

function tokensFile(): string {
  const d = dataDir();
  mkdirSync(d, { recursive: true });
  return join(d, "credentials.json");
}
function grantsFile(): string {
  const d = dataDir();
  mkdirSync(d, { recursive: true });
  return join(d, "drive-grants.json");
}
function keyFile(): string {
  const d = dataDir();
  mkdirSync(d, { recursive: true });
  return join(d, "secret.key");
}

/**
 * The key file exists but cannot be used. Distinct from "no file yet" (a first
 * run): every credential saved with the old key is unreadable, and generating a
 * new one would overwrite the only thing that could ever decrypt them again.
 */
export class SecretKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretKeyError";
  }
}

function getKey(): Buffer {
  const f = keyFile();
  if (!existsSync(f)) {
    const created = randomBytes(32);
    writeFileSync(f, created, { mode: 0o600 });
    return created;
  }
  let k: Buffer;
  try {
    k = readFileSync(f);
  } catch (e) {
    throw new SecretKeyError(
      `No se pudo leer el fichero de clave ${f}: ${e instanceof Error ? e.message : String(e)}. ` +
        "Las credenciales guardadas no se pueden descifrar y no se ha generado una clave nueva.",
    );
  }
  if (k.length !== 32) {
    throw new SecretKeyError(
      `El fichero de clave ${f} está dañado (${k.length} bytes, se esperaban 32). ` +
        "Las credenciales guardadas no se pueden descifrar: vuelve a conectar Drive y Notion desde Integraciones.",
    );
  }
  return k;
}

function encrypt(plain: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

function decrypt(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  if (buf.byteLength < 16) throw new Error("Invalid ciphertext");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/**
 * A damaged key file is not "nothing stored": returning `null` there would hide
 * the loss behind "Drive is not connected". Let it reach the caller.
 */
function rethrowIfKeyError(e: unknown): void {
  if (e instanceof SecretKeyError) throw e;
}

/* ----------------------------- Drive tokens ----------------------------- */

export function loadTokens(): LocalTokens | null {
  const f = tokensFile();
  if (!existsSync(f)) return null;
  try {
    const raw = readFileSync(f, "utf8");
    if (!raw) return null;
    return JSON.parse(decrypt(raw)) as LocalTokens;
  } catch (e) {
    rethrowIfKeyError(e);
    return null;
  }
}

export function saveTokens(t: LocalTokens): void {
  writeFileSync(tokensFile(), encrypt(JSON.stringify(t)), { mode: 0o600 });
}

export function removeTokens(): void {
  const f = tokensFile();
  if (existsSync(f)) writeFileSync(f, "", { mode: 0o600 });
}

/* ----------------------------- Picker grants ---------------------------- */

export function loadGrantedFiles(): DriveGrant[] {
  const f = grantsFile();
  if (!existsSync(f)) return [];
  try {
    const raw = readFileSync(f, "utf8");
    if (!raw) return [];
    return JSON.parse(decrypt(raw)) as DriveGrant[];
  } catch (e) {
    rethrowIfKeyError(e);
    return [];
  }
}

export function saveGrantedFiles(g: DriveGrant[]): void {
  writeFileSync(grantsFile(), encrypt(JSON.stringify(g)), { mode: 0o600 });
}

export function removeGrantedFiles(): void {
  const f = grantsFile();
  if (existsSync(f)) writeFileSync(f, "", { mode: 0o600 });
}

/* ---------------------------- Local folder roots ------------------------ */

export type LocalRoot = {
  path: string;
  name: string;
  addedAt: string;
};

function localRootsFile(): string {
  const d = dataDir();
  mkdirSync(d, { recursive: true });
  return join(d, "local-roots.json");
}

export function loadLocalRoots(): LocalRoot[] {
  const f = localRootsFile();
  if (!existsSync(f)) return [];
  try {
    const raw = readFileSync(f, "utf8");
    if (!raw) return [];
    return JSON.parse(decrypt(raw)) as LocalRoot[];
  } catch (e) {
    rethrowIfKeyError(e);
    return [];
  }
}

export function saveLocalRoots(roots: LocalRoot[]): void {
  writeFileSync(localRootsFile(), encrypt(JSON.stringify(roots)), { mode: 0o600 });
}

export function removeLocalRoots(): void {
  const f = localRootsFile();
  if (existsSync(f)) writeFileSync(f, "", { mode: 0o600 });
}

/* ------------------------------ Notion token ---------------------------- */

export type NotionToken = {
  access_token: string;
  workspace_id: string;
  workspace_name: string;
  bot_id: string | null;
  connected_at: string;
};

function notionFile(): string {
  const d = dataDir();
  mkdirSync(d, { recursive: true });
  return join(d, "notion.json");
}

export function loadNotionToken(): NotionToken | null {
  const f = notionFile();
  if (!existsSync(f)) return null;
  try {
    const raw = readFileSync(f, "utf8");
    if (!raw) return null;
    return JSON.parse(decrypt(raw)) as NotionToken;
  } catch (e) {
    rethrowIfKeyError(e);
    return null;
  }
}

export function saveNotionToken(t: NotionToken): void {
  writeFileSync(notionFile(), encrypt(JSON.stringify(t)), { mode: 0o600 });
}

export function removeNotionToken(): void {
  const f = notionFile();
  if (existsSync(f)) writeFileSync(f, "", { mode: 0o600 });
}

/* --------------------------- Drive consent ----------------------------- */

export type DriveConsent = { at: string; privacyUrl: string };

export function loadDriveConsent(): DriveConsent | null {
  const f = join(dataDir(), "drive-consent.json");
  if (!existsSync(f)) return null;
  try {
    const raw = readFileSync(f, "utf8");
    if (!raw) return null;
    return JSON.parse(decrypt(raw)) as DriveConsent;
  } catch (e) {
    rethrowIfKeyError(e);
    return null;
  }
}

export function saveDriveConsent(c: DriveConsent): void {
  const f = join(dataDir(), "drive-consent.json");
  writeFileSync(f, encrypt(JSON.stringify(c)), { mode: 0o600 });
}

export function removeDriveConsent(): void {
  const f = join(dataDir(), "drive-consent.json");
  if (existsSync(f)) writeFileSync(f, "", { mode: 0o600 });
}
