---
"@openexpert/opencore": patch
---

Fix the release automation: use `changesets/action@v2`. `@changesets/cli@3` no
longer prints the `New tag:` line that the v1 action parsed, so releases were
published to npm but no git tags, GitHub releases or Docker images were created.
