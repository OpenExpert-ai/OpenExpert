// SPDX-License-Identifier: MIT
// Notion OAuth (public connection) for the single local owner.
//
// The `client_id`/`client_secret` are the distributor's **app identity**, baked
// once. Each end user authorizes it with `owner=user` in THEIR OWN Notion
// workspace; the resulting access token is per-user and stored locally. There is
// no distributor server and no shared data token: the distributor never sees a
// user's token or content. The token lives encrypted in
// ~/.openexpert/notion.json (0600).

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dataDir } from "@/lib/db.server";
import * as local from "@/lib/opencore/local-secrets.server";

const AUTHORIZE_URL = "https://api.notion.com/v1/oauth/authorize";
const TOKEN_URL = "https://api.notion.com/v1/oauth/token";

/** Pinned API version; Notion requires the `Notion-Version` header. */
export const NOTION_VERSION = "2026-03-11";

export const NOTION_NOT_CONNECTED =
  "Notion no está conectado. Conéctalo desde Integraciones → Fuentes.";

const env = (k: string) => process.env[k]?.trim() || undefined;

function clientId(): string {
  return env("OPENEXPERT_NOTION_CLIENT_ID") || env("NOTION_CLIENT_ID") || "";
}
function clientSecret(): string {
  return env("NOTION_CLIENT_SECRET") || "";
}

export const notionConfigured = () => Boolean(clientId() && clientSecret());

export const notionRedirectUri = (origin: string) =>
  env("NOTION_REDIRECT_URI") || `${origin.replace(/\/$/, "")}/auth/notion/callback`;

/** HMAC secret for the OAuth `state`. Generated once and kept locally. */
function stateSecret(): string {
  const fromEnv = env("NOTION_OAUTH_STATE_SECRET");
  if (fromEnv) return fromEnv;
  const dir = dataDir();
  const f = join(dir, "state-secret-notion");
  if (existsSync(f)) {
    const v = readFileSync(f, "utf8");
    if (v && v.trim()) return v.trim();
  }
  mkdirSync(dir, { recursive: true });
  const secret = randomBytes(32).toString("hex");
  writeFileSync(f, secret, { mode: 0o600 });
  return secret;
}

/** Sign an OAuth `state`: `nonce.mac(nonce)`. Notion needs no PKCE. */
export function signState(): { state: string } {
  const nonce = randomBytes(16).toString("hex");
  const mac = createHmac("sha256", stateSecret()).update(nonce).digest("base64url");
  return { state: `${nonce}.${mac}` };
}

export function verifyState(state: string): { ok: boolean } {
  const [nonce, got] = state.split(".");
  if (!nonce || !got) return { ok: false };
  const want = Buffer.from(createHmac("sha256", stateSecret()).update(nonce).digest("base64url"));
  const g = Buffer.from(got);
  if (g.length !== want.length || !timingSafeEqual(g, want)) return { ok: false };
  return { ok: true };
}

export function authorizationUrl(origin: string, state: string): string {
  const p = new URLSearchParams({
    client_id: clientId(),
    response_type: "code",
    owner: "user",
    redirect_uri: notionRedirectUri(origin),
    state,
  });
  return `${AUTHORIZE_URL}?${p}`;
}

export type NotionTokenResponse = {
  access_token: string;
  bot_id?: string;
  workspace_id?: string;
  workspace_name?: string;
};

export async function exchangeCode(code: string, origin: string): Promise<NotionTokenResponse> {
  const basic = Buffer.from(`${clientId()}:${clientSecret()}`).toString("base64");
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/json",
      "Notion-Version": NOTION_VERSION,
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: notionRedirectUri(origin),
    }),
  });
  if (!r.ok) throw new Error(`Notion respondió ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as NotionTokenResponse;
}

export function saveToken(t: NotionTokenResponse): void {
  local.saveNotionToken({
    access_token: t.access_token,
    workspace_id: t.workspace_id ?? "",
    workspace_name: t.workspace_name ?? "",
    bot_id: t.bot_id ?? null,
    connected_at: new Date().toISOString(),
  });
}

export function disconnectNotion(): void {
  local.removeNotionToken();
}

export function notionConnection(): { connected: boolean; workspace: string | null } {
  const t = local.loadNotionToken();
  return { connected: !!t?.access_token, workspace: t?.workspace_name || null };
}

/** The stored access token, or a clear error when Notion is not connected. */
export function getNotionToken(): string {
  const t = local.loadNotionToken();
  if (!t?.access_token) throw new Error(NOTION_NOT_CONNECTED);
  return t.access_token;
}
