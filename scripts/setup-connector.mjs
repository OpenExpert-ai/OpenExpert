#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Store a connector key in ~/.openexpert/secrets.json without printing it.
// The installer pipes the value on stdin so the token never appears in argv
// (where `ps` could read it) and never reaches a log.
//
// Usage: printf '%s' "$TOKEN" | node scripts/setup-connector.mjs pipedrive
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ENV = {
  pipedrive: "PIPEDRIVE_API_TOKEN",
  holded: "HOLDED_API_KEY",
};

const id = process.argv[2];
const name = id ? ENV[id] : undefined;
if (!id || !name) {
  console.error("Uso: setup-connector.mjs <pipedrive|holded>  (la clave se lee de stdin)");
  process.exit(1);
}

const raw = process.env.OPENEXPERT_DATA_DIR || "~/.openexpert";
const dir = raw.startsWith("~/") ? join(homedir(), raw.slice(2)) : raw;
const file = join(dir, "secrets.json");

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const value = Buffer.concat(chunks).toString("utf8").trim();
if (value.length < 10) {
  console.error("La clave está vacía o es demasiado corta; no se ha guardado nada.");
  process.exit(1);
}

let secrets = {};
try {
  if (existsSync(file)) secrets = JSON.parse(readFileSync(file, "utf8"));
} catch {
  console.error("No se pudo leer secrets.json; no se ha tocado.");
  process.exit(1);
}
secrets[name] = value;

mkdirSync(dir, { recursive: true, mode: 0o700 });
if (process.platform !== "win32") {
  try {
    chmodSync(dir, 0o700);
  } catch {
    // The write below reports the real permission problem.
  }
}
const tmp = `${file}.tmp`;
writeFileSync(tmp, `${JSON.stringify(secrets, null, 2)}\n`, { mode: 0o600 });
renameSync(tmp, file);
console.log(`${id}: clave guardada en ${file} (0600).`);
