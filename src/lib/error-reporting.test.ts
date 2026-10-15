// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it, vi } from "vitest";

import { reportAppError } from "./error-reporting";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubWindow(reporter?: {
  captureException: (e: unknown, c?: Record<string, unknown>) => void;
}) {
  vi.stubGlobal("window", {
    location: { pathname: "/settings" },
    __OPENEXPERT_ERROR_REPORTER__: reporter,
  });
}

describe("reportAppError", () => {
  it("is a no-op when there is no window (SSR)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => reportAppError(new Error("ssr"))).not.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });

  it("logs an Error with its message and stack, and forwards to the reporter", () => {
    const reporter = { captureException: vi.fn() };
    stubWindow(reporter);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("boom");

    reportAppError(error);

    expect(spy).toHaveBeenCalledTimes(1);
    const call = spy.mock.calls[0]!;
    expect(call[0]).toBe("[error] /settings");
    expect(call[1]).toBe("boom");
    expect(call[2]).toBe(error.stack);
    expect(call[3]).toEqual({});
    expect(reporter.captureException).toHaveBeenCalledWith(error, {
      source: "react_error_boundary",
      route: "/settings",
    });
  });

  it("describes a raw Response with its status and url instead of [object Response]", () => {
    stubWindow();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = new Response(null, { status: 404 });
    Object.defineProperty(res, "url", { value: "https://api.example.com/thing" });

    reportAppError(res);

    expect(spy.mock.calls[0]![1]).toBe("Response 404 at https://api.example.com/thing");
    expect(spy.mock.calls[0]![2]).toBe("");
  });

  it("omits the url for a Response that has none", () => {
    stubWindow();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    reportAppError(new Response(null, { status: 500 }));
    expect(spy.mock.calls[0]![1]).toBe("Response 500");
  });

  it("stringifies non-Error, non-Response values", () => {
    stubWindow();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    reportAppError("just a string");
    expect(spy.mock.calls[0]![1]).toBe("just a string");
    expect(spy.mock.calls[0]![2]).toBe("");
  });

  it("merges caller-supplied context into the reporter payload", () => {
    const reporter = { captureException: vi.fn() };
    stubWindow(reporter);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("boom");

    reportAppError(error, { componentStack: "at <App>" });

    expect(reporter.captureException).toHaveBeenCalledWith(error, {
      source: "react_error_boundary",
      route: "/settings",
      componentStack: "at <App>",
    });
  });

  it("still logs when no reporter is installed", () => {
    stubWindow(undefined);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => reportAppError(new Error("boom"))).not.toThrow();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
