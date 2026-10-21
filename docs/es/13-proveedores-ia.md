# 13 · Proveedores de IA

> **Audiencia:** todos. Cómo elegir y configurar el modelo que usa OpenExpert.

OpenExpert no requiere ninguna cuenta de IA. Tú eliges el proveedor; la
selección vive en `openexpert.json` o en las variables `OPENEXPERT_*` (la
variable de entorno manda).

| Proveedor           | Clave                  | Endpoint                        | Coste          | Los datos salen de tu equipo |
| ------------------- | ---------------------- | ------------------------------- | -------------- | ---------------------------- |
| `ollama`            | ninguna                | el tuyo (`OLLAMA_BASE_URL`)     | gratis         | no                           |
| `google`            | `GOOGLE_API_KEY`       | el del proveedor                | nivel gratuito | sí (a Google)                |
| `anthropic`         | `ANTHROPIC_API_KEY`    | el del proveedor                | de pago        | sí (a Anthropic)             |
| `openai-compatible` | `OPENEXPERT_MODEL_KEY` | el tuyo (`OPENEXPERT_BASE_URL`) | según servicio | sí                           |
| `opencode-go`       | `OPENCODE_GO_API_KEY`  | el del proveedor                | suscripción    | sí                           |

**Una clave por proveedor.** Cada ficha del catálogo nombra la variable que
guarda su clave, y ninguna la comparte con otra: guardar la clave de un
proveedor no toca lo que guardó otro. El panel lee esa variable del catálogo, así
que pide, guarda y etiqueta la clave de cada uno en su sitio. Tampoco se
sustituye por la de otro: cuando falta una clave se dice **cuál** falta, en vez
de probar con la ajena.

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

## 3. Anthropic (Claude)

1. Crea una clave en la **consola de Anthropic**
   (<https://console.anthropic.com/settings/keys>).
2. Configura:

```sh
export OPENEXPERT_MODEL_PROVIDER=anthropic
export OPENEXPERT_MODEL_ID=claude-sonnet-4-5
export ANTHROPIC_API_KEY=tu-clave
```

Su dirección es la de su ficha del catálogo (`https://api.anthropic.com/v1`), así
que no hay nada más que apuntar. **Listar**, en el panel, le pregunta al
proveedor qué modelos admite esa clave y ofrece lo que responde, junto a los
identificadores que el catálogo ya conoce.

## 3.1 Probar sin guardar

**Probar conexión** y **Listar** preguntan por **lo que hay escrito en el
formulario**, no por lo que está guardado: eliges otro proveedor, escribes su
clave y la pregunta va a ese proveedor con esa clave, aunque no hayas pulsado
guardar. El aviso dice cuál de las dos cosas se ha preguntado.

Si dejas la clave en blanco, la pregunta se hace con la que ya está guardada
(un campo en blanco significa «no la cambies», no «no hay ninguna»). Probar
**no guarda nada**: ni la clave, ni el endpoint, ni el proveedor.

```sh
# La configuración guardada es la que se pregunta cuando no hay nada escrito
openexpert models
```

## 4. Cualquier endpoint OpenAI-compatible (BYOK)

```sh
export OPENEXPERT_MODEL_PROVIDER=openai-compatible
export OPENEXPERT_BASE_URL=https://tu-endpoint/v1
export OPENEXPERT_MODEL_KEY=tu-clave
export OPENEXPERT_MODEL_ID=gpt-4o-mini
```

Es el único proveedor cuya dirección la pones tú, así que es el único al que se
le pide.

## 5. OpenCode Go

```sh
export OPENEXPERT_MODEL_PROVIDER=opencode-go
export OPENEXPERT_MODEL_ID=deepseek-v4.1-flash
export OPENCODE_GO_API_KEY=tu-clave
```

Su servicio enruta por conversación y pide la cabecera de sesión que declara su
ficha en el catálogo (`x-opencode-session`), que viaja solo con el identificador
de la conversación y solo para este proveedor.

## 6. Con el CLI

```sh
npx @openexpert/openexpert        # asistente interactivo
npx @openexpert/openexpert models # listar modelos del proveedor actual
npx @openexpert/openexpert doctor # revisar la configuración
```

El asistente y el panel guardan los secretos en `~/.openexpert/secrets.json`
(permisos `0600`), nunca en el repositorio. `doctor` revisa la clave del proveedor
que tengas elegido y dice qué variable falta cuando falta alguna.

## Referencias

- [Inicio rápido](./00-inicio-rapido.md) — primer arranque.
- [IA](./05-inteligencia-artificial.md) — herramientas y límites del asistente.
