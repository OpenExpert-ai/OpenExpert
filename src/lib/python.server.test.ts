// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pythonAvailable, pythonSandbox, runPython } from "./python.server";

// A machine without an interpreter is a supported state (the tool says so instead of crashing), so
// the run tests are skipped rather than failed when there is nothing to run with.
const py = pythonAvailable();
const withPython = it.skipIf(!py.ok);
// Likewise a machine without namespaces: the tool refuses to run and says why. The tests that prove
// the barrier are only meaningful where the barrier exists.
const sandbox = pythonSandbox();
const withSandbox = it.skipIf(!py.ok || sandbox.kind === "none");
const withBwrap = it.skipIf(!py.ok || sandbox.kind !== "bwrap");

describe("runPython", async () => {
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
    const interval = setInterval(async () => {
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

  withPython("reports which barrier wrapped the run", async () => {
    const r = await runPython("print(1)");
    expect(r.sandbox).toBe(sandbox.kind);
  });

  it("reports the interpreter when there is one", () => {
    const found = pythonAvailable();
    if (found.ok) expect(found.path).toBeTruthy();
    else expect(found.note).toContain("python3");
  });

  // The two supported states of the machine: a namespace or a refusal. A silent third state — run
  // the script with the network on — is the regression this asserts against.
  it("isolates the script from the network or refuses to run it", async () => {
    const r = await runPython("print(1)");
    if (sandbox.kind === "none") {
      expect(r.ok).toBe(false);
      expect(r.note).toContain("bubblewrap");
    } else {
      expect(r.ok).toBe(true);
      expect(r.stdout.trim()).toBe("1");
    }
  });
});

describe("runPython isolation", async () => {
  withSandbox("cannot open a socket", async () => {
    const r = await runPython(
      [
        "import socket",
        "try:",
        '    s = socket.create_connection(("1.1.1.1", 80), 2)',
        '    print("NET_OK", s.getpeername())',
        "except OSError as e:",
        '    print("NET_BLOCKED", type(e).__name__)',
      ].join("\n"),
      { timeoutMs: 15_000 },
    );
    expect(r.stdout).toContain("NET_BLOCKED");
    expect(r.stdout).not.toContain("NET_OK");
  });

  withBwrap("cannot read a file outside the work directory", async () => {
    // A file next to the app's temporary directory, which the sandbox hides with `--tmpfs /tmp`.
    const outside = mkdtempSync(join(tmpdir(), "openexpert-outside-"));
    const secret = join(outside, "not-for-the-model.txt");
    writeFileSync(secret, "must-not-leak", "utf8");
    try {
      const r = await runPython(`print(open(${JSON.stringify(secret)}).read())`);
      expect(r.ok).toBe(false);
      expect(r.stderr).toContain("FileNotFoundError");
      expect(r.stdout).not.toContain("must-not-leak");
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  withBwrap("cannot read /etc/passwd", async () => {
    const r = await runPython('print(open("/etc/passwd").read())');
    expect(r.ok).toBe(false);
    expect(r.stderr).toContain("FileNotFoundError");
  });

  withBwrap("cannot read the owner's home directory", async () => {
    // `$HOME` is the work directory and `/home` is an empty tmpfs: `~/.openexpert/secrets.json` is
    // not there to open.
    const r = await runPython(
      [
        "import os",
        "print(os.listdir('/home'))",
        "print(os.path.exists(os.path.expanduser('~/.openexpert/secrets.json')))",
      ].join("\n"),
    );
    expect(r.ok).toBe(true);
    expect(r.stdout).not.toContain("secrets.json");
    expect(r.stdout.trim().split("\n").at(-1)).toBe("False");
  });

  withBwrap("keeps the home directory it was given", async () => {
    const r = await runPython("import os; print(os.path.expanduser('~') == os.getcwd())");
    expect(r.stdout.trim()).toBe("True");
  });
});
