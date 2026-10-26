// SPDX-License-Identifier: MIT
// The cost probe has to reach the backtracking path of whatever a pattern matches, and it only
// reached it for literal letters: `probeChars` builds the input from the pattern's literal
// letters plus `a`, `b`, `c`, so a pattern that only blows up on digits (or on whitespace) fails
// on the first character of every probe and is measured at 0 ms. Measured on main: 15 636 ms of
// blocked event loop for `\d+\d+\d+\d+\d+\d+x` against sixty digits followed by a letter, and
// the verdict was "not too slow".
import { describe, expect, it } from "vitest";

import { isPatternTooSlow } from "./redos.server";

describe("la sonda del medidor de ReDoS", () => {
  it("cuenta un patrón que solo se dispara con dígitos", () => {
    expect(isPatternTooSlow("\\d+\\d+\\d+\\d+\\d+\\d+x")).toBe(true);
  });

  it("cuenta el mismo patrón escrito con una clase de dígitos", () => {
    expect(isPatternTooSlow("[0-9]+[0-9]+[0-9]+[0-9]+[0-9]+x")).toBe(true);
  });

  it("cuenta un patrón que solo se dispara con espacios", () => {
    expect(isPatternTooSlow("\\s+\\s+\\s+\\s+\\s+x")).toBe(true);
  });

  it("no rechaza los patrones con dígitos que el dueño escribe de verdad", () => {
    for (const legitimo of ["^\\d{9}$", "\\d{1,3}", "^\\+?\\d{9,15}$"]) {
      expect(isPatternTooSlow(legitimo), legitimo).toBe(false);
    }
  });
});
