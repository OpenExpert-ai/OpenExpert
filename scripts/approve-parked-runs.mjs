#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Approves the workflow runs GitHub parks on the changesets "version packages"
// pull request.
//
// `changesets/action` pushes `changeset-release/main` with the job's
// `GITHUB_TOKEN`, so its actor is `github-actions[bot]`. Under this
// repository's `first_time_contributors` approval policy that account never
// stops being a first-time contributor: every push leaves the three workflows
// of the release PR in `action_required` at 0 s and no check ever reports. On
// 2026-10-29 PR #73 had 12 runs parked since 2026-10-20 and `check-runs`
// `total_count` 0 on its head, so the release could not be validated — nor
// merged with the ruleset's checks once they are applied.
//
// GitHub does run a bot-created pull request once someone approves the run, so
// `release.yml` calls this right after pushing the version. The filter is
// deliberately narrow, because approving a run is what hands it the
// repository's secrets: only the release branch, only the head that push
// produced, only runs triggered by the pull request itself, and never one whose
// head lives in a fork.
//
// Environment:
//   GITHUB_TOKEN        token with `actions: write` (required).
//   REPO                `owner/name`; defaults to `GITHUB_REPOSITORY`.
//   BRANCH              defaults to `changeset-release/main`.
//   ATTEMPTS            how many times to look for parked runs (default 6).
//   INTERVAL_MS         wait between attempts (default 10000).
//   GITHUB_API_URL      defaults to the public API; Actions sets it in every run.

import { fileURLToPath } from "node:url";

const API = process.env.GITHUB_API_URL ?? "https://api.github.com";

export const RELEASE_BRANCH = "changeset-release/main";

/**
 * Ids of the runs that are waiting for approval on the release pull request.
 * Anything that is not parked on `scope.branch` at `scope.headSha`, from
 * `scope.repo` and triggered by the pull request is left alone.
 */
export function parkedRunIds(runs, scope) {
  return runs
    .filter(
      (run) =>
        run.conclusion === "action_required" &&
        run.event === "pull_request" &&
        run.head_branch === scope.branch &&
        run.head_sha === scope.headSha &&
        run.head_repository?.full_name === scope.repo,
    )
    .map((run) => run.id);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(token, path, init = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
      ...init.headers,
    },
  });
  return response;
}

/** Head of the release branch, or `null` while the pull request does not exist. */
async function headShaOf(token, repo, branch) {
  const response = await request(token, `/repos/${repo}/git/ref/heads/${branch}`);
  // No branch, no version pull request: the job waits, it does not fail.
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `GET the head of ${branch} answered ${response.status}: ${await response.text()}`,
    );
  }
  const body = await response.json();
  return body.object?.sha ?? null;
}

async function runsOfBranch(token, repo, branch) {
  const response = await request(
    token,
    `/repos/${repo}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=100`,
  );
  if (!response.ok) {
    throw new Error(
      `listing the runs of ${branch} answered ${response.status}: ${await response.text()}`,
    );
  }
  const body = await response.json();
  return body.workflow_runs ?? [];
}

/** Approves one run. A run that already started cannot be approved: that is not an error. */
async function approve(token, repo, id) {
  const response = await request(token, `/repos/${repo}/actions/runs/${id}/approve`, {
    method: "POST",
  });
  if (response.status === 201) return true;
  if (response.status === 403 || response.status === 404 || response.status === 409) {
    console.log(
      `approve-parked-runs: run ${id} was not waiting for approval any more (${response.status}).`,
    );
    return false;
  }
  throw new Error(`approving run ${id} answered ${response.status}: ${await response.text()}`);
}

async function summarise(approved, branch, headSha) {
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (!summary) return;
  const { appendFile } = await import("node:fs/promises");
  await appendFile(
    summary,
    `Approved ${approved} run(s) parked on \`${branch}\` at \`${headSha.slice(0, 7)}\`.\n`,
  );
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error("approve-parked-runs: GITHUB_TOKEN is not set.");
    process.exit(2);
  }
  const repo = process.env.REPO ?? process.env.GITHUB_REPOSITORY;
  if (!repo) {
    console.error("approve-parked-runs: neither REPO nor GITHUB_REPOSITORY is set.");
    process.exit(2);
  }
  const branch = process.env.BRANCH ?? RELEASE_BRANCH;
  const attempts = Number(process.env.ATTEMPTS ?? 6);
  const interval = Number(process.env.INTERVAL_MS ?? 10_000);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const headSha = await headShaOf(token, repo, branch);
    if (headSha) {
      const parked = parkedRunIds(await runsOfBranch(token, repo, branch), {
        repo,
        branch,
        headSha,
      });
      if (parked.length > 0) {
        let approved = 0;
        for (const id of parked) {
          if (await approve(token, repo, id)) approved += 1;
        }
        console.log(
          `approve-parked-runs: approved ${approved} of ${parked.length} parked run(s) on ${branch} at ${headSha.slice(0, 7)}: ${parked.join(", ")}.`,
        );
        await summarise(approved, branch, headSha);
        return;
      }
    }
    if (attempt < attempts) await sleep(interval);
  }

  // Nothing parked is the normal case for a merge without a changeset: the
  // release job touches no branch, so there is nothing to approve.
  console.log(
    `approve-parked-runs: no run was waiting for approval on ${branch} (${attempts} attempt(s)).`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
