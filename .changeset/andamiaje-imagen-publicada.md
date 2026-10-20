---
"create-openexpert": patch
---

La plantilla usa la imagen publicada. El `docker-compose.yml` que genera
`npm create openexpert` apuntaba a `ghcr.io/openexpert-ai/openexpert:local`, una
etiqueta que el registro nunca publica (solo `latest`, la versión y el sha), así
que `docker compose up -d` fallaba en un proyecto recién creado.
