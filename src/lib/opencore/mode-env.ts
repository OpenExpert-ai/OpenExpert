// SPDX-License-Identifier: MIT
// Browser-side mode detection. Vite injects VITE_OPENEXPERT_MODE from
// OPENEXPERT_MODE at build/dev time (see vite.config.ts). The filename avoids
// the `*.client.*` pattern that TanStack's import-protection blocks on server.

export function isLocalClient(): boolean {
  const env = import.meta.env as Record<string, string | undefined>;
  return env["VITE_OPENEXPERT_MODE"] === "local";
}
