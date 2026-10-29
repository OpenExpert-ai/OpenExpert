# Required checks for `main`

`main` is protected by the ruleset `protect-main` (id `24980275`), but the
ruleset only requires a pull request: it has **no `required_status_checks`**. That
is why pull request #48 was merged on 2026-10-17 with CI red — the checks run,
report, and block nothing.

This file is the ruleset to apply, and it was deliberately **not applied from a
workflow**: editing rulesets needs admin on the repository, the call is not
rehearsable in a pull request, and a bad PUT replaces the whole ruleset. Run it
by hand, once, from a checkout of `main`.

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

## Apply it

`protect-main` already has the `pull_request`, `non_fast_forward` and `deletion`
rules; a ruleset is replaced as a whole, so the payload repeats them verbatim and
adds `required_status_checks`. `bypass_actors: []` keeps the current behaviour:
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
  --jq '.rules[] | select(.type == "required_status_checks") | .parameters.required_status_checks[].context'
```

Then open any pull request: the three checks appear under "Required" in the
merge box, and a red one turns the merge button into "Merging is blocked".

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
