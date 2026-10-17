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

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A run that is long enough for a real calculation and short enough to not look hung. */
const DEFAULT_TIMEOUT_MS = 30_000;
/** The ceiling a caller cannot raise, whatever it asks for. */
const MAX_TIMEOUT_MS = 120_000;
/** Output kept for the model; the rest is dropped with a note, never silently. */
const MAX_OUTPUT = 20_000;

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
 */
export function runPython(code: string, opts: { timeoutMs?: number | undefined } = {}): PythonRun {
  const script = String(code ?? "");
  if (!script.trim()) {
    return {
      ok: false,
      exit: null,
      stdout: "",
      stderr: "",
      truncated: false,
      timedOut: false,
      durationMs: 0,
      note: "No llegó ningún código que ejecutar.",
    };
  }
  const interpreter = pythonAvailable();
  if (!interpreter.ok || !interpreter.path) {
    return {
      ok: false,
      exit: null,
      stdout: "",
      stderr: "",
      truncated: false,
      timedOut: false,
      durationMs: 0,
      ...(interpreter.note ? { note: interpreter.note } : {}),
    };
  }
  const timeoutMs = Math.min(
    Math.max(1_000, Math.floor(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)),
    MAX_TIMEOUT_MS,
  );
  const dir = mkdtempSync(join(tmpdir(), "openexpert-py-"));
  const started = Date.now();
  try {
    const file = join(dir, "calc.py");
    writeFileSync(file, script, "utf8");
    // `-I` is isolated mode: no user site-packages, no `PYTHON*` variables from the environment.
    const result = spawnSync(interpreter.path, ["-I", file], {
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
    return {
      ok: exit === 0,
      exit,
      stdout: stdout.text,
      stderr: stderr.text,
      truncated: stdout.truncated || stderr.truncated,
      timedOut,
      durationMs: Date.now() - started,
      ...(timedOut
        ? {
            note: `El script tardó más de ${Math.round(timeoutMs / 1000)} s y se paró. Prueba con menos datos o divide el cálculo.`,
          }
        : exit === 0
          ? {}
          : { note: "El script falló: mira el error de arriba." }),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
