// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { consumeLastCapturedError, describeError } from "./error-capture";

/** Clear any error recorded by a previous test. */
function drain() {
  consumeLastCapturedError();
}

describe("describeError", () => {
  it("returns an empty string for null / undefined", () => {
    expect(describeError(null)).toBe("");
    expect(describeError(undefined)).toBe("");
  });

  it("passes a plain string through unchanged", () => {
    expect(describeError("plain failure")).toBe("plain failure");
  });

  it("JSON-stringifies non-Error values", () => {
    expect(describeError({ code: 7, ok: false })).toBe('{"code":7,"ok":false}');
    expect(describeError(42)).toBe("42");
  });

  it("falls back to String() when JSON.stringify throws (circular)", () => {
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;
    expect(describeError(circular)).toBe("[object Object]");
  });

  it("uses the stack when present", () => {
    const err = new Error("boom");
    err.stack = "CUSTOM STACK";
    expect(describeError(err)).toBe("CUSTOM STACK");
  });

  it("falls back to name: message when the stack is missing", () => {
    const err = new Error("no stack");
    delete err.stack;
    expect(describeError(err)).toBe("Error: no stack");
  });

  it("appends a numeric status (or statusCode)", () => {
    const withStatus = Object.assign(new Error("a"), { stack: "S", status: 500 });
    expect(describeError(withStatus)).toBe("S (status 500)");

    const withStatusCode = Object.assign(new Error("b"), { stack: "S", statusCode: 503 });
    expect(describeError(withStatusCode)).toBe("S (status 503)");

    const nonNumeric = Object.assign(new Error("c"), { stack: "S", status: "500" });
    expect(describeError(nonNumeric)).toBe("S");
  });

  it("walks the cause chain and labels nested errors", () => {
    const inner = new Error("inner");
    inner.stack = "INNER";
    const outer = new Error("outer", { cause: inner });
    outer.stack = "OUTER";
    expect(describeError(outer)).toBe("OUTER\ncaused by: INNER");
  });

  it("appends a non-Error cause without the 'caused by' label", () => {
    // Documents current behaviour: only Error causes get the label.
    const err = Object.assign(new Error("outer"), { stack: "OUTER", cause: "boom" });
    expect(describeError(err)).toBe("OUTER\nboom");
  });

  it("stringifies a plain object cause", () => {
    const err = Object.assign(new Error("outer"), { stack: "OUTER", cause: { code: 1 } });
    expect(describeError(err)).toBe('OUTER\n{"code":1}');
  });

  it("caps the cause chain at five levels", () => {
    const errors: Error[] = [];
    for (let i = 0; i < 7; i++) {
      const e = new Error(`level-${i}`);
      e.stack = `L${i}`;
      errors.push(e);
    }
    errors[6]!.message = "deep-most";
    for (let i = 0; i < 6; i++) errors[i]!.cause = errors[i + 1]!;

    const out = describeError(errors[0]!);
    expect((out.match(/caused by:/g) ?? []).length).toBe(4); // depth 0..4 -> 5 parts
    expect(out).toContain("L4");
    expect(out).not.toContain("L5");
    expect(out).not.toContain("deep-most");
  });

  it("truncates the description to 8000 characters", () => {
    const err = new Error("big");
    err.stack = "x".repeat(20_000);
    expect(describeError(err).length).toBe(8_000);
  });
});

describe("console.error interception", () => {
  beforeEach(() => drain());
  afterEach(() => vi.useRealTimers());

  it("records and expands Error-like arguments", () => {
    const err = new Error("logboom");
    console.error(err);
    expect(consumeLastCapturedError()).toBe(err);
    // Consuming clears the slot.
    expect(consumeLastCapturedError()).toBeUndefined();
  });

  it("does not record non-Error arguments", () => {
    console.error("plain message", 42);
    expect(consumeLastCapturedError()).toBeUndefined();
  });

  it("passes the expanded description to the underlying console.error", async () => {
    vi.resetModules();
    const previous = console.error;
    const sink = vi.fn();
    // The module binds console.error at import time, so install the sink first.
    console.error = sink as unknown as typeof console.error;
    try {
      const fresh = await import("./error-capture");
      const err = new Error("expandme");
      console.error(err);

      expect(sink).toHaveBeenCalledTimes(1);
      const arg = sink.mock.calls[0]![0];
      expect(typeof arg).toBe("string");
      expect(arg).toContain("Error: expandme");
      expect(fresh.consumeLastCapturedError()).toBe(err);
    } finally {
      console.error = previous;
    }
  });
});

describe("consumeLastCapturedError TTL", () => {
  afterEach(() => {
    vi.useRealTimers();
    drain();
  });

  it("returns an error captured within the 5s window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const err = new Error("fresh");
    console.error(err);
    vi.advanceTimersByTime(4_999);
    expect(consumeLastCapturedError()).toBe(err);
  });

  it("discards an error captured more than 5s ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    console.error(new Error("stale"));
    vi.advanceTimersByTime(5_001);
    expect(consumeLastCapturedError()).toBeUndefined();
  });

  it("returns undefined when nothing was captured", () => {
    drain();
    expect(consumeLastCapturedError()).toBeUndefined();
  });
});

describe("global error event listeners", () => {
  beforeEach(() => drain());

  it("records the error carried by an error event", () => {
    const err = new Error("evt");
    globalThis.dispatchEvent(new ErrorEvent("error", { error: err }));
    expect(consumeLastCapturedError()).toBe(err);
  });

  it("records the event itself when it carries no error", () => {
    const ev = new Event("error");
    globalThis.dispatchEvent(ev);
    expect(consumeLastCapturedError()).toBe(ev);
  });

  it("records the reason of an unhandled rejection", () => {
    const reason = new Error("rejected");
    const ev = new Event("unhandledrejection");
    Object.defineProperty(ev, "reason", { value: reason });
    globalThis.dispatchEvent(ev);
    expect(consumeLastCapturedError()).toBe(reason);
  });
});
