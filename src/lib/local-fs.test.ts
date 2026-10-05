// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let dir: string;
let root: string;
let outside: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "openexpert-fs-"));
  root = join(dir, "root");
  outside = join(dir, "outside");
  mkdirSync(join(root, "sub"), { recursive: true });
  mkdirSync(join(root, "node_modules"), { recursive: true });
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(root, "a.txt"), "hola");
  writeFileSync(join(root, ".hidden"), "no");
  writeFileSync(join(root, "node_modules", "x.js"), "no");
  writeFileSync(join(root, "sub", "b.md"), "# b");
  writeFileSync(join(outside, "secret.txt"), "secreto");
  symlinkSync(outside, join(root, "link"));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("resolveWithinRoots", () => {
  it("accepts paths inside a granted root", async () => {
    const fs = await import("./local-fs.server");
    expect(fs.resolveWithinRoots(join(root, "a.txt"), [root])).toBe(join(root, "a.txt"));
  });

  it("rejects paths outside the granted roots", async () => {
    const fs = await import("./local-fs.server");
    expect(() => fs.resolveWithinRoots(join(outside, "secret.txt"), [root])).toThrow();
  });

  it("rejects a symlink that escapes the root", async () => {
    const fs = await import("./local-fs.server");
    expect(() => fs.resolveWithinRoots(join(root, "link", "secret.txt"), [root])).toThrow();
  });

  it("rejects everything when no root is granted", async () => {
    const fs = await import("./local-fs.server");
    expect(() => fs.resolveWithinRoots(join(root, "a.txt"), [])).toThrow();
  });
});

describe("listLocalFiles", () => {
  it("walks recursively but skips dotfiles, ignored dirs and symlink escapes", async () => {
    const fs = await import("./local-fs.server");
    const names = fs.listLocalFiles([root]).map((f) => f.name);
    expect(names).toContain("a.txt");
    expect(names).toContain("b.md");
    expect(names).not.toContain(".hidden");
    expect(names).not.toContain("x.js");
    expect(names).not.toContain("secret.txt");
  });
});

describe("read / write / create", () => {
  it("reads a text file inside the root", async () => {
    const fs = await import("./local-fs.server");
    const r = await fs.readLocalFile(join(root, "a.txt"), [root]);
    expect(r.content).toBe("hola");
  });

  it("refuses to read outside the root", async () => {
    const fs = await import("./local-fs.server");
    await expect(fs.readLocalFile(join(outside, "secret.txt"), [root])).rejects.toThrow();
  });

  it("writes and creates files only inside the root", async () => {
    const fs = await import("./local-fs.server");
    fs.writeLocalFile(join(root, "a.txt"), [root], "adiós");
    expect((await fs.readLocalFile(join(root, "a.txt"), [root])).content).toBe("adiós");

    const created = fs.createLocalFile(root, "new.txt", [root], "nuevo");
    expect(created.name).toBe("new.txt");
    expect(() => fs.createLocalFile(root, "new.txt", [root], "dup")).toThrow();

    expect(() => fs.createLocalFile(outside, "evil.txt", [root], "x")).toThrow();
  });
});

describe("browseDirectory", () => {
  it("lists directories only in a navigable shape", async () => {
    const fs = await import("./local-fs.server");
    const view = fs.browseDirectory(root);
    expect(view.path).toBe(root);
    expect(view.entries.some((e) => e.name === "sub" && e.isDirectory)).toBe(true);
  });
});
