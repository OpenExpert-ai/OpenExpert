// SPDX-License-Identifier: MIT
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { pythonAvailable, pythonSandbox, runPython, sandboxRefusal } from "./python.server";

// Three states of a machine, not two: an interpreter can exist while no barrier does. That is not
// hypothetical — GitHub's `ubuntu-latest` ships `python3` and refuses `unshare -Urn` (24.04 restricts
// unprivileged user namespaces), so `pythonSandbox()` answers `none` there. The tool then refuses to
// run on purpose, and a test that demands a run only means something where the barrier exists.
// Demanding it everywhere is what left CI red on every branch (T-0032): six tests asking for output
// from a run the module declines to make.
const py = pythonAvailable();
const sandbox = pythonSandbox();
// A run happens behind bubblewrap and nowhere else: `unshare -Urn` isolates the network and leaves
// the disk readable, so the module refuses there too (T-0070).
const canRun = py.ok && sandbox.kind === "bwrap";
const withRun = it.skipIf(!canRun);
// The tests that prove the barrier itself.
const withSandbox = it.skipIf(!canRun);
const withBwrap = it.skipIf(!py.ok || sandbox.kind !== "bwrap");
// The barrier-less machine is the state CI runs in, so it is checked rather than skipped: nothing
// runs, and the answer names what is missing.
const withoutBwrap = it.skipIf(sandbox.kind === "bwrap");

