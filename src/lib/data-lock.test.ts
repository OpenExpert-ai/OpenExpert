// SPDX-License-Identifier: MIT
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, expect, it } from "vitest";
import { acquireDataLock } from "./data-lock.server";

const dir = mkdtempSync(join(tmpdir(), "openexpert-lock-"));
let child: ChildProcess | undefined;
const moduleUrl = pathToFileURL(
  fileURLToPath(new URL("./data-lock.server.ts", import.meta.url)),
).href;

afterAll(() => {
  child?.kill("SIGKILL");
  rmSync(dir, { recursive: true, force: true });
});

it("prevents another process opening the data and recovers after an abrupt exit", async () => {
  const sentinel = join(dir, "openexpert.db");
  writeFileSync(sentinel, "unchanged");
  const script = `import { acquireDataLock } from ${JSON.stringify(moduleUrl)}; acquireDataLock(process.argv[1]); console.log('ready'); setInterval(() => {}, 1000);`;
  child = spawn(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "-e", script, dir],
    {
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const owner = child;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("El proceso de prueba no obtuvo el bloqueo.")),
      10_000,
    );
    owner.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    owner.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`El proceso terminó antes: ${code}`));
    });
    owner.stdout!.once("data", (value: Buffer) => {
      if (!value.toString().includes("ready")) return;
      clearTimeout(timer);
      resolve();
    });
  });
  expect(() => acquireDataLock(dir)).toThrow(/Otra instancia/);
  const previousDir = process.env["OPENEXPERT_DATA_DIR"];
  process.env["OPENEXPERT_DATA_DIR"] = dir;
  try {
    const { inspectBackup, restoreBackup } = await import("./backup.server");
    const bundle = JSON.stringify({ format: "openexpert-backup", version: 1, files: {} });
    // Inspection is read-only; restore must refuse before changing any files.
    await expect(inspectBackup(bundle)).resolves.toBeDefined();
    await expect(restoreBackup(bundle)).rejects.toThrow(/Otra instancia/);
  } finally {
    if (previousDir === undefined) delete process.env["OPENEXPERT_DATA_DIR"];
    else process.env["OPENEXPERT_DATA_DIR"] = previousDir;
  }
  expect(readFileSync(sentinel, "utf8")).toBe("unchanged");
  const exited = new Promise<void>((resolve) => owner.once("exit", () => resolve()));
  owner.kill("SIGKILL");
  await exited;
  child = undefined;
  // The SQLite lock file remains, but the OS releases its lock on process exit.
  expect(() => acquireDataLock(dir)).not.toThrow();
  expect(readFileSync(sentinel, "utf8")).toBe("unchanged");
}, 20_000);
