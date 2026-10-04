// SPDX-License-Identifier: MIT
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./drizzle/schema.ts",
  out: "./drizzle/migrations",
  dbCredentials: {
    // Direct Postgres connection string. Use the Supabase *pooler* (session mode,
    // port 5432) if your network is IPv4-only — the direct host is IPv6-only.
    url: process.env.DATABASE_URL ?? "",
  },
});
