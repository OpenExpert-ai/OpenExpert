# Governance

OpenExpert is maintained by the OpenExpert contributors. This document
describes how decisions are made, who can merge changes, and how the
project evolves.

## Roles

- **Maintainers** — merge pull requests, cut releases, and steward the
  project roadmap. Listed in `.github/CODEOWNERS`.
- **Contributors** — anyone who opens a pull request, issue, or comment.
  Contributions are accepted under the MIT license via the DCO.
- **Security contacts** — listed in `SECURITY.md`. Handle vulnerability
  reports and coordinate disclosure.

## Decision making

- **Day-to-day:** maintainers decide on the scope of a pull request within
  its review.
- **Roadmap and breaking changes** are tracked in
  [`docs/en/roadmap.md`](./docs/en/roadmap.md). A change is considered
  breaking when it alters a public API, a persisted schema, or a
  documented behaviour. Breaking changes ship in a minor or major version
  bump and are announced in the release notes.
- **Disputes** are discussed openly in the relevant issue or pull request.
  If consensus cannot be reached, a maintainer makes the final call and
  records the decision in the pull request.

## Releases

- Releases follow **Semantic Versioning** (`MAJOR.MINOR.PATCH`).
- Changes are tracked with [Changesets](https://github.com/changesets/changesets).
- Releases are published to npm with `--provenance` via Trusted
  Publishing (OIDC). Docker images are pushed to GitHub Container Registry.

## Adding maintainers

A new maintainer is added by an existing maintainer opening a pull
request that updates `.github/CODEOWNERS`. The pull request must be
approved by at least one other maintainer.

## Removing maintainers

Maintainers may step down at any time by opening a pull request that
removes their handle from `.github/CODEOWNERS`. Inactivity for more than
six months is also considered a resignation.
