# create-openexpert

## 0.2.0

### Minor Changes

- 949ddf9: Require Node.js 24 or later (npm 11+). Node.js 20 is end-of-life and the
  build/test toolchain (Vite 8, Vitest 5, Changesets 3) now targets Node.js 24.

### Patch Changes

- a780ea0: Remove the unsupported `mode` field from the generated `openexpert.json` so the
  scaffolded file validates against the published JSON schema.
