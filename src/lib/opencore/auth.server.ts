// SPDX-License-Identifier: MIT
// Server-side unified context: local owner in OpenCore mode, Supabase-backed
// `getCtx` in cloud mode. Access helpers come from @openexpert/opencore.

import type { Ctx } from "@/lib/ee.server";
import { LOCAL_OWNER_ID, isLocalMode } from "./mode";

export async function getUnifiedCtx(userId: string): Promise<Ctx> {
  if (isLocalMode() || userId === LOCAL_OWNER_ID) {
    return { userId: LOCAL_OWNER_ID, role: "ADMIN", name: "Propietario local", access: {} };
  }
  const ee = await import("@/lib/ee.server");
  return ee.getCtx(userId);
}

export { canRead as canReadUnified, canExec as canExecUnified } from "@openexpert/opencore/auth";
