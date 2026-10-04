// SPDX-License-Identifier: MIT
// OpenExpert model gateway.
//
// The gateway is a hosted OpenAI-compatible endpoint that proxies model
// requests on behalf of an account holder. The same MIT client code can
// point at a self-hosted gateway or at the hosted one; the difference is
// only configuration.
//
// In the open-source edition, the gateway client is just another model
// provider. The server-side implementation (rate limits, model catalogue,
// quota) is deployed separately and is *also* MIT-licensed.

import type { ModelSelection } from "./model-provider.js";

export type GatewayConfig = {
  /** Base URL of the OpenExpert gateway (OpenAI-compatible). */
  baseURL: string;
  /** Account token issued by the gateway. */
  apiKey: string;
  /** Optional user-facing identifier for audit logs. */
  account?: string;
};

export function loadGatewayConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig | null {
  const baseURL = env["OPENEXPERT_GATEWAY_URL"];
  const apiKey = env["OPENEXPERT_API_KEY"];
  if (!baseURL || !apiKey) return null;
  return {
    baseURL: baseURL.replace(/\/+$/, ""),
    apiKey,
    ...(env["OPENEXPERT_GATEWAY_ACCOUNT"] ? { account: env["OPENEXPERT_GATEWAY_ACCOUNT"] } : {}),
  };
}

export function gatewayHint(sel: ModelSelection): string | null {
  if (sel.provider !== "openexpert") return null;
  if (!sel.keySource) return "OPENEXPERT_API_KEY";
  return null;
}

/**
 * Builds the headers attached to every gateway request. Centralised so the
 * hosted gateway can recognise the client without trusting the bearer alone.
 */
export function gatewayHeaders(cfg: GatewayConfig): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${cfg.apiKey}`,
    "User-Agent": "@openexpert/opencore",
  };
  if (cfg.account) headers["X-OpenExpert-Account"] = cfg.account;
  return headers;
}
