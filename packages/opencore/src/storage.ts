// SPDX-License-Identifier: MIT
// OpenCore — storage interface. OpenExpert is local-first: implementations
// are backed by the local data directory (SQLite / files).

export type TableName =
  | "experts"
  | "integrations"
  | "processes"
  | "activity"
  | "chat_messages"
  | "deals"
  | "invoices"
  | "campaigns"
  | "accounts"
  | "settings";

export type Row = Record<string, unknown>;

export interface Storage {
  readonly kind: "file";
  list(table: TableName): Promise<Row[]>;
  insert(table: TableName, rows: Row | Row[]): Promise<void>;
}

export const LOCAL_TABLES: TableName[] = [
  "experts",
  "integrations",
  "processes",
  "activity",
  "chat_messages",
  "deals",
  "invoices",
  "campaigns",
  "accounts",
  "settings",
];
