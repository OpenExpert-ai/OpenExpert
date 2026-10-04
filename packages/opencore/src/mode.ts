// SPDX-License-Identifier: MIT
// OpenCore — execution mode.
// local:  1 user on your machine, no login, no Supabase.
// cloud:  multi-user (Supabase Auth + RLS) deployment.

export type OpenExpertMode = "local" | "cloud";

export function getMode(env: NodeJS.ProcessEnv = process.env): OpenExpertMode {
  return env["OPENEXPERT_MODE"] === "local" ? "local" : "cloud";
}

export function isLocal(env: NodeJS.ProcessEnv = process.env): boolean {
  return getMode(env) === "local";
}

/** Alias for `isLocal`. The application historically uses `isLocalMode`. */
export const isLocalMode = isLocal;

export const LOCAL_OWNER_ID = "local-owner";
