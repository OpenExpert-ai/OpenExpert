# 11 · OpenCore

> **Audiencia:** ambos. El motor y CLI compartidos, bajo licencia MIT.

---

## 1. Objeto

**OpenCore** es el motor y CLI de código abierto de OpenExpert, distribuido bajo
licencia MIT (`packages/opencore/`). Aporta el selector de proveedor de modelo,
la carga de configuración, las interfaces de almacenamiento y tokens, el
catálogo de herramientas y el CLI `opencore`.

## 2. Qué contiene

| Módulo                  | Finalidad                                                            |
| ----------------------- | -------------------------------------------------------------------- |
| `src/model-provider.ts` | `selectModel` / `missingKeyHint` (google, ollama, openai-compatible) |
| `src/config.ts`         | Carga `openexpert.json` + `OPENEXPERT_*`                             |
| `src/storage.ts`        | Interfaz `Storage` (fichero)                                         |
| `src/secrets.ts`        | Interfaz `TokenStore` y ruta de credenciales                         |
| `src/tools.ts`          | Catálogo de herramientas                                             |
| `src/cli/`              | El CLI `opencore`                                                    |

## 3. CLI

```sh
npx @openexpert/opencore          # asistente, luego arranca
npx @openexpert/opencore serve    # arrancar
npx @openexpert/opencore doctor   # revisar la configuración
npx @openexpert/opencore fix      # auto-configurar lo que falte
npx @openexpert/opencore models   # listar modelos del proveedor actual
npx @openexpert/opencore update   # actualizar el servidor descargado
```

`serve` arranca desde el código (`npm run dev`) o desde un servidor descargado y
verificado por checksum.

## 4. Configuración

| Variable                                       | Finalidad                                          |
| ---------------------------------------------- | -------------------------------------------------- |
| `OPENEXPERT_MODEL_PROVIDER`                    | `google` \| `ollama` \| `openai-compatible`        |
| `OPENEXPERT_MODEL_ID`                          | Identificador del modelo                           |
| `GOOGLE_API_KEY`                               | Clave de Gemini                                    |
| `OPENEXPERT_MODEL_KEY` / `OPENEXPERT_BASE_URL` | Endpoint OpenAI-compatible                         |
| `OLLAMA_BASE_URL`                              | Endpoint de Ollama                                 |
| `OPENEXPERT_DATA_DIR`                          | Directorio de datos (por defecto `~/.openexpert/`) |

Ni `openexpert.json` ni `~/.openexpert/` se versionan.

## 5. Referencias

- [Inicio rápido](./00-inicio-rapido.md).
- [Proveedores de IA](./13-proveedores-ia.md).
- [Modelo de licencia](./12-licencia.md).
