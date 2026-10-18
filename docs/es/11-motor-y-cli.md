# 11 · Motor y CLI

> **Audiencia:** ambos. El paquete `@openexpert/openexpert`: lo que la aplicación reutiliza y el CLI que instalas.

---

## 1. Objeto

`@openexpert/openexpert` (MIT, en `packages/openexpert/`) es el paquete de la
edición local: el motor que la aplicación reutiliza —catálogo de proveedores de
modelo, carga de configuración, interfaces de almacenamiento y tokens, catálogo
de herramientas— y el **CLI `openexpert`** que lo instala, lo configura y lo
arranca. No hay un segundo nombre de producto: el paquete, el CLI y la aplicación
son OpenExpert, y **la versión que ves en una release es la de este paquete**, el
único que se publica.

## 2. Qué contiene

| Módulo                   | Finalidad                                                            |
| ------------------------ | -------------------------------------------------------------------- |
| `src/model-provider.ts`  | `selectModel` / `missingKeyHint` (google, ollama, openai-compatible) |
| `src/providers.ts`       | El catálogo de proveedores (adaptador, dirección, variable, modelos) |
| `src/provider-models.ts` | Pregunta a un proveedor qué modelos sirve                            |
| `src/config.ts`          | Carga `openexpert.json` + `OPENEXPERT_*`                             |
| `src/storage.ts`         | Interfaz `Storage` (fichero)                                         |
| `src/secrets.ts`         | Interfaz `TokenStore` y ruta de credenciales                         |
| `src/tools.ts`           | Catálogo de herramientas                                             |
| `src/cli/`               | El CLI `openexpert`                                                  |

## 3. CLI

```sh
npx @openexpert/openexpert          # asistente, luego arranca
npx @openexpert/openexpert serve    # arrancar
npx @openexpert/openexpert doctor   # revisar la configuración
npx @openexpert/openexpert fix      # auto-configurar lo que falte
npx @openexpert/openexpert models   # listar modelos del proveedor actual
npx @openexpert/openexpert update   # actualizar el servidor descargado
```

`serve` arranca desde el código (`npm run dev`) o desde un servidor descargado y
verificado por checksum, que se trae de la release etiquetada `v<versión>`.

## 4. Configuración

| Variable                                                                                | Finalidad                                                                   |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `OPENEXPERT_MODEL_PROVIDER`                                                             | `ollama` \| `google` \| `anthropic` \| `openai-compatible` \| `opencode-go` |
| `OPENEXPERT_MODEL_ID`                                                                   | Identificador del modelo                                                    |
| `GOOGLE_API_KEY` / `ANTHROPIC_API_KEY` / `OPENCODE_GO_API_KEY` / `OPENEXPERT_MODEL_KEY` | Una clave por proveedor                                                     |
| `OPENEXPERT_BASE_URL`                                                                   | Endpoint del proveedor genérico `openai-compatible`                         |
| `OLLAMA_BASE_URL`                                                                       | Endpoint de Ollama                                                          |
| `OPENEXPERT_DATA_DIR`                                                                   | Directorio de datos (por defecto `~/.openexpert/`)                          |

Ni `openexpert.json` ni `~/.openexpert/` se versionan.

## 5. Referencias

- [Inicio rápido](./00-inicio-rapido.md).
- [Proveedores de IA](./13-proveedores-ia.md).
- [Modelo de licencia](./12-licencia.md).
