// SPDX-License-Identifier: MIT
// Optional passphrase encryption for backups. The bundle already contains the
// local key that decrypts the OAuth tokens; a copy that travels without a
// passphrase is a credential file. AES-256-GCM + scrypt, no dependencies.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

export const ENCRYPTED_BACKUP_FORMAT = "openexpert-backup-encrypted";
const VERSION = 1;

type Envelope = {
  format?: string;
  version?: number;
  kdf?: string;
  salt?: string;
  iv?: string;
  tag?: string;
  data?: string;
};

/** True when the text is an encrypted envelope, not a plain backup. */
export function isEncryptedBackup(text: string): boolean {
  try {
    const parsed = JSON.parse(text) as Envelope;
    return parsed.format === ENCRYPTED_BACKUP_FORMAT;
  } catch {
    return false;
  }
}

export function encryptBackup(plain: string, passphrase: string): string {
  if (passphrase.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres.");
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(passphrase, salt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return JSON.stringify({
    format: ENCRYPTED_BACKUP_FORMAT,
    version: VERSION,
    kdf: "scrypt",
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  });
}

export function decryptBackup(text: string, passphrase: string): string {
  let parsed: Envelope;
  try {
    parsed = JSON.parse(text) as Envelope;
  } catch {
    throw new Error("La copia no es un JSON válido.");
  }
  if (parsed.format !== ENCRYPTED_BACKUP_FORMAT) throw new Error("La copia no está cifrada.");
  if (
    parsed.version !== VERSION ||
    parsed.kdf !== "scrypt" ||
    !parsed.salt ||
    !parsed.iv ||
    !parsed.tag ||
    !parsed.data
  ) {
    throw new Error("La copia cifrada no tiene el formato esperado.");
  }
  try {
    const key = scryptSync(passphrase, Buffer.from(parsed.salt, "base64"), 32);
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(parsed.iv, "base64"));
    decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(parsed.data, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Contraseña incorrecta o copia dañada.");
  }
}
