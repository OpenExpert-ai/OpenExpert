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
// - **Nothing blocking.** The run is asynchronous: a slow script no longer freezes the process that
//   serves the panel, the chat stream and the API.
//
// What it does *not* do: hide most of `/usr` (it is mounted read-only, on purpose: the interpreter
// and its standard library live there) and run on a machine without bubblewrap. Both guarantees —
// the network namespace and the filesystem mounts — come from that one binary, so there is no
// second-class sandbox behind it: `unshare -Urn` isolates the network and leaves the whole disk
// readable, `~/.openexpert/secret.key` included, which is worse than useless because the tool
// would still look confined. It is detected only to name what is missing. The real gate is still
// the capability itself — an Expert only has this tool when its owner adds it — plus the script
// being written to the activity trail by the tool that calls this.

import { spawn, spawnSync } from "node:child_process";
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
/** Bytes held in memory while the script runs; beyond this it is killed. */
const MAX_BUFFER = 8 * 1024 * 1024;
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

/** `bwrap` isolates the network *and* the filesystem; `unshare` only the network, so it is not used. */
export type PythonSandboxKind = "bwrap" | "unshare-net" | "none";

export type PythonSandbox = {
  kind: PythonSandboxKind;
  /** Absolute path to the sandbox binary. */
  command?: string;
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
    // Reported so the refusal can name it, never used to run: `unshare -Urn` keeps the host
    // filesystem, so a script could read `~/.openexpert/secret.key` or any file outside the granted
    // folders. Answering `none` here would hide a barrier that does exist; running behind it would
    // make the tool look confined when it is not.
    probed =
      unshare && works(unshare, ["-Urn", trueBinary])
        ? { kind: "unshare-net", command: unshare }
        : { kind: "none" };
  }
  return probed;
}

/**
 * Why a script is not run on this machine, in the words the model gets, or `null` when the barrier
 * confines both the network and the filesystem. `unshare -Urn` is the normal case on a desktop that
 * never installed bubblewrap, and it is not enough: it isolates the network and leaves the disk
 * readable. Bubblewrap is a free package on every distribution, so the message says how to get it.
 */
export function sandboxRefusal(sandbox: PythonSandbox): string | null {
  if (sandbox.kind === "bwrap") return null;
  if (sandbox.kind === "unshare-net")
    return "Esta máquina no tiene `bubblewrap`, así que el script no se ejecuta: `unshare -Urn` aísla la red, pero el sistema de ficheros entero seguiría a la vista (tus claves, `credentials.json` y cualquier archivo fuera de las carpetas autorizadas). Instala `bubblewrap` (`sudo apt install bubblewrap`, `sudo dnf install bubblewrap` o `sudo pacman -S bubblewrap`) y vuelve a intentarlo.";
  return "Esta máquina no puede aislar el script de la red (`bubblewrap` no está y `unshare` con espacios de nombres tampoco sirve), así que no se ejecuta: ejecutar código sin esa barrera daría al script salida a Internet y acceso a tus archivos. Instala `bubblewrap` y vuelve a intentarlo.";
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
 *
 * Asynchronous on purpose: `spawnSync` froze the whole process for as long as the script ran, and
 * the process is what serves the panel, the chat stream and the API. A script that ignores SIGTERM
 * is killed with SIGKILL when the deadline passes.
 */
export async function runPython(
  code: string,
  opts: { timeoutMs?: number | undefined } = {},
): Promise<PythonRun> {
  const script = String(code ?? "");
  // Which barrier this machine has, even when the run is refused below: the field travels to the
  // model, and answering `none` on a machine that has `bubblewrap` would read as "nothing isolates
  // this", which is not true.
  const sandbox = pythonSandbox();
  if (!script.trim()) return refusal("No llegó ningún código que ejecutar.", sandbox.kind);
  // One barrier, one guarantee: without `bubblewrap` the script does not run. A network-only
  // namespace would leave `~/.openexpert/secret.key` one `open()` away and the answer looking
  // sandboxed, which is exactly the bug this refuses to repeat.
  const cannotRun = sandboxRefusal(sandbox);
  if (cannotRun) return refusal(cannotRun, sandbox.kind);
  const interpreter = pythonAvailable();
  // `pythonAvailable` always explains itself when it fails; the fallback is here so no future edit
  // to it can turn a refusal into an empty answer (`ok: false`, no output, no reason).
  if (!interpreter.ok || !interpreter.path)
    return refusal(
      interpreter.note ?? "No se encontró un intérprete de Python que ejecutar.",
      sandbox.kind,
    );
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
    const args = [
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
      // `-I` is isolated mode: no user site-packages, no `PYTHON*` variables from the environment.
      python,
      "-I",
      file,
    ];

    const child = spawn(sandbox.command!, args, {
      cwd: dir,
      stdio: ["ignore", "pipe", "pipe"],
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

    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let buffered = 0;
    let overflow = false;
    // A runaway `print` is capped in memory as well as in the result, like `spawnSync`'s maxBuffer.
    const collect = (sink: Buffer[]) => (chunk: Buffer) => {
      buffered += chunk.byteLength;
      if (buffered > MAX_BUFFER) {
        overflow = true;
        child.kill("SIGKILL");
        return;
      }
      sink.push(chunk);
    };
    child.stdout?.on("data", collect(out));
    child.stderr?.on("data", collect(err));

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      // SIGTERM is ignored by a `while True:` loop; SIGKILL is not.
      child.kill("SIGKILL");
    }, timeoutMs);

    const outcome = await new Promise<{ code: number | null; error?: Error }>((resolve) => {
      let settled = false;
      child.on("error", (e) => {
        if (settled) return;
        settled = true;
        resolve({ code: null, error: e });
      });
      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        resolve({ code });
      });
    });
    clearTimeout(timer);

    const stdout = cap(Buffer.concat(out).toString("utf8"));
    const stderr = cap(Buffer.concat(err).toString("utf8"));
    const exit = outcome.code;
    const failedToStart = outcome.error;
    return {
      ok: exit === 0 && !failedToStart,
      exit,
      stdout: stdout.text,
      stderr: stderr.text,
      truncated: stdout.truncated || stderr.truncated || overflow,
      timedOut,
      durationMs: Date.now() - started,
      sandbox: sandbox.kind,
      ...(timedOut
        ? {
            note: `El script tardó más de ${Math.round(timeoutMs / 1000)} s y se paró. Prueba con menos datos o divide el cálculo.`,
          }
        : failedToStart
          ? { note: `No se pudo ejecutar Python: ${failedToStart.message}` }
          : exit === 0
            ? {}
            : {
                // A non-zero exit with nothing on stderr is what a barrier that could not start
                // the interpreter looks like from here: say that instead of pointing at an empty
                // error the model cannot read.
                note: stderr.text.trim()
                  ? `El script falló (código ${exit ?? "sin código"}): mira el error de arriba.`
                  : `El script terminó con código ${exit ?? "sin código"} sin escribir nada en la salida de error: puede que el sandbox no haya podido arrancar el intérprete de Python.`,
              }),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
