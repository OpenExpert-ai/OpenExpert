// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { LOCAL_OWNER_ID, canExec, canRead, localOwnerCtx } from "../src/auth.js";
import type { Ctx } from "../src/auth.js";

function ctx(overrides: Partial<Ctx> & Pick<Ctx, "userId" | "role">): Ctx {
  return {
    name: "Test user",
    access: {},
    ...overrides,
  };
}

describe("localOwnerCtx", () => {
  it("returns an ADMIN owner", () => {
    const c = localOwnerCtx();
    expect(c.userId).toBe(LOCAL_OWNER_ID);
    expect(c.role).toBe("ADMIN");
  });
});

describe("canRead", () => {
  it("grants the local owner everything", () => {
    expect(canRead(localOwnerCtx(), "anything")).toBe(true);
  });

  it("grants ADMIN read on every expert", () => {
    const c = ctx({ userId: "u-admin", role: "ADMIN" });
    expect(canRead(c, "ventas")).toBe(true);
    expect(canRead(c, "finanzas")).toBe(true);
  });

  it("grants INTERMEDIO read when their expert_access allows it", () => {
    const c = ctx({
      userId: "u-mid",
      role: "INTERMEDIO",
      access: { ventas: "read" },
    });
    expect(canRead(c, "ventas")).toBe(true);
    expect(canRead(c, "finanzas")).toBe(false);
  });

  it("denies LECTOR with no access", () => {
    const c = ctx({ userId: "u-lector", role: "LECTOR" });
    expect(canRead(c, "ventas")).toBe(false);
  });
});

describe("canExec", () => {
  it("denies LECTOR regardless of access", () => {
    const c = ctx({
      userId: "u-lector",
      role: "LECTOR",
      access: { ventas: "exec" },
    });
    expect(canExec(c, "ventas")).toBe(false);
  });

  it("grants INTERMEDIO exec only when explicit", () => {
    const c = ctx({
      userId: "u-mid",
      role: "INTERMEDIO",
      access: { ventas: "exec" },
    });
    expect(canExec(c, "ventas")).toBe(true);
    expect(canExec(c, "finanzas")).toBe(false);
  });

  it("grants ADMIN everywhere", () => {
    const c = ctx({ userId: "u-admin", role: "ADMIN" });
    expect(canExec(c, "ventas")).toBe(true);
    expect(canExec(c, "finanzas")).toBe(true);
  });
});
