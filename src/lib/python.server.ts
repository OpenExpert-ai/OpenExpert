// SPDX-License-Identifier: MIT
// Running a short Python script for a calculation.
//
// Why this exists: an assistant asked "how much have I invoiced this quarter" over a CSV adds the
// column up by eye. With a dozen rows that works; with a few hundred it is a confident wrong
// number, which is the worst failure a business panel can have. Code does the arithmetic, the
// model writes the code.
//
// What is enforced here, none of it optional:
//
// - **No network.** The interpreter runs inside a network namespace of its own. Without it the
//   script is not run at all: there is no fallback to "plain python3 with the network on".
// - **A filesystem the script cannot escape.** Bubblewrap mounts a read-only `/usr` and empty
//   `/home`, `/root` and `/tmp`, then binds only the private temporary working directory: the
//   user's `~/.openexpert/secrets.json` does not exist inside the sandbox.
// - **A scrubbed environment.** Only `PATH` and the locale survive: an API token sitting in the
//   environment must not become readable to model-written code.
// - **A hard timeout**, capped, so a loop cannot hang the app.
// - **Capped output**, so a runaway print cannot flood the context.
// - **An interpreter that has to exist**, checked before anything runs, with a message that says
//   what is missing instead of a stack trace.
//
// What it does *not* do: hide most of `/usr` (it is mounted read-only, on purpose: the interpreter
// and its standard library live there) and survive a machine without bubblewrap. The order is
// bubblewrap (network + filesystem), then `unshare -Un` (network only, the filesystem stays
// readable and the result says so), then refusing to run. The real gate is still the capability
// itself — an Expert only has this tool when its owner adds it — plus the script being written to
// the activity trail by the tool that calls this.

import { spawnSync } from "node:child_process";
import {
  accessSync,
  constants,
  existsSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

/** A run that is long enough for a real calculation and short enough to not look hung. */
const DEFAULT_TIMEOUT_MS = 30_000;
/** The ceiling a caller cannot raise, whatever it asks for. */
const MAX_TIMEOUT_MS = 120_000;
/** Output kept for the model; the rest is dropped with a note, never silently. */
const MAX_OUTPUT = 20_000;
/** Directories a sandboxed interpreter may live in: they are the ones the sandbox mounts. */
const BINDS = ["/usr", "/opt", "/lib", "/lib64"];

export type PythonRun = {
  ok: boolean;
  exit: number | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
  timedOut: boolean;
  durationMs: number;
  /** Which barrier wrapped the run, so the caller can be precise about what was isolated. */
  sandbox: PythonSandboxKind;
  note?: string;
};

/** `bwrap` isolates the network *and* the filesystem; `unshare` only the network. */
export type PythonSandboxKind = "bwrap" | "unshare-net" | "none";

export type PythonSandbox = {
  kind: PythonSandboxKind;
  /** Absolute path to the sandbox binary. */
  command?: string;
  note?: string;
};

/** Look a binary up in `PATH` without going through a shell. */
function whichBinary(name: string): string | null {
  for (const dir of (process.env["PATH"] ?? "/usr/bin:/bin").split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, name);
    try {
      if (!statSync(candidate).isFile()) continue;
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Not here, or not executable: try the next directory.
    }
  }
  return null;
}

/** Runs a binary with a constant argument list and says whether it exited cleanly. */
function works(command: string, args: string[]): boolean {
  const r = spawnSync(command, args, {
    timeout: 5_000,
    encoding: "utf8",
    env: { PATH: process.env["PATH"] ?? "/usr/bin:/bin" },
  });
  return r.status === 0;
}

/**
 * Which barrier this machine can offer. Probed, not assumed: `unshare` is installed on plenty of
 * systems where unprivileged namespaces are disabled, and finding out at run time would mean
 * returning an obscure error to the model. Probed once, then remembered: the kernel does not
 * change its mind while the app is running.
 */
let probed: PythonSandbox | undefined;

export function pythonSandbox(): PythonSandbox {
  if (probed) return probed;
  const bwrap = whichBinary("bwrap");
  // The probe mounts the restricted set the run uses, not the whole disk: if it succeeds, the
  // real run will too. `true` is a binary from `/usr` that executes nothing else.
  const trueBinary = ["/usr/bin/true", "/bin/true"].find((p) => existsSync(p)) ?? "/usr/bin/true";
  if (
    bwrap &&
    works(bwrap, [
      "--unshare-net",
      "--die-with-parent",
      "--dev",
      "/dev",
      ...BINDS.filter((p) => existsSync(p)).flatMap((p) => ["--ro-bind", p, p]),
      trueBinary,
    ])
  )
    probed = { kind: "bwrap", command: bwrap };
  else {
    const unshare = whichBinary("unshare");
    probed =
      unshare && works(unshare, ["-Urn", trueBinary])
        ? {
            kind: "unshare-net",
            command: unshare,
            note: "El script corre sin red, pero esta máquina no tiene `bubblewrap`: el sistema de ficheros no está aislado, así que puede leer archivos locales.",
          }
        : { kind: "none" };
  }
  return probed;
}

/**
 * Where the interpreter is, so the caller can say why it cannot run instead of failing opaquely.
 * The system copy is preferred over anything first in `PATH`: a pyenv or virtualenv interpreter
 * lives under the home directory, and the sandbox deliberately does not mount that.
 */
