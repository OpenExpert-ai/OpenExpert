// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env["OPENEXPERT_LOG_LEVEL"];
});

describe("logger", () => {
  it("filters below the configured level and emits JSON", async () => {
    process.env["OPENEXPERT_LOG_LEVEL"] = "warn";
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { logger } = await import("./logger.server");
    logger.debug("d");
    logger.info("i");
    logger.warn("w", { a: 1 });
    expect(log).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    expect(JSON.parse(warn.mock.calls[0]![0] as string)).toMatchObject({
      level: "warn",
      message: "w",
      a: 1,
    });
  });

  it("describes an Error on error()", async () => {
    process.env["OPENEXPERT_LOG_LEVEL"] = "debug";
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { logger } = await import("./logger.server");
    logger.error("boom", new Error("nope"));
    expect(JSON.parse(err.mock.calls[0]![0] as string)).toMatchObject({
      level: "error",
      message: "boom",
      error: "nope",
    });
  });

  it("defaults to info in production", async () => {
    const prev = process.env["NODE_ENV"];
    process.env["NODE_ENV"] = "production";
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { logger } = await import("./logger.server");
    logger.debug("d");
    logger.info("i");
    expect(log).toHaveBeenCalledOnce();
    if (prev === undefined) delete process.env["NODE_ENV"];
    else process.env["NODE_ENV"] = prev;
  });
});
