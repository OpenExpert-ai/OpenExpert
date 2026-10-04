// SPDX-License-Identifier: MIT
// OpenCore — who you are.
// Cloud: you come from Supabase Auth (Google) and your permission comes
// from user_roles + expert_access.
// Local: you are the owner of your machine, ADMIN of everything, no login.

import { LOCAL_OWNER_ID } from "./mode.js";

export type Role = "ADMIN" | "INTERMEDIO" | "LECTOR";
export type Access = "none" | "read" | "exec";

export type Ctx = {
  userId: string;
  name: string;
  role: Role;
  access: Record<string, Access>;
};

export { LOCAL_OWNER_ID };

export function localOwnerCtx(): Ctx {
  return { userId: LOCAL_OWNER_ID, name: "Local owner", role: "ADMIN", access: {} };
}

export function canRead(c: Ctx, expertId: string): boolean {
  if (c.userId === LOCAL_OWNER_ID) return true;
  return c.role === "ADMIN" || (c.access[expertId] ?? "none") !== "none";
}

export function canExec(c: Ctx, expertId: string): boolean {
  if (c.userId === LOCAL_OWNER_ID) return true;
  return c.role !== "LECTOR" && (c.role === "ADMIN" || c.access[expertId] === "exec");
}
