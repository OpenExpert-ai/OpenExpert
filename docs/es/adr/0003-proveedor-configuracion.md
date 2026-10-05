# 003 · El proveedor de modelo es configuración

- **Estado:** aceptado.
- **Fecha:** 2025-10.

## Contexto

El asistente debe funcionar con un modelo local (Ollama), una clave gratuita
alojada (Google Gemini) o cualquier endpoint compatible con OpenAI (BYOK), sin
bifurcar la aplicación.

## Decisión

La selección vive en `@openexpert/opencore/model-provider` y se controla por
configuración: `OPENEXPERT_MODEL_PROVIDER` / `OPENEXPERT_MODEL_ID` (el entorno
gana a `openexpert.json`, que gana a los valores por defecto).
`src/lib/opencore/model-provider.server.ts` convierte esa selección en un
`LanguageModel` del SDK de IA.

## Consecuencias

- El arnés (herramientas, guarda de inyección, persistencia) no depende de un
  proveedor concreto.
- La clave es el único secreto específico del proveedor; `missingKeyHint()`
  genera el mensaje al usuario cuando falta.
- Las convenciones de URL difieren por proveedor (p. ej. raíz nativa de Ollama
  frente a `/v1`), así que el módulo normaliza las URLs (`ollamaApiBaseUrl`).
