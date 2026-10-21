// SPDX-License-Identifier: MIT
// The cost of a regular expression, measured instead of guessed.
//
// The gate runs the owner's patterns against every message of the turn, on the
// thread that serves the app. A pattern that backtracks catastrophically does
// not fail: it freezes the process. These tests fix the floor that keeps
// that from happening, and they do it by *measuring* the pattern, so a form
// nobody thought of is caught too.
import { describe, expect, it } from "vitest";
import { isPatternTooSlow, measurePattern, PATTERN_COST_LIMIT_MS } from "./redos.server";

describe("isPatternTooSlow", () => {
  it("rejects the patterns that freeze the process", () => {
    // The three the task measured. `.*.*.*.*.*.*b` is thirteen characters — half
    // the limit the panel allows — and it froze the app for 23.4 s with a
    // sixty-character message (measured against the module of the repo).
    expect(isPatternTooSlow(".*.*.*.*.*.*b")).toBe(true);
    expect(isPatternTooSlow(".*.*.*.*.*.*.*.*.*b")).toBe(true);
    expect(isPatternTooSlow("a*".repeat(14) + "b")).toBe(true);
    // The forms the shape rule already knew about, which cost the same.
    expect(isPatternTooSlow("(a+)+$")).toBe(true);
    expect(isPatternTooSlow("((a+))+$")).toBe(true);
  });

  it("rejects a shape the old detector never saw", () => {
    // The hole: these are quantifiers in sequence at the same level, not a
    // group that repeats, so `hasNestedQuantifier` said false. For the engine
    // it is the same trap as `(a+)+`: there are 2^n ways of splitting the
    // input between them.
    expect(isPatternTooSlow("a*a*a*a*a*a*b")).toBe(true);
    expect(isPatternTooSlow("a+a+a+a+a+a+b")).toBe(true);
    expect(isPatternTooSlow("[a-z]*[a-z]*[a-z]*[a-z]*[a-z]*z")).toBe(true);
    expect(isPatternTooSlow("(\\w+\\s?)+$")).toBe(true);
    expect(isPatternTooSlow("(x+x+)+y")).toBe(true);
  });

  it("keeps the patterns an owner legitimately writes", () => {
    // The cost of a legitimate pattern is a millisecond or two against the
    // probe; a catastrophic one needs seconds. The two are far apart, so the
    // limit does not have to be tight to tell them apart.
    expect(isPatternTooSlow("hola")).toBe(false);
    expect(isPatternTooSlow("hola|adios")).toBe(false);
    expect(isPatternTooSlow("ignora.+instrucciones")).toBe(false);
    expect(isPatternTooSlow("revela (tus|las) instrucciones")).toBe(false);
    expect(isPatternTooSlow("ignore (your )?safety")).toBe(false);
    expect(isPatternTooSlow("(\\d{2})+")).toBe(false);
    expect(isPatternTooSlow("\\d{2}-\\d{2}-\\d{4}")).toBe(false);
    expect(isPatternTooSlow("^[a-z]+@[a-z]+\\.(com|es)$")).toBe(false);
    expect(isPatternTooSlow("ignora (todas )?(las |tus )?(instrucciones|reglas)")).toBe(false);
    expect(isPatternTooSlow("colou?r")).toBe(false);
    expect(isPatternTooSlow("precio\\s*[:=]\\s*\\d+")).toBe(false);
    expect(isPatternTooSlow("[A-Z]{2,6}-\\d{3,}")).toBe(false);
  });

  it("answers the same thing every time it is asked", () => {
    // The verdict is cached, and a cached verdict that disagreed with the
    // measurement would be a coin toss: the panel would accept a pattern that
    // one save later freezes the app.
    const pattern = ".*.*.*.*.*.*b";
    expect(isPatternTooSlow(pattern)).toBe(true);
    expect(isPatternTooSlow(pattern)).toBe(true);
    expect(isPatternTooSlow(pattern)).toBe(true);
  });

  it("does not measure a pattern that does not compile", () => {
    // An invalid pattern is rejected as invalid, not as slow: the two
    // problems have different messages and the owner has to know which one.
    expect(isPatternTooSlow("(unbalanced")).toBe(false);
  });
});

describe("measurePattern", () => {
  it("measures a fast match in milliseconds", () => {
    const ms = measurePattern("hola", "hola mundo");
    expect(ms).not.toBeNull();
    expect(ms).toBeLessThan(PATTERN_COST_LIMIT_MS);
  });

  it("gives up on a match that does not come back", () => {
    // The measurement has to be able to stop: otherwise measuring a bad
    // pattern would freeze the process that asked for the measurement.
    const ms = measurePattern("(a+)+$", "a".repeat(2000) + "!");
    expect(ms).toBeNull();
  });
});
