// SPDX-License-Identifier: MIT
// The command this repo's gate table runs is `npx vitest run` (the Dev system's
// gate list and `~/.hermes/scripts/dev_gates.py`), not `npm test`. The root
// project declared `include: ["src/**/*.test.ts", "src/**/*.test.tsx"]`, so the 14
// test files of the workspace package `packages/openexpert/test` — the config
// loader with its clamps and notices, the provider catalogue, the local server and
// the CLI — were only reached by `npm test`. A change to
// `packages/openexpert/src/config.ts` or `providers.ts` could break them and the
// pass still read green: measured on main, `npx vitest run` reported 52 files and
// 620 tests while `npm run test:run --workspaces` reported 14 more with 161 tests,
// and `npx vitest run packages/openexpert/test/providers.test.ts` answered «No
// test files found».
//
// This test compares every test file in the repo with the patterns the root
// project declares and names the ones left out, so the hole cannot come back
// silently.
//
// The second half is the same hole in types. The root `tsconfig.json` includes
// only `src/**/*.ts(x)` and the package's own tsconfig is Node-only
// (`lib: ["ES2022"]`, `types: ["node"]`), so the two programs cannot be merged;
// a type error in `packages/openexpert/src/__probe_tipos.ts` left
// `npx tsc --noEmit` at exit 0 while `npm run typecheck --workspaces` failed.
// CI runs both (`npm run typecheck && npm run typecheck --workspaces`,
// .github/workflows/ci.yml:122), so the root script has to chain the workspaces or
// the local command means something else than CI's.

import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = fileURLToPath(new URL("..", import.meta.url));

/** Directories that hold a copy of the repo or generated files, never sources. */
const SKIP = new Set([
  ".git",
  ".next",
  ".output",
  ".worktrees",
  "coverage",
  "dist",
  "node_modules",
  "tmp",
]);

const TEST_FILE = /\.test\.tsx?$/;

/** Every test file in the repo, as a path relative to the root. */
function testFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP.has(entry.name)) continue;
      out.push(...testFiles(join(dir, entry.name)));
    } else if (TEST_FILE.test(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

/**
 * The patterns of the root vitest project, read from its config.
 *
 * The config is text here — importing it would evaluate `__dirname` the way the
 * bundler does — so the array that names the tests is picked by its own contents
 * (`*.test.`), not by its position: `vitest.config.ts` also declares the
 * `coverage.include`, and taking the first array would compare against the wrong
 * one without failing.
 */
function rootInclude(): string[] {
  const text = readFileSync(join(REPO, "vitest.config.ts"), "utf8");
  const arrays = [...text.matchAll(/include:\s*\[([\s\S]*?)\]/g)].map((m) =>
    [...((m[1] ?? "").matchAll(/"([^"]+)"|'([^']+)'/g) as Iterable<RegExpMatchArray>)].map(
      (q) => q[1] ?? q[2] ?? "",
    ),
  );
  const include = arrays.find((list) => list.some((pattern) => pattern.includes(".test.")));
  if (!include?.length)
    throw new Error(
      "vitest.config.ts no declara un `include: [...]` con patrones de test: este test no puede comprobar nada",
    );
  return include;
}

/** A glob pattern (`**`, `*`, `?`) as the regular expression vitest would match with. */
function patternToRegExp(pattern: string): RegExp {
  let out = "";
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i]!;
    if (char === "*") {
      if (pattern[i + 1] === "*") {
        // `**/` also stands for no directory at all: `packages/**/a.test.ts` matches
        // `packages/a.test.ts`.
        if (pattern[i + 2] === "/") {
          out += "(?:[^/]+/)*";
          i += 2;
        } else {
          out += ".*";
          i += 1;
        }
      } else {
        out += "[^/]*";
      }
    } else if (char === "?") {
      out += "[^/]";
    } else if ("\\^$+.()|{}[]".includes(char)) {
      out += `\\${char}`;
    } else {
      out += char;
    }
  }
  return new RegExp(`^${out}$`);
}

describe("the gate command runs this repo's tests", () => {
  it("the root project's include covers every test file", () => {
    const include = rootInclude();
    const matchers = include.map(patternToRegExp);
    const files = testFiles(REPO).map((file) => relative(REPO, file).split("\\").join("/"));
    // The patterns are the ones that already exist; an empty match would mean the
    // reader broke, not that the config is wrong.
    expect(files.filter((file) => file.startsWith("src/")).length).toBeGreaterThan(0);
    const missing = files.filter((file) => !matchers.some((re) => re.test(file))).sort();
    const detail = missing.map((file) => `  ${file}`).join("\n");
    expect(
      missing,
      `\nTest files that \`npx vitest run\` does not execute (the root project's include is ${JSON.stringify(include)}):\n${detail}\n`,
    ).toEqual([]);
  });

  it("the root typecheck chains the workspaces, the way CI does", () => {
    const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    // CI runs both programs (.github/workflows/ci.yml:122); a root `typecheck` that
    // stops at the app leaves the package out of every local pass.
    expect(pkg.scripts?.["typecheck"] ?? "").toContain("--workspaces");
  });
});
