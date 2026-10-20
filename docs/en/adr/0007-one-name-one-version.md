# 007 · One name and one version

- **Status:** accepted.
- **Date:** 2026-10.

## Context

The application is OpenExpert, but the package it ships with was called
`@openexpert/opencore`, its CLI answered to `opencore`, and the documentation had
a page named after it. Nothing was wrong technically and nothing recorded _why_
it was called that: there is no ADR, comment or note that explains the name, so it
read as a licensing strategy ("open core") rather than as a component — and it
collides with a well-known third-party project of the same name.

Two more things came from the same place. Changesets names a release after the
package it published, so the releases page showed `@openexpert/opencore@0.4.0`
rather than the product. And the product had two versions: the package's (which
was released) and the root manifest's (which was not, and which the interface
showed).

## Decision

**The product has one name and one version, and both live in one place.**

- The package is `@openexpert/openexpert`, in `packages/openexpert/`; the CLI's
  only binary is `openexpert`. The root manifest is a private workspace file
  without a version of its own (`0.0.0`).
- The version shown in the interface is the package's: `src/lib/version.ts` reads
  the manifest and the bundler inlines it.
- Releases are tagged `v<version>` and titled `OpenExpert <version>`. The release
  is created by `release.yml`, not by changesets, because changesets would name it
  after the package.
- The desktop shell takes the same version, and cannot read it: Rust has no JSON
  manifest. `tauri.conf.json`, `Cargo.toml` and the `openexpert-desktop` entry in
  `Cargo.lock` carry copies that `npm run desktop:sync-version` writes from
  `packages/openexpert/package.json`; `version-packages` runs it, `install.sh`
  refuses to build when they diverge and the desktop gate reports it.

## Consequences

- One number to bump, one name to read, in the release, the CLI, the interface and
  the npm page.
- The bump is still one number, but it lands in four files: the manifest plus the
  three Rust-side copies, through the script. Editing only the manifest leaves the
  binary and the packages behind, and the gate stops that from shipping.
- The package rename is a new npm name: npm has no rename and a trusted publisher
  can only be configured for a package that already exists, so the first publish
  of the new name is manual and the old one is deprecated with a pointer. Everything
  after that publishes from CI as before.
- `ensureStandaloneApp` keeps the old tag shape as a fallback, so a version
  published before the rename can still download its own bundle.
- The root `CHANGELOG.md` stays a hand-written aggregate: changesets versions the
  package, not the workspace root.
