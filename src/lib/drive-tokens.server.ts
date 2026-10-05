// SPDX-License-Identifier: MIT
// Google Drive OAuth for the single local owner.
// Tokens live encrypted in ~/.openexpert/credentials.json (0600) and never
// touch the wire except to call Google's own endpoints with the user's
// consent. We request only the non-sensitive `drive.file` scope; the
// user chooses which files OpenExpert can see through the Google Picker.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dataDir } from "@/lib/db.server";
import * as local from "@/lib/opencore/local-secrets.server";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

/** Non-sensitive scope: per-file access. No CASA required. */
export const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.file"];

export const DRIVE_NOT_CONNECTED =
  "Google Drive no está conectado. Selecciona archivos desde Integraciones → Fuentes.";

const env = (k: string) => process.env[k]?.trim() || undefined;

function clientId(): string {
  return env("OPENEXPERT_GOOGLE_CLIENT_ID") || env("GOOGLE_CLIENT_ID") || "";
}
function clientSecret(): string {
  return env("GOOGLE_CLIENT_SECRET") || "";
}

export const googleConfigured = () => Boolean(clientId() && clientSecret());

export const googleRedirectUri = (origin: string) =>
  env("GOOGLE_REDIRECT_URI") || `${origin.replace(/\/$/, "")}/auth/google/callback`;

type Tokens = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
};

async function postToken(body: Record<string, string>): Promise<Tokens> {
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      ...body,
    }),
  });
  if (!r.ok) throw new Error(`Google respondió ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as Tokens;
}

/** HMAC secret for the OAuth `state`. Generated once and kept locally. */
function stateSecret(): string {
  const fromEnv = env("GOOGLE_OAUTH_STATE_SECRET");
  if (fromEnv) return fromEnv;
  const dir = dataDir();
  const f = join(dir, "state-secret");
  if (existsSync(f)) {
    const v = readFileSync(f, "utf8");
    if (v && v.trim()) return v.trim();
  }
  mkdirSync(dir, { recursive: true });
  const secret = randomBytes(32).toString("hex");
  writeFileSync(f, secret, { mode: 0o600 });
  return secret;
}

/**
 * Sign an OAuth `state` that also carries the PKCE `code_verifier`.
 * Layout: `nonce.verifier.mac(nonce|verifier)`. The verifier never leaves
 * the URL except to be sent back to the token URL with `code_verifier`.
 */
export function signState(): { state: string; verifier: string } {
  const nonce = randomBytes(16).toString("hex");
  const verifier = randomBytes(64).toString("base64url");
  const mac = createHmac("sha256", stateSecret())
    .update(`${nonce}|${verifier}`)
    .digest("base64url");
  return { state: `${nonce}.${verifier}.${mac}`, verifier };
}

export function verifyState(state: string): { ok: boolean; verifier?: string } {
  const parts = state.split(".");
  if (parts.length !== 3) return { ok: false };
  const nonce = parts[0];
  const verifier = parts[1];
  const got = parts[2];
  if (!nonce || !verifier || !got) return { ok: false };
  const wantMac = Buffer.from(
    createHmac("sha256", stateSecret()).update(`${nonce}|${verifier}`).digest("base64url"),
  );
  const g = Buffer.from(got);
  if (g.length !== wantMac.length || !timingSafeEqual(g, wantMac)) return { ok: false };
  return { ok: true, verifier };
}

export function authorizationUrl(origin: string, state: string, codeChallenge: string) {
  const p = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: googleRedirectUri(origin),
    response_type: "code",
    scope: DRIVE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `${AUTH_URL}?${p}`;
}

export async function exchangeCode(code: string, verifier: string, origin: string) {
  return postToken({
    code,
    grant_type: "authorization_code",
    redirect_uri: googleRedirectUri(origin),
    code_verifier: verifier,
  });
}

export async function saveTokens(t: Tokens): Promise<void> {
  const prev = local.loadTokens();
  local.saveTokens({
    access_token: t.access_token,
    refresh_token: t.refresh_token || prev?.refresh_token || null,
    expires_at: new Date(Date.now() + (t.expires_in || 3600) * 1000).toISOString(),
  });
}

export async function disconnectDrive(): Promise<void> {
  const prev = local.loadTokens();
  local.removeTokens();
  local.removeGrantedFiles();
  local.removeDriveConsent();
  if (prev?.refresh_token && clientId() && clientSecret()) {
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token: prev.refresh_token,
        client_id: clientId(),
        client_secret: clientSecret(),
      }),
    }).catch(() => {});
  }
}

export async function driveConnection() {
  const t = local.loadTokens();
  return { connected: !!t?.access_token, scopes: t ? DRIVE_SCOPES.join(" ") : null };
}

/** A valid access token, refreshing it first when stale. */
export async function getAccessToken(): Promise<string> {
  const data = local.loadTokens();
  if (!data?.access_token) throw new Error(DRIVE_NOT_CONNECTED);
  if (new Date(data.expires_at).getTime() > Date.now() + 60_000) return data.access_token;
  if (!data.refresh_token) throw new Error(`${DRIVE_NOT_CONNECTED} (la autorización caducó)`);
  const t = await postToken({ grant_type: "refresh_token", refresh_token: data.refresh_token });
  local.saveTokens({
    access_token: t.access_token,
    refresh_token: t.refresh_token || data.refresh_token,
    expires_at: new Date(Date.now() + (t.expires_in || 3600) * 1000).toISOString(),
  });
  return t.access_token;
}
