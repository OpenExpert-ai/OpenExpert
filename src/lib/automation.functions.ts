// SPDX-License-Identifier: MIT
// The browser calls the check while the application is open; there is no
// background daemon. A deterministic activity ID makes retries and multiple
// windows harmless inside the local server.
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import * as schema from "../../drizzle/schema";
import { runDailyReportIfDue } from "./automation.server";
import { getDb, now, persist } from "./db.server";

const KEY = "daily-overdue-report";

export const getDailyReport = createServerFn({ method: "GET" }).handler(async () => {
  const { orm } = await getDb();
  const row = orm.select().from(schema.settings).where(eq(schema.settings.key, KEY)).get();
  return { enabled: row?.value === true };
});

export const setDailyReport = createServerFn({ method: "POST" })
  .validator((input) => z.object({ enabled: z.boolean() }).parse(input))
  .handler(async ({ data }) => {
    const { orm } = await getDb();
    orm
      .insert(schema.settings)
      .values({ key: KEY, value: data.enabled, updatedAt: now() })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: data.enabled, updatedAt: now() },
      })
      .run();
    await persist();
    return { enabled: data.enabled };
  });

/** Check once per local day. Reports counts only and never changes an invoice. */
export const runDailyReport = createServerFn({ method: "POST" }).handler(() =>
  runDailyReportIfDue(),
);
