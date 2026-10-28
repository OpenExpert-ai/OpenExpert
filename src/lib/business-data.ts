// SPDX-License-Identifier: MIT
// Does the assistant have business data to answer with?
//
// Two different things can make that true, and only one of them is a connector:
// an integration can be connected, or the owner can have imported their own CSV
// into the same tables. The chat window used to look at the connectors alone, so
// it announced "no data to query" over a database the user had just filled.

/** Integrations that feed the business tables (deals, invoices, campaigns, accounts). */
export const BUSINESS_SOURCE_IDS = [
  "pipedrive",
  "salesforce",
  "holded",
  "gmail",
  "slack",
  "ga",
  "meta",
];

/** What the predicate needs to know: connected integrations and how many business rows exist. */
export type BusinessDataInput =
  | {
      integrations?: { id: string; connected: boolean }[];
      /** Rows across every business table, from the workspace read model. */
      businessRows?: number;
    }
  | null
  | undefined;

/**
 * True when there is something to query: a connected integration or at least one
 * row in the local tables. `hasMore`-style caveats do not apply — an empty
 * database and a database nobody connected are the only cases without data.
 */
export function hasBusinessData(ws: BusinessDataInput): boolean {
  if (!ws) return false;
  if ((ws.businessRows ?? 0) > 0) return true;
  return (ws.integrations ?? []).some((i) => BUSINESS_SOURCE_IDS.includes(i.id) && i.connected);
}
