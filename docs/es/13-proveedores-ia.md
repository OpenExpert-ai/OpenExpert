# 13 · Proveedores de IA

> **Audiencia:** todos. Cómo elegir y configurar el modelo que usa OpenExpert.

OpenExpert no requiere ninguna cuenta de IA. Tú eliges el proveedor; la
selección vive en `openexpert.json` o en las variables `OPENEXPERT_*` (la
variable de entorno manda).

| Proveedor           | Clave                  | Coste           | Los datos salen de tu equipo |
| ------------------- | ---------------------- | --------------- | ---------------------------- |
| `ollama`            | ninguna                | gratis          | no                           |
| `google`            | `GOOGLE_API_KEY`       | nivel gratuito  | sí (a Google)                |
| `openai-compatible` | `OPENEXPERT_MODEL_KEY` | según proveedor | sí                           |

## 1. Ollama (recomendado, 100 % local)

1. Instala Ollama: <https://ollama.com> (`curl -fsSL https://ollama.com/install.sh | sh`).
2. Descarga un modelo: `ollama pull llama3.1`.
3. Configura:

```json
{ "modelProvider": "ollama", "modelId": "llama3.1" }
```

Ollama escucha en `http://localhost:11434`; OpenExpert usa su endpoint
OpenAI-compatible (`/v1`). `OLLAMA_BASE_URL` acepta tanto la raíz nativa
(`http://localhost:11434`) como la URL `/v1`, y la normaliza para el modelo de
chat y para listar modelos. Ningún dato sale de tu equipo.

## 2. Google Gemini (clave gratuita)

1. Entra en **Google AI Studio** (<https://aistudio.google.com/apikey>) y crea
   una clave. El nivel gratuito basta para uso personal.
2. Configura:

```sh
export OPENEXPERT_MODEL_PROVIDER=google
export OPENEXPERT_MODEL_ID=gemini-2.5-flash
export GOOGLE_API_KEY=tu-clave
```

Con Google, el asistente muestra su razonamiento (thinking) en la interfaz.

## 3. Cualquier endpoint OpenAI-compatible (BYOK)

```sh
export OPENEXPERT_MODEL_PROVIDER=openai-compatible
export OPENEXPERT_BASE_URL=https://tu-endpoint/v1
export OPENEXPERT_MODEL_KEY=tu-clave
export OPENEXPERT_MODEL_ID=gpt-4o-mini
```

## 4. Con el CLI

```sh
npx @openexpert/opencore        # asistente interactivo
npx @openexpert/opencore models # listar modelos del proveedor actual
npx @openexpert/opencore doctor # revisar la configuración
```

El asistente guarda los secretos en `~/.openexpert/secrets.json` (permisos
`0600`), nunca en el repositorio.

## Referencias

- [Inicio rápido](./00-inicio-rapido.md) — primer arranque.
- [IA](./05-inteligencia-artificial.md) — herramientas y límites del asistente.
