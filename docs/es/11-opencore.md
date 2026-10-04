# 11 · OpenCore (edición local descargable)

> **Audiencia:** ambos. Qué es gratis, qué es de pago y cómo usarlo en el equipo propio.

---

## 1. Objeto

**OpenCore** es la edición local y descargable de OpenExpert, distribuida bajo licencia MIT (`packages/opencore/`). Funciona en el equipo propio sin cuentas externas obligatorias, con custodia local de datos y libertad de elección del proveedor de modelo.

**OpenExpert Cloud** es la edición multiusuario (Supabase + Vercel): roles por Experto, invitaciones, auditoría centralizada y copias gestionadas. Ambas comparten catálogo de herramientas, aislamiento por Experto, filtro previo y aprobación humana.

## 2. Ediciones comparadas

| Aspecto         | OpenExpert Cloud                      | OpenCore local                                                        |
| --------------- | ------------------------------------- | --------------------------------------------------------------------- |
| Usuario         | Multiusuario con roles                | Propietario único (`local-owner`, `ADMIN`), sin login                 |
| Autenticación   | Google OAuth + trigger + perfil       | Sin autenticación                                                     |
| Persistencia    | PostgreSQL (Supabase)                 | Ficheros JSON en `OPENEXPERT_DATA_DIR` (por defecto `~/.openexpert/`) |
| Tokens de Drive | Tabla `google_tokens` (solo servicio) | `credentials.json` (permisos `0600`)                                  |
| Modelo          | Gemini vía `GOOGLE_API_KEY`           | Selector `google \| ollama \| openai-compatible`                      |
| Servidor        | Preset Nitro `vercel`                 | Preset Nitro `node-server` cuando `OPENEXPERT_MODE=local`             |
| Garantías       | —                                     | Aislamiento por Experto, filtro previo, aprobación humana             |

## 3. Puesta en marcha (tres pasos)

```sh
cp openexpert.json.example openexpert.json
OPENEXPERT_MODE=local npm run dev   # http://localhost:3000
node packages/opencore/bin/opencore.js doctor
```

- Sin `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, el chat opera con normalidad; Drive indicará pendiente de conexión.
- Con `OPENEXPERT_MODEL_PROVIDER=ollama` no se requiere ninguna clave externa.
- Alternativas: `npm run dev:local` y `npm run opencore:doctor`.

## 4. Configuración del modelo

| Variable                    | Finalidad                                                  |
| --------------------------- | ---------------------------------------------------------- |
| `OPENEXPERT_MODE`           | `local` (equipo propio) o `cloud` (multiusuario)           |
| `OPENEXPERT_MODEL_PROVIDER` | `google` \| `ollama` \| `openai-compatible`                |
| `OPENEXPERT_MODEL_ID`       | Identificador de modelo                                    |
| `OPENEXPERT_MODEL_KEY`      | Clave para proveedor `openai-compatible`                   |
| `OPENEXPERT_BASE_URL`       | Endpoint para proveedor `openai-compatible`                |
| `OLLAMA_BASE_URL`           | Endpoint de Ollama (por defecto, el local)                 |
| `GOOGLE_API_KEY`            | Clave de Google AI Studio (proveedor `google`)             |
| `OPENEXPERT_DATA_DIR`       | Directorio de datos locales (por defecto `~/.openexpert/`) |

Ni `openexpert.json` ni `~/.openexpert/` se versionan.

## 5. Arquitectura interna

- `packages/opencore/` — paquete MIT: modo, configuración, interfaces de almacenamiento y tokens, catálogo de herramientas, CLI.
- `src/lib/opencore/mode.ts` — determinación del modo.
- `src/lib/opencore/model-provider.server.ts` — selección del proveedor y construcción del modelo.
- `src/lib/opencore/file-storage.server.ts` — persistencia local en JSON.
- `src/lib/opencore/auth.server.ts` — propietario único local.
- `src/lib/opencore/local-secrets.server.ts` — custodia local de credenciales.
- `openexpert.json.example` — plantilla pública de configuración local.

## 6. Contenido público y no público

Público bajo MIT: `packages/opencore/`, catálogo de herramientas, selector de modelo, modo local, migraciones SQL, `openexpert.json.example`, `SECURITY.md` y la presente documentación.

Nunca público: `.env`, `openexpert.json`, `~/.openexpert/` (incluido `credentials.json`), claves de servicio, secreto OAuth, `auth.users`, referencia del proyecto de producción e información de facturación.

## Referencias

- [Seguridad y acceso](./04-seguridad-y-acceso.md) — roles y secretos.
- [Inteligencia artificial](./05-inteligencia-artificial.md) — proveedores y herramientas.
- [Despliegue](./08-despliegue.md) — modo local sin despliegue.
