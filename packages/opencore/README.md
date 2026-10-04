# OpenCore

Motor abierto (MIT) de OpenExpert. Se descarga y funciona en tu máquina,
sin crear cuentas ni depender de la nube de OpenExpert.

Lo cerrado (Cloud de pago) vive en `apps/web` y no se publica:
multi-usuario, SSO, facturación, copias gestionadas.

## Qué incluye

- `src/mode.ts` — `local | cloud`. Local = 1 usuario owner, sin login.
- `src/config.ts` — lee `openexpert.json` + `OPENEXPERT_*`.
- `src/model-provider.ts` — elige modelo (Gemini por defecto, BYOK, Ollama local).
- `src/storage.ts` — interfaz de guardado (`SupabaseStorage` en cloud, fichero local en tu PC).
- `src/auth.ts` — contexto local owner vs contexto cloud.
- `src/secrets.ts` — tokens en tu PC (keychain/fichero cifrado) vs tabla cloud.
- `src/tools.ts` — catálogo de las 14 herramientas y sus permisos.

Ver `openexpert.json.example` en la raíz y `docs/11-opencore.md`.
