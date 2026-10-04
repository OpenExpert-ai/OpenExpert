// SPDX-License-Identifier: MIT
// OpenCore — storage interface. OpenExpert is local-first: implementations
// are backed by the local data directory (SQLite / files).

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
  readonly kind: "file";
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