export function pythonAvailable(): { ok: boolean; path?: string; note?: string } {
  const system = ["/usr/bin/python3", "/usr/local/bin/python3", "/bin/python3"];
  for (const candidate of system) {
    try {
      if (statSync(candidate).isFile()) {
        accessSync(candidate, constants.X_OK);
        return { ok: true, path: candidate };
      }
    } catch {
      // Not this one.
    }
  }
  for (const candidate of ["python3", "python"]) {
    const path = whichBinary(candidate);
    if (path && existsSync(path)) return { ok: true, path };
  }
  return {
    ok: false,
    note: "No hay ningún intérprete de Python en esta máquina (`python3`), así que no se puede ejecutar código. Instálalo y vuelve a intentarlo.",
  };
}

function cap(value: string): { text: string; truncated: boolean } {
  if (value.length <= MAX_OUTPUT) return { text: value, truncated: false };
  return { text: value.slice(0, MAX_OUTPUT), truncated: true };
}

function refusal(note: string, sandbox: PythonSandboxKind): PythonRun {
  return {
    ok: false,
    exit: null,
    stdout: "",
    stderr: "",
    truncated: false,
    timedOut: false,
    durationMs: 0,
    sandbox,
    note,
  };
}

/**
 * Run a script and return what it printed. Never throws for a failure *inside* the script: a
 * traceback is information the model needs, not an error of this function.
 */
export function runPython(code: string, opts: { timeoutMs?: number | undefined } = {}): PythonRun {
  const script = String(code ?? "");
  if (!script.trim()) return refusal("No llegó ningún código que ejecutar.", "none");
  const sandbox = pythonSandbox();
  if (sandbox.kind === "none")
    return refusal(
      "Esta máquina no puede aislar el script de la red (`bubblewrap` ni `unshare` con espacios de nombres), así que no se ejecuta: ejecutar código sin esa barrera daría al script salida a Internet y acceso a tus archivos. Instala `bubblewrap` y vuelve a intentarlo.",
      "none",
    );
  const interpreter = pythonAvailable();
  if (!interpreter.ok || !interpreter.path) return refusal(interpreter.note ?? "", sandbox.kind);
  // The sandbox only mounts BINDS, so an interpreter installed somewhere else (pyenv, a venv under
  // the home directory) would not exist inside it. Refusing is honest; mounting `~` is not.
  let python = interpreter.path;
  try {
    python = realpathSync(interpreter.path);
  } catch {
    // Keep the original path: the spawn error is as informative as this gets.
  }
  if (
    sandbox.kind === "bwrap" &&
    !BINDS.some((root) => python === root || python.startsWith(`${root}/`))
  )
    return refusal(
      `El intérprete de Python está en ${python}, fuera de ${BINDS.join(", ")}: el sandbox no puede verlo sin exponer tu carpeta personal. Instala el Python del sistema y vuelve a intentarlo.`,
      "bwrap",
    );
  const timeoutMs = Math.min(
    Math.max(1_000, Math.floor(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)),
    MAX_TIMEOUT_MS,
  );
  const dir = mkdtempSync(join(tmpdir(), "openexpert-py-"));
  const started = Date.now();
  try {
    const file = join(dir, "calc.py");
    writeFileSync(file, script, "utf8");
    const args =
      sandbox.kind === "bwrap"
        ? [
            // A network namespace of its own, plus the mounts that make the rest of the disk not
            // exist: read-only system directories, empty home/root/tmp, and the work directory.
            "--unshare-net",
            "--unshare-pid",
            "--unshare-ipc",
            "--unshare-uts",
            "--die-with-parent",
            "--dev",
            "/dev",
            ...BINDS.filter((p) => existsSync(p)).flatMap((p) => ["--ro-bind", p, p]),
            "--tmpfs",
            "/home",
            "--tmpfs",
            "/root",
            "--tmpfs",
            "/tmp",
            "--bind",
            dir,
            dir,
            "--chdir",
            dir,
            // `-I` is isolated mode: no user site-packages, no `PYTHON*` variables from the
            // environment.
            python,
            "-I",
            file,
          ]
        : ["-Urn", python, "-I", file];
    const result = spawnSync(sandbox.command!, args, {
      cwd: dir,
      timeout: timeoutMs,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      // Only what a script legitimately needs. Everything else — tokens, keys, cloud credentials —
      // stays out of reach of code that a model wrote.
      env: {
        PATH: process.env["PATH"] ?? "/usr/bin:/bin",
        LANG: process.env["LANG"] ?? "C.UTF-8",
        LC_ALL: process.env["LC_ALL"] ?? "C.UTF-8",
        HOME: dir,
        TMPDIR: dir,
      },
    });
    const timedOut =
      result.error?.name === "Error" && /ETIMEDOUT|timed?out/i.test(result.error.message);
    const stdout = cap(String(result.stdout ?? ""));
    const stderr = cap(String(result.stderr ?? ""));
    const exit = typeof result.status === "number" ? result.status : null;
    const limitNote = sandbox.kind === "unshare-net" ? sandbox.note : undefined;
    return {
      ok: exit === 0,
      exit,
      stdout: stdout.text,
      stderr: stderr.text,
      truncated: stdout.truncated || stderr.truncated,
      timedOut,
      durationMs: Date.now() - started,
      sandbox: sandbox.kind,
      ...(timedOut
        ? {
            note: `El script tardó más de ${Math.round(timeoutMs / 1000)} s y se paró. Prueba con menos datos o divide el cálculo.`,
          }
        : exit === 0
          ? limitNote
            ? { note: limitNote }
            : {}
          : { note: "El script falló: mira el error de arriba." }),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
