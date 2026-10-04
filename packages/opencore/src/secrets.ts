// SPDX-License-Identifier: MIT
// OpenCore — where Google Drive tokens live.
// Cloud: google_tokens table (only the server touches it).
// Local: a file on your machine (~/.openexpert/credentials.json by
// default), never uploaded to Git.

export type DriveTokenRow = {
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
  scopes: string;
  updated_at: string;
};

export interface TokenStore {
  readonly kind: "file";
  load(userId: string): Promise<DriveTokenRow | null>;
  save(userId: string, row: DriveTokenRow): Promise<void>;
  remove(userId: string): Promise<void>;
}

export function credentialsPath(dataDir: string): string {
  const home = dataDir.startsWith("~/")
    ? `${process.env["HOME"] || "~"}/${dataDir.slice(2)}`
    : dataDir;
  return `${home.replace(/\/$/, "")}/credentials.json`;
}
