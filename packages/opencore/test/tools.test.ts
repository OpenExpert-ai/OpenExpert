// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { TOOL_CATALOG } from "../src/tools.js";

describe("TOOL_CATALOG", () => {
  it("declares 14 tools", () => {
    expect(TOOL_CATALOG.length).toBe(14);
  });

  it("uses unique names", () => {
    const names = TOOL_CATALOG.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("marks propose_* tools as proposesOnly", () => {
    const proposals = TOOL_CATALOG.filter((t) => t.name.startsWith("propose_"));
    expect(proposals.length).toBeGreaterThan(0);
    for (const t of proposals) expect(t.proposesOnly).toBe(true);
  });

  it("marks drive write tools as exec", () => {
    const writes = TOOL_CATALOG.filter((t) =>
      ["create_drive_file", "update_drive_file"].includes(t.name),
    );
    for (const t of writes) expect(t.needs).toBe("exec");
  });
});
