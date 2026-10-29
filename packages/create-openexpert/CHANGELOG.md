# create-openexpert

## 0.2.2

### Patch Changes

- 83a8b03: Bind the generated Compose ports to loopback so the app and Ollama are not exposed to the LAN.

## 0.2.1

### Patch Changes

- 7843cf6: La plantilla usa la imagen publicada. El `docker-compose.yml` que genera
  `npm create openexpert` apuntaba a `ghcr.io/openexpert-ai/openexpert:local`, una
  etiqueta que el registro nunca publica (solo `latest`, la versión y el sha), así
  que `docker compose up -d` fallaba en un proyecto recién creado.

## 0.2.0

### Minor Changes

- 949ddf9: Require Node.js 24 or later (npm 11+). Node.js 20 is end-of-life and the
  build/test toolchain (Vite 8, Vitest 5, Changesets 3) now targets Node.js 24.

### Patch Changes

- a780ea0: Remove the unsupported `mode` field from the generated `openexpert.json` so the
  scaffolded file validates against the published JSON schema.