describe("runPython", async () => {
  withRun("returns what the script printed", async () => {
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

  withRun("keeps the environment out of reach of the script", async () => {
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

  withRun("treats a traceback as information, not as a crash of this function", async () => {
    const r = await runPython("raise ValueError('boom')");
    expect(r.ok).toBe(false);
    expect(r.exit).not.toBe(0);
    expect(r.stderr).toContain("ValueError");
    expect(r.note).toBeTruthy();
  });

  withRun("stops a script that never ends", async () => {
    const r = await runPython("while True:\n    pass", { timeoutMs: 1_000 });
    expect(r.timedOut).toBe(true);
    expect(r.ok).toBe(false);
    expect(r.note).toContain("paró");
  });

  withRun("leaves the event loop free while the script runs", async () => {
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

  withRun("caps the output and says that it did", async () => {
    const r = await runPython("print('x' * 50000)");
    expect(r.truncated).toBe(true);
    expect(r.stdout.length).toBeLessThan(50000);
  });

  withRun("reports which barrier wrapped the run", async () => {
    const r = await runPython("print(1)");
    expect(r.sandbox).toBe(sandbox.kind);
  });

  it("reports the interpreter when there is one", () => {
    const found = pythonAvailable();
    if (found.ok) expect(found.path).toBeTruthy();
    else expect(found.note).toContain("python3");
  });

  // Whatever the machine has, a refusal has to be readable: `ok: false` with empty stdout, empty
  // stderr and no note is the one answer with nothing in it to act on, and it is what a caller sees
  // as "Python is broken" instead of "this machine cannot isolate the script".
  it("never refuses to run without saying why", async () => {
    for (const code of ["", "   ", "print(1)", "raise ValueError('boom')"]) {
      const r = await runPython(code);
      if (r.ok) continue;
      const saysWhy = Boolean(r.note?.trim()) || r.stderr.trim().length > 0;
      expect(saysWhy, `rechazo mudo para ${JSON.stringify(code)}`).toBe(true);
    }
  });

  // `sandbox` describes the machine, not the run: a refusal used to answer `none` even where
  // `bubblewrap` exists, which reaches the model as "this machine has no isolation at all".
  it("reports the machine's barrier even when it refuses to run", async () => {
    const r = await runPython("   ");
    expect(r.ok).toBe(false);
    expect(r.sandbox).toBe(sandbox.kind);
  });

  // The states CI and a plain desktop run in (interpreter, no bubblewrap) are the ones that were
  // uncovered: nothing executes, every entry point answers with the reason, and none of them
  // pretends the script ran.
  withoutBwrap("refuses every script when the machine cannot confine it", async () => {
    for (const code of ["print(1)", "raise ValueError('boom')", "while True:\n    pass"]) {
      const r = await runPython(code);
      expect(r.ok).toBe(false);
      expect(r.exit).toBeNull();
      expect(r.stdout).toBe("");
      expect(r.stderr).toBe("");
      expect(r.timedOut).toBe(false);
      expect(r.sandbox).toBe(sandbox.kind);
      expect(r.note).toContain("bubblewrap");
    }
  });

  // `unshare -Urn` isolates the network and nothing else. It was the fallback that made the tool
  // look sandboxed while `~/.openexpert/secret.key` stayed one `open()` away (T-0070).
  withoutBwrap("explains what is missing in the terms of what this machine has", async () => {
    const r = await runPython("print(1)");
    expect(r.ok).toBe(false);
    expect(r.note).toContain("bubblewrap");
    expect(r.note).toContain(sandbox.kind === "unshare-net" ? "sistema de ficheros" : "unshare");
  });

  // The two supported states of the machine: bubblewrap or a refusal. A silent third state — run
  // the script behind a network-only namespace — is the regression this asserts against.
  it("isolates the script from the network and the disk, or refuses to run it", async () => {
    const r = await runPython("print(1)");
    if (sandbox.kind === "bwrap") {
      expect(r.ok).toBe(true);
      expect(r.stdout.trim()).toBe("1");
    } else {
      expect(r.ok).toBe(false);
      expect(r.note).toContain("bubblewrap");
    }
  });
});

describe("sandboxRefusal", () => {
  it("lets a bubblewrap run through", () => {
    expect(sandboxRefusal({ kind: "bwrap", command: "/usr/bin/bwrap" })).toBeNull();
  });

  it("refuses a network-only namespace and says how to install bubblewrap", () => {
    const note = sandboxRefusal({ kind: "unshare-net", command: "/usr/bin/unshare" });
    expect(note).toContain("no se ejecuta");
    expect(note).toContain("bubblewrap");
    expect(note).toContain("apt install bubblewrap");
    expect(note).toContain("pacman -S bubblewrap");
  });

  it("refuses a machine with no barrier at all", () => {
    const note = sandboxRefusal({ kind: "none" });
    expect(note).toContain("bubblewrap");
    expect(note).toContain("unshare");
  });
});

describe("runPython without bubblewrap", () => {
  // A desktop that never installed bubblewrap is the normal case, and the bug was that `unshare`
  // made the run look confined. Reproduced for real: a `PATH` whose only barrier binary is a
  // stand-in `unshare` that logs how it was called, plus a fresh copy of the module, because the
  // verdict is probed once and remembered.
  it("does not run the script behind a network-only namespace", async () => {
    const dir = mkdtempSync(join(tmpdir(), "openexpert-unshare-"));
    const log = join(dir, "calls.log");
    const fake = join(dir, "unshare");
    writeFileSync(fake, `#!/bin/sh\nprintf '%s\\n' "$*" >> ${JSON.stringify(log)}\nexit 0\n`);
    chmodSync(fake, 0o755);
    const original = process.env["PATH"];
    try {
      process.env["PATH"] = dir;
      vi.resetModules();
      const fresh = await import("./python.server");
      expect(fresh.pythonSandbox().kind).toBe("unshare-net");
      const r = await fresh.runPython('print(open("/etc/hostname").read())');
      expect(r.ok).toBe(false);
      expect(r.exit).toBeNull();
      expect(r.stdout).toBe("");
      expect(r.sandbox).toBe("unshare-net");
      expect(r.note).toContain("bubblewrap");
      // Nothing reached the interpreter: the log holds the probe call (`-Urn /usr/bin/true`) and
      // never the script file.
      expect(readFileSync(log, "utf8")).not.toContain("calc.py");
    } finally {
      process.env["PATH"] = original;
      vi.resetModules();
      rmSync(dir, { recursive: true, force: true });
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
