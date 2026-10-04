// SPDX-License-Identifier: MIT
// Server-only. Stores each user's Google OAuth tokens and refreshes them on demand.
// Tokens live in public.google_tokens, which only service_role can touch — the
// browser only ever receives the short-lived Google access token indirectly,
// through the chat/tools that already run behind requireSupabaseAuth.
import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isLocalMode, LOCAL_OWNER_ID } from "@/lib/opencore/mode";

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

/** The OAuth `state` carries the user id authenticated by HMAC, so the callback
 *  can identify the user without putting a session JWT in a URL. */
async function mac(userId: string) {
  const secret = env("GOOGLE_OAUTH_STATE_SECRET") || env("SUPABASE_SERVICE_ROLE_KEY") || "";
  return createHmac("sha256", secret).update(userId).digest("base64url");
}

export async function signState(userId: string) {
  return `${userId}.${await mac(userId)}`;
}

export async function verifyState(state: string): Promise<string | null> {
  const i = state.lastIndexOf(".");
  if (i < 1) return null;
  const userId = state.slice(0, i);
  const expected = await mac(userId);
  const got = Buffer.from(state.slice(i + 1));
  const want = Buffer.from(expected);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  // En local el usuario es "local-owner"; en cloud, UUID de Supabase.
  if (userId === LOCAL_OWNER_ID) return userId;
  return /^[0-9a-f-]{36}$/i.test(userId) ? userId : null;
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

export async function saveTokens(userId: string, t: Tokens) {
  // Modo local: fichero en tu PC, nunca a la nube.
  if (isLocalMode() || userId === LOCAL_OWNER_ID) {
    const local = await import("@/lib/opencore/local-secrets.server");
    const prev = local.loadLocalTokens(userId);
    const refresh = t.refresh_token || prev?.refresh_token || null;
    local.saveLocalTokens(userId, {
      access_token: t.access_token,
      refresh_token: refresh,
      expires_at: new Date(Date.now() + (t.expires_in || 3600) * 1000).toISOString(),
    });
    return refresh;
  }
  const { data: prev } = await supabaseAdmin
    .from("google_tokens")
    .select("refresh_token")
    .eq("user_id", userId)
    .maybeSingle();
  // Google omits refresh_token when the user re-authorises without revoking, so
  // keep the one we already hold rather than nulling it.
  const refresh = t.refresh_token || prev?.refresh_token || null;
  const { error } = await supabaseAdmin.from("google_tokens").upsert(
    {
      user_id: userId,
      access_token: t.access_token,
      refresh_token: refresh,
      expires_at: new Date(Date.now() + (t.expires_in || 3600) * 1000).toISOString(),
      scopes: t.scope || DRIVE_SCOPES.join(" "),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);
  return refresh;
}

export async function disconnectDrive(userId: string) {
  if (isLocalMode() || userId === LOCAL_OWNER_ID) {
    const local = await import("@/lib/opencore/local-secrets.server");
    const prev = local.loadLocalTokens(userId);
    local.removeLocalTokens(userId);
    if (prev?.refresh_token && env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET")) {
      await fetch(`https://oauth2.googleapis.com/revoke`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: prev.refresh_token!,
          client_id: env("GOOGLE_CLIENT_ID")!,
          client_secret: env("GOOGLE_CLIENT_SECRET")!,
        }),
      }).catch(() => {});
    }
    return;
  }
  const { data } = await supabaseAdmin
    .from("google_tokens")
    .select("access_token,refresh_token")
    .eq("user_id", userId)
    .maybeSingle();
  await supabaseAdmin.from("google_tokens").delete().eq("user_id", userId);
  // Best effort: drop our grant on Google's side too.
  if (data?.refresh_token && env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET")) {
    await fetch(`https://oauth2.googleapis.com/revoke`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token: data.refresh_token,
        client_id: env("GOOGLE_CLIENT_ID")!,
        client_secret: env("GOOGLE_CLIENT_SECRET")!,
      }),
    }).catch(() => {});
  }
}

export async function driveConnection(userId: string) {
  if (isLocalMode() || userId === LOCAL_OWNER_ID) {
    const local = await import("@/lib/opencore/local-secrets.server");
    const t = local.loadLocalTokens(userId);
    return {
      connected: !!t?.access_token,
      scopes: t ? DRIVE_SCOPES.join(" ") : null,
      connectedAt: null,
    };
  }
  const { data } = await supabaseAdmin
    .from("google_tokens")
    .select("scopes,expires_at,updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  return { connected: !!data, scopes: data?.scopes ?? null, connectedAt: data?.updated_at ?? null };
}

/** A valid access token for this user, refreshing it first when stale. */
export async function getAccessToken(userId: string): Promise<string> {
  if (isLocalMode() || userId === LOCAL_OWNER_ID) {
    const local = await import("@/lib/opencore/local-secrets.server");
    const data = local.loadLocalTokens(userId);
    if (!data?.access_token) throw new Error(DRIVE_NOT_CONNECTED);
    if (new Date(data.expires_at).getTime() > Date.now() + 60_000) return data.access_token;
    if (!data.refresh_token) throw new Error(`${DRIVE_NOT_CONNECTED} (la autorización caducó)`);
    const t = await postToken({ grant_type: "refresh_token", refresh_token: data.refresh_token });
    local.saveLocalTokens(userId, {
      access_token: t.access_token,
      refresh_token: t.refresh_token || data.refresh_token,
      expires_at: new Date(Date.now() + (t.expires_in || 3600) * 1000).toISOString(),
    });
    return t.access_token;
  }
  const { data, error } = await supabaseAdmin
    .from("google_tokens")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.access_token) throw new Error(DRIVE_NOT_CONNECTED);
  if (new Date(data.expires_at).getTime() > Date.now() + 60_000) return data.access_token;
  if (!data.refresh_token) throw new Error(`${DRIVE_NOT_CONNECTED} (la autorización caducó)`);

  const t = await postToken({
    grant_type: "refresh_token",
    refresh_token: data.refresh_token,
  });
  const { error: upErr } = await supabaseAdmin
    .from("google_tokens")
    .update({
      access_token: t.access_token,
      expires_at: new Date(Date.now() + (t.expires_in || 3600) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (upErr) throw new Error(upErr.message);
  return t.access_token;
}
