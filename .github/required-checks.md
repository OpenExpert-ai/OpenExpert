# Required checks for `main`

`main` is protected by the ruleset `protect-main` (id `24980275`). Until
2026-10-29 the ruleset only required a pull request: it had **no
`required_status_checks`**, so the checks ran, reported, and blocked nothing —
that is how pull request #48 was merged on 2026-10-17 with CI red.

**The rule is applied** (T-0391, 2026-10-29): the three checks below are
required, and a pending or failing one blocks the merge. What follows is the
payload that was applied, kept because a ruleset is replaced as a whole and
re-running the same `PUT` is both the re-apply and the undo. Editing rulesets
needs admin on the repository, the call is not rehearsable in a pull request,
and a bad `PUT` replaces the whole ruleset: run it by hand, never from a
workflow.

## The check names this repository produces

| Check                             | Workflow     | Runs on every PR                                             |
| --------------------------------- | ------------ | ------------------------------------------------------------ |
| `Lint · Typecheck · Test · Build` | `ci.yml`     | yes                                                          |
| `Workflows and secrets`           | `ci.yml`     | yes                                                          |
| `Analyze (javascript-typescript)` | `codeql.yml` | yes                                                          |
| `Desktop window (Linux)`          | `ci.yml`     | only when `src-tauri/`, manifests or `vite.config.ts` change |
| `Docker smoke`                    | `ci.yml`     | only when the image's inputs change                          |

Copy the names exactly, middle dots (`·`, U+00B7) included: a required check is
matched by the job's `name:`, and one wrong character leaves the PR waiting
forever.

Only the three always-present checks are required. `Desktop window (Linux)` and
`Docker smoke` are conditional by design, and requiring a job that a pull
request can legitimately skip turns every documentation PR into a stuck one.
(They still report `success` when they run, so they can be required later if the
last star in the merge box is wanted.)

## What changes for agents merging pull requests

With `required_status_checks` on, `gh pr merge` is refused while a required
check is pending or red (`mergeStateStatus: BLOCKED`, "the base branch policy
prohibits this merge"), so opening a pull request and merging it in the same
breath — the Dev implementer agent did exactly that — no longer works. The flow
is open, wait, and merge only if they are green:

```bash
gh pr create --fill --base main --head auto/T-XXXX-slug
gh pr checks <n> --watch --fail-fast   # the three required checks
gh pr merge <n> --squash --delete-branch
```

`gh pr merge --auto` is the alternative that queues the merge and lets GitHub
fire it when the checks pass, but this repository has **`allow_auto_merge:
false`**, so `--auto` answers "Auto-merge is not allowed for this repository".
Turning it on is a repository setting, not a ruleset change, and it is a human
decision: `gh api --method PATCH repos/OpenExpert-ai/OpenExpert -f
allow_auto_merge=true`. Until then, wait for the checks.

## The payload that was applied

`protect-main` already has the `pull_request`, `non_fast_forward` and `deletion`
rules; a ruleset is replaced as a whole, so the payload repeats them verbatim and
adds `required_status_checks`. `bypass_actors: []` keeps the previous behaviour:
nobody bypasses the ruleset, including admins.

```bash
cat > /tmp/openexpert-protect-main.json <<'JSON'
{
  "name": "protect-main",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "include": ["refs/heads/main"],
      "exclude": []
    }
  },
  "bypass_actors": [],
  "rules": [
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "required_reviewers": [],
        "require_code_owner_review": false,
        "dismissal_restriction": {
          "enabled": false,
          "allowed_actors": []
        },
        "require_last_push_approval": false,
        "required_review_thread_resolution": false,
        "require_extra_approval_for_unattributed_changes": true,
        "allowed_merge_methods": ["merge", "squash", "rebase"]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "do_not_enforce_on_create": false,
        "required_status_checks": [
          { "context": "Lint · Typecheck · Test · Build" },
          { "context": "Workflows and secrets" },
          { "context": "Analyze (javascript-typescript)" }
        ]
      }
    },
    { "type": "non_fast_forward" },
    { "type": "deletion" }
  ]
}
JSON

gh api --method PUT repos/OpenExpert-ai/OpenExpert/rulesets/24980275 \
  -H "Accept: application/vnd.github+json" \
  --input /tmp/openexpert-protect-main.json \
  --jq '[.rules[].type]'
```

`strict_required_status_checks_policy: false` means a branch does not have to be
up to date with `main` before merging. Turn it on only if "the green run was on a
tree that already contains `main`" is worth the extra re-runs.

## Verify

```bash
gh api repos/OpenExpert-ai/OpenExpert/rulesets/24980275 \
  --jq '[.rules[].type]'
# ["pull_request","required_status_checks","non_fast_forward","deletion"]

gh api repos/OpenExpert-ai/OpenExpert/rulesets/24980275 \
  --jq '.rules[] | select(.type == "required_status_checks") | .parameters.required_status_checks[].context'
# Lint · Typecheck · Test · Build
# Workflows and secrets
# Analyze (javascript-typescript)
```

Then open any pull request: the three checks appear under "Required" in the
merge box, `gh pr view <n> --json mergeStateStatus` says `BLOCKED` while they are
pending, and a red one keeps the merge button on "Merging is blocked".

## Undo

Re-run the same `PUT` without the `required_status_checks` object in `rules`.
Nothing else in the ruleset changes, because the payload carries the rest of it
untouched.

## Two things that will look like a stuck PR and are not

- **The `chore(release): version packages` pull request.** `changesets/action`
  pushes it with `GITHUB_TOKEN`, so the actor is `github-actions[bot]` and this
  repository's approval policy is `first_time_contributors`: GitHub creates the
  PR's three runs in **"action_required"** and no check reports until one is
  approved. `release.yml` approves them itself, in the `unblock-version-pr` job
  that runs `scripts/approve-parked-runs.mjs` after the version push — that is
  the root fix, so no click is needed and the PR gets its checks on every push.
  A run still parked on that PR means that job failed: read its log, not the
  pull request.
- **A pull request that changes nothing the desktop or Docker jobs build.** Their
  checks report `skipped`, not `success`. That is enough for a required check
  (GitHub treats a skipped check as passing), and it is still why they are left
  out of the list above: the change filter is a cost optimisation, so a bug in it
  should cost minutes of runner time, not stop every merge.
