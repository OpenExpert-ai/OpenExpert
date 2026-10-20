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
// - **A private temporary directory** is the working directory, and it is removed afterwards. The
//   script gets a scratch space, not the user's documents.
// - **A scrubbed environment.** Only `PATH` and the locale survive: an API token sitting in the
//   environment must not become readable to model-written code.
// - **A hard timeout**, capped, so a loop cannot hang the app.
// - **Capped output**, so a runaway print cannot flood the context.
// - **An interpreter that has to exist**, checked before anything runs, with a message that says
//   what is missing instead of a stack trace.
//
// What it does *not* do: isolate the network, or sandbox the filesystem beyond the working
// directory. Those need a container or a syscall filter, and this is a local single-owner app. The
// real gate is the capability itself — an Expert only has this tool when its owner adds it — plus
// the script being written to the activity trail by the tool that calls this, which is the same
// contract the local writes use.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A run that is long enough for a real calculation and short enough to not look hung. */
const DEFAULT_TIMEOUT_MS = 30_000;
/** The ceiling a caller cannot raise, whatever it asks for. */
const MAX_TIMEOUT_MS = 120_000;
/** Output kept for the model; the rest is dropped with a note, never silently. */
const MAX_OUTPUT = 20_000;
/** Bytes held in memory while the script runs; beyond this it is killed. */
const MAX_BUFFER = 8 * 1024 * 1024;

export type PythonRun = {
  ok: boolean;
  exit: number | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
  timedOut: boolean;
  durationMs: number;
  note?: string;
};

/** Where the interpreter is, so the caller can say why it cannot run instead of failing opaquely. */
export function pythonAvailable(): { ok: boolean; path?: string; note?: string } {
  for (const candidate of ["python3", "python"]) {
    const found = spawnSync("sh", ["-c", `command -v ${candidate}`], { encoding: "utf8" });
    const path = found.stdout?.trim();
    if (found.status === 0 && path && existsSync(path)) return { ok: true, path };
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
  const nothing = (note: string): PythonRun => ({
    ok: false,
    exit: null,
    stdout: "",
    stderr: "",
    truncated: false,
    timedOut: false,
    durationMs: 0,
    note,
  });
  if (!script.trim()) return nothing("No llegó ningún código que ejecutar.");
  const interpreter = pythonAvailable();
  if (!interpreter.ok || !interpreter.path) {
    return nothing(
      interpreter.note ??
        "No hay ningún intérprete de Python en esta máquina (`python3`), así que no se puede ejecutar código.",
    );
  }
  const timeoutMs = Math.min(
    Math.max(1_000, Math.floor(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)),
    MAX_TIMEOUT_MS,
  );
  const dir = mkdtempSync(join(tmpdir(), "openexpert-py-"));
  const started = Date.now();
  const file = join(dir, "calc.py");
  writeFileSync(file, script, "utf8");
  try {
    // `-I` is isolated mode: no user site-packages, no `PYTHON*` variables from the environment.
    const child = spawn(interpreter.path, ["-I", file], {
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
      ...(timedOut
        ? {
            note: `El script tardó más de ${Math.round(timeoutMs / 1000)} s y se paró. Prueba con menos datos o divide el cálculo.`,
          }
        : failedToStart
          ? { note: `No se pudo ejecutar Python: ${failedToStart.message}` }
          : exit === 0
            ? {}
            : { note: "El script falló: mira el error de arriba." }),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
