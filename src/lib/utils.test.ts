// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";

import { cn } from "./utils";

describe("cn", () => {
  it("returns an empty string when given nothing", () => {
    expect(cn()).toBe("");
    expect(cn(undefined, null, false, "", 0)).toBe("");
  });

  it("joins the truthy class values", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("accepts conditional, array and object inputs", () => {
    // A variable, not a literal: the same shape callers use (`cond && "cls"`).
    const hidden = false;
    expect(cn("base", hidden && "nope", undefined)).toBe("base");
    expect(cn(["a", "b"], { c: true, d: false })).toBe("a b c");
  });

  it("merges conflicting tailwind utilities, keeping the last one", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
    // Non-conflicting classes must both survive.
    expect(cn("px-2", "py-4")).toBe("px-2 py-4");
  });

  it("lets a later conditional override an earlier base class", () => {
    const on = true;
    const off = false;
    expect(cn("bg-red-500", on && "bg-green-500")).toBe("bg-green-500");
    expect(cn("bg-red-500", off && "bg-green-500")).toBe("bg-red-500");
  });
});
