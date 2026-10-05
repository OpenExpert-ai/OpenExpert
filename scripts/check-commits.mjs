#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Verifies that the commits in a range follow the project rules:
//   1. Every commit carries a `Signed-off-by:` trailer (DCO 1.1).
//   2. The subject follows Conventional Commits.
//
// Bot commits (Dependabot, GitHub Actions) are exempt: they cannot sign off.
//
// Usage:
//   node scripts/check-commits.mjs [<git-range>]
// When no range is given it checks the last commit only, which keeps local
// usage simple. CI passes an explicit range.

import { spawnSync } from "node:child_process";

const SEP = "\x1f"; // unit separator, cannot appear in a commit subject
const RECORD = "\x1e"; // record separator

const TYPE = "(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert|deps)";
const SUBJECT_RE = new RegExp(`^${TYPE}(\\([^)]+\\))?!?: .+`);
const SIGNED_OFF_RE = /^Signed-off-by: .+ <[^>]+>$/m;

function git(args) {
  const r = spawnSync("git", args, { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(r.stderr || `git ${args.join(" ")} failed`);
    process.exit(2);
  }
  return r.stdout;
}

const range = process.argv[2];
const logArgs = ["log", `--format=%H${SEP}%s${SEP}%an${SEP}%ae${SEP}%B${RECORD}`];
if (range) logArgs.push(range);

const raw = git(logArgs);
const commits = raw
  .split(RECORD)
  .map((chunk) => chunk.trim())
  .filter(Boolean)
  .map((chunk) => {
    const [hash, subject, authorName, authorEmail, body = ""] = chunk.split(SEP);
    return { hash, subject: subject ?? "", authorName, authorEmail, body };
  });

if (!commits.length) {
  console.log("check-commits: no commits to check.");
  process.exit(0);
}

const isBot = (c) => /\[bot\]$/.test(c.authorName ?? "") || (c.authorEmail ?? "").includes("[bot]");

const problems = [];
for (const c of commits) {
  if (isBot(c)) continue;
  const short = c.hash.slice(0, 8);
  const firstLine = c.body.split("\n")[0] ?? "";
  // Merge and version commits do not follow Conventional Commits.
  if (/^(Merge |Revert )/.test(firstLine) || firstLine.startsWith("chore(release):")) {
    continue;
  }
  if (!SUBJECT_RE.test(firstLine)) {
    problems.push(`${short}: subject is not a Conventional Commit — "${firstLine}"`);
  }
  if (!SIGNED_OFF_RE.test(c.body)) {
    problems.push(`${short}: missing "Signed-off-by:" trailer (DCO)`);
  }
}

if (problems.length) {
  console.error("check-commits: commit hygiene violations:");
  for (const p of problems) console.error(`  - ${p}`);
  console.error("\nFix with `git commit -s` and a Conventional Commit subject.");
  process.exit(1);
}

console.log(`check-commits: ${commits.length} commit(s) OK.`);
