// SPDX-License-Identifier: MIT
import { createFileRoute } from "@tanstack/react-router";
import { exchangeCode, saveTokens, verifyState } from "@/lib/drive-tokens.server";

// Google redirects here as a full page load after the user grants Drive access.
// The OAuth `state` carries the HMAC-signed user id, so no session JWT has to
// travel through the URL.
export const Route = createFileRoute("/auth/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = url.origin;
        const back = (msg: string, ok: boolean) =>
          new Response(null, {
            status: 302,
            headers: {
              location: `${origin}/integrations/sources?gdrive=${ok ? "ok" : encodeURIComponent(msg)}`,
            },
          });

        const code = url.searchParams.get("code");
        if (!code) return back("no_code", false);

        const userId = await verifyState(url.searchParams.get("state") ?? "");
        if (!userId) return back("bad_state", false);

        try {
          const tokens = await exchangeCode(code, origin);
          await saveTokens(userId, tokens);
          return back("ok", true);
        } catch (e) {
          console.error("google drive oauth failed", e);
          return back("exchange_failed", false);
        }
      },
    },
  },
});
