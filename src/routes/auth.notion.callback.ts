// SPDX-License-Identifier: MIT
import { createFileRoute } from "@tanstack/react-router";
import { exchangeCode, saveToken, verifyState } from "@/lib/notion-tokens.server";

// Notion redirects here as a full page load after the user authorizes the
// connection. The OAuth `state` is HMAC-signed; only the one-time code travels
// in the URL. The access token is long-lived (no refresh token).
export const Route = createFileRoute("/auth/notion/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = url.origin;
        const back = (msg: string, ok: boolean) =>
          new Response(null, {
            status: 302,
            headers: {
              location: `${origin}/integrations/sources?notion=${ok ? "ok" : encodeURIComponent(msg)}`,
            },
          });

        const error = url.searchParams.get("error");
        if (error) return back(error, false);
        const code = url.searchParams.get("code");
        if (!code) return back("no_code", false);
        if (!verifyState(url.searchParams.get("state") ?? "").ok) return back("bad_state", false);

        try {
          const token = await exchangeCode(code, origin);
          saveToken(token);

          const { getDb, persist } = await import("@/lib/db.server");
          const { eq } = await import("drizzle-orm");
          const schema = await import("../../drizzle/schema");
          const { orm } = await getDb();
          orm
            .update(schema.integrations)
            .set({
              connected: true,
              entities: [{ name: token.workspace_name || "Notion", count: 1 }],
              lastSync: new Date().toISOString(),
            })
            .where(eq(schema.integrations.id, "notion"))
            .run();
          await persist();
          return back("ok", true);
        } catch (e) {
          console.error("notion oauth failed", e);
          return back("exchange_failed", false);
        }
      },
    },
  },
});
