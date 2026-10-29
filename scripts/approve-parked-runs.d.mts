// SPDX-License-Identifier: MIT
// Types for `scripts/approve-parked-runs.mjs`. The workflow runs the script
// straight with `node`, so it stays JavaScript; this declaration is what lets
// the vitest test import it from TypeScript with `tsc --noEmit` in the loop.

/** One entry of `GET /repos/{owner}/{repo}/actions/runs`'s `workflow_runs`. */
export interface WorkflowRun {
  id: number;
  event?: string | null;
  status?: string | null;
  conclusion?: string | null;
  head_branch?: string | null;
  head_sha?: string | null;
  head_repository?: { full_name?: string | null } | null;
}

export interface RunScope {
  /** `owner/name` of the repository the runs must belong to. */
  repo: string;
  /** Branch of the pull request the runs were parked on. */
  branch: string;
  /** Commit those runs were created for; a newer push supersedes them. */
  headSha: string;
}

export declare const RELEASE_BRANCH: string;

/**
 * Ids of the runs GitHub is holding for approval: `action_required`, from the
 * release pull request itself (`pull_request` event), on `branch`, at
 * `headSha`, from the same repository (never a fork).
 */
export declare function parkedRunIds(runs: readonly WorkflowRun[], scope: RunScope): number[];
