// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { pythonAvailable, runPython } from "./python.server";

// A machine without an interpreter is a supported state (the tool says so instead of crashing), so
// the run tests are skipped rather than failed when there is nothing to run with.
const py = pythonAvailable();
const withPython = it.skipIf(!py.ok);

describe("runPython", () => {
  withPython("returns what the script printed", async () => {
    const r = await runPython("print(2 + 40)");
    expect(r.ok).toBe(true);
    expect(r.exit).toBe(0);
    expect(r.stdout.trim()).toBe("42");
  });

  it("refuses empty code with a message and no interpreter", async () => {
    const r = await runPython("   ");
    expect(r.ok).toBe(false);
    expect(r.note).toContain("código");
    expect(r.exit).toBeNull();
  });

  withPython("keeps the environment out of reach of the script", async () => {
    // An API token in the app's environment must not become readable by model-written code. This is
    // the assertion that would catch a regression in the scrubbed `env`.
    process.env["OPENEXPERT_TEST_SECRET"] = "must-not-leak";
    try {
      const r = await runPython(
        'import os; print(os.environ.get("OPENEXPERT_TEST_SECRET", "absent"))',
      );
      expect(r.stdout.trim()).toBe("absent");
      expect(r.stdout).not.toContain("must-not-leak");
    } finally {
      delete process.env["OPENEXPERT_TEST_SECRET"];
    }
  });

  withPython("treats a traceback as information, not as a crash of this function", async () => {
    const r = await runPython("raise ValueError('boom')");
    expect(r.ok).toBe(false);
    expect(r.exit).not.toBe(0);
    expect(r.stderr).toContain("ValueError");
    expect(r.note).toBeTruthy();
  });

  withPython("stops a script that never ends", async () => {
    const r = await runPython("while True:\n    pass", { timeoutMs: 1_000 });
    expect(r.timedOut).toBe(true);
    expect(r.ok).toBe(false);
    expect(r.note).toContain("paró");
  });

  withPython("leaves the event loop free while the script runs", async () => {
    // Regression test for `spawnSync`: it blocked this very process for as long as the script ran,
    // so a slow calculation froze the panel, the chat stream and every API route with it. With a
    // child process the interval below keeps ticking.
    let ticks = 0;
    const interval = setInterval(() => {
      ticks++;
    }, 25);
    try {
      const r = await runPython("import time; time.sleep(0.6)");
      expect(r.ok).toBe(true);
    } finally {
      clearInterval(interval);
    }
    expect(ticks).toBeGreaterThan(10);
  });

  withPython("caps the output and says that it did", async () => {
    const r = await runPython("print('x' * 50000)");
    expect(r.truncated).toBe(true);
    expect(r.stdout.length).toBeLessThan(50000);
  });

  it("reports the interpreter when there is one", () => {
    const found = pythonAvailable();
    if (found.ok) expect(found.path).toBeTruthy();
    else expect(found.note).toContain("python3");
  });
});
