// SPDX-License-Identifier: MIT
// Server-only. Google Drive OAuth for the single local owner. Tokens live in
// ~/.openexpert/credentials.json (0600) and never leave the machine.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dataDir } from "@/lib/db.server";
import * as local from "@/lib/opencore/local-secrets.server";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

/** drive.readonly searches and reads; drive.file creates and edits. */
export const DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.file",
];

export const DRIVE_NOT_CONNECTED =
  "Google Drive no está conectado. Conecta tu cuenta desde Integraciones → Fuentes.";

const env = (k: string) => process.env[k]?.trim() || undefined;

export const googleConfigured = () =>
  Boolean(env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET"));

export const googleRedirectUri = (origin: string) =>
  env("GOOGLE_REDIRECT_URI") || `${origin.replace(/\/$/, "")}/auth/google/callback`;

type Tokens = { access_token: string; refresh_token?: string; expires_in: number; scope?: string };

async function postToken(body: Record<string, string>): Promise<Tokens> {
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("GOOGLE_CLIENT_ID") ?? "",
      client_secret: env("GOOGLE_CLIENT_SECRET") ?? "",
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
  mkdirSync(dir, { recursive: true });
  const f = join(dir, "state-secret");
  if (existsSync(f)) return readFileSync(f, "utf8").trim();
  const secret = randomBytes(32).toString("hex");
  writeFileSync(f, secret, { mode: 0o600 });
  return secret;
}

const mac = (value: string) =>
  createHmac("sha256", stateSecret()).update(value).digest("base64url");

export function signState(): string {
  const nonce = randomBytes(16).toString("hex");
  return `${nonce}.${mac(nonce)}`;
}

export function verifyState(state: string): boolean {
  const i = state.lastIndexOf(".");
  if (i < 1) return false;
  const nonce = state.slice(0, i);
  const got = Buffer.from(state.slice(i + 1));
  const want = Buffer.from(mac(nonce));
  return got.length === want.length && timingSafeEqual(got, want);
}

export function authorizationUrl(origin: string, state: string) {
  const p = new URLSearchParams({
    client_id: env("GOOGLE_CLIENT_ID") ?? "",
    redirect_uri: googleRedirectUri(origin),
    response_type: "code",
    scope: DRIVE_SCOPES.join(" "),
    // offline + consent is what makes Google hand back a refresh token.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${p}`;
}

export async function exchangeCode(code: string, origin: string) {
  return postToken({
    code,
    grant_type: "authorization_code",
    redirect_uri: googleRedirectUri(origin),
  });
}

export async function saveTokens(t: Tokens): Promise<void> {
  const prev = local.loadTokens();
  // Google omits refresh_token when the user re-authorises without revoking,
  // so keep the one we already hold rather than nulling it.
  local.saveTokens({
    access_token: t.access_token,
    refresh_token: t.refresh_token || prev?.refresh_token || null,
    expires_at: new Date(Date.now() + (t.expires_in || 3600) * 1000).toISOString(),
  });
}

export async function disconnectDrive(): Promise<void> {
  const prev = local.loadTokens();
  local.removeTokens();
  if (prev?.refresh_token && env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET")) {
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token: prev.refresh_token,
        client_id: env("GOOGLE_CLIENT_ID")!,
        client_secret: env("GOOGLE_CLIENT_SECRET")!,
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
