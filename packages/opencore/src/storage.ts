// SPDX-License-Identifier: MIT
// OpenCore — where data lives.
// Cloud uses Supabase (Postgres + RLS). Local uses files in your data
// directory (~/.openexpert/*.json by default). Same interface, two drawers.

export type TableName =
  | "experts"
  | "expert_access"
  | "user_roles"
  | "integrations"
  | "processes"
  | "invoices"
  | "campaigns"
  | "invitations"
  | "activity"
  | "chat_messages"
  | "profiles";

export type Row = Record<string, unknown>;

export interface Storage {
  readonly kind: "supabase" | "file";
  list(table: TableName): Promise<Row[]>;
  insert(table: TableName, rows: Row | Row[]): Promise<void>;
}

export const LOCAL_TABLES: TableName[] = [
  "experts",
  "expert_access",
  "user_roles",
  "integrations",
  "processes",
  "invoices",
  "campaigns",
  "invitations",
  "activity",
  "chat_messages",
  "profiles",
];
