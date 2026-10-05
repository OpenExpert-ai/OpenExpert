# OpenCore

Motor abierto (MIT) de OpenExpert. Se descarga y funciona en tu máquina, sin
crear cuentas ni depender de la nube. OpenExpert es **local-first**: no hay
edición cloud.

## Qué incluye

- `src/model-provider.ts` — elige modelo (Gemini, BYOK, Ollama local).
- `src/config.ts` — lee `openexpert.json` + `OPENEXPERT_*`.
- `src/storage.ts` — interfaz de guardado local.
- `src/secrets.ts` — interfaz de tokens de Drive (fichero local, `0600`).
- `src/tools.ts` — catálogo de las 12 herramientas y sus dominios.
- `src/cli/` — el CLI `opencore` (asistente, doctor, fix, models, serve, update).

## Uso

```sh
npx @openexpert/opencore
```

Ver `openexpert.json.example` en la raíz y `docs/en/11-opencore.md`.
