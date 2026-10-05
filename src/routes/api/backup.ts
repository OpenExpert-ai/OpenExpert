// SPDX-License-Identifier: MIT
import { createFileRoute } from "@tanstack/react-router";
import { buildBackup } from "@/lib/backup.server";
import { forbidden, isSameOrigin } from "@/lib/http.server";

export const Route = createFileRoute("/api/backup")({
  server: {
    handlers: {
      GET: ({ request }) => {
        // The bundle embeds secrets.json and credentials.json. Block
        // cross-origin downloads triggered by another site; direct/local
        // requests (no Origin header) still work.
        if (!isSameOrigin(request)) return forbidden();
        const json = JSON.stringify(buildBackup(), null, 2);
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
        return new Response(json, {
          headers: {
            "content-type": "application/json",
            "content-disposition": `attachment; filename="openexpert-backup-${stamp}.json"`,
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
