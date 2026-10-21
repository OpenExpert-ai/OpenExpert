// SPDX-License-Identifier: MIT
// The gate must not run a pattern that can freeze the process.
//
// These tests are the acceptance of T-0184: the pattern the owner writes
// (`.*.*.*.*.*.*b`, thirteen characters) was accepted by the guard and froze
// the app for 23.4 s on a sixty-character message, because the guard only
// knew about *shapes* and this one has none — six quantifiers in sequence,
// not a group that repeats.
//
// The criterion is the **cost** of the pattern, measured against an
// adversarial input, so a form nobody thought of is caught too.
import { describe, expect, it } from "vitest";
import { detectInjection, hasNestedQuantifier } from "./injection";

/**
 * The limit of the test: a detection that takes longer than this is the
 * freeze the task measured. It is generous because the CI runner is about six
 * times slower than a developer machine, and because the first call also
 * pays for the measurement of the pattern.
 */
const LIMITE_MS = 2_000;

describe("la puerta de inyección y los patrones que congelan el proceso", () => {
  it("el patrón de la tarea no cuelga la detección", () => {
    // Measured before the fix: 23 422 ms of blocked event loop with this
    // sixty-character message. The test has to finish in milliseconds.
    const pattern = ".*.*.*.*.*.*b";
    const mensaje = "a".repeat(60);
    const started = performance.now();
    expect(detectInjection(mensaje, [pattern])).toBe(false);
    expect(performance.now() - started).toBeLessThan(LIMITE_MS);
  });

  it("el patrón con diez estrellas tampoco cuelga", () => {
    // With the old code this one never came back: the test timed out at
    // ninety seconds without a result.
    const pattern = ".*.*.*.*.*.*.*.*.*b";
    const mensaje = "a".repeat(40);
    const started = performance.now();
    expect(detectInjection(mensaje, [pattern])).toBe(false);
    expect(performance.now() - started).toBeLessThan(LIMITE_MS);
  });

  it("los tres patrones de la tarea no tienen la forma que el detector viejo buscaba", () => {
    // `hasNestedQuantifier` — the shape rule — said false for all three.
    // They are the shapes nobody thought of, which is why the guard now
    // measures the cost instead of listing shapes.
    expect(hasNestedQuantifier(".*.*.*.*.*.*b")).toBe(false);
    expect(hasNestedQuantifier(".*.*.*.*.*.*.*.*.*b")).toBe(false);
    expect(hasNestedQuantifier("a*".repeat(14) + "b")).toBe(false);
  });

  it("un patrón legítimo sigue funcionando", () => {
    // The gate cannot be closed off: a pattern an owner writes has to keep
    // blocking what it is meant to block.
    expect(detectInjection("hablemos de zanahorias", ["zanahorias"])).toBe(true);
    expect(detectInjection("hablemos de acelga", ["zanahorias"])).toBe(false);
  });
});
