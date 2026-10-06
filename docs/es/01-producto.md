# 01 · Producto

> **Audiencia:** negocio.

---

## 1. Descripción general

**OpenExpert** es un panel de operaciones con inteligencia artificial que se
ejecuta **en tu propio equipo**. Su principio central:

> Un **Experto** es un asistente digital con su propio contexto de datos, su
> propio chat y su propio dominio, capaz de leer y actuar sobre los datos de su
> dominio — siempre con aprobación humana explícita.

Cada Experto está vinculado a uno o varios dominios (`ventas`, `finanzas`,
`marketing`, `clientes`), y el sistema impide que lea datos fuera de ellos.

## 2. Problema que resuelve

La información de una empresa está repartida entre CRM, ERP, plataformas
publicitarias y documentos. Responder preguntas transversales a mano exige
exportaciones y consolidación. OpenExpert automatiza la lectura y el análisis,
pero **no la ejecución**: la IA propone y la persona aprueba.

## 3. Funcionalidades

- **Expertos** con aislamiento por dominio. El conjunto inicial es `general`,
  `ventas`, `finanzas`, `marketing`.
- **Chat con datos reales** mediante herramientas que consultan la base de datos
  local. No inventa cifras.
- **Gobierno:** registro de actividad de cada evento relevante y reversión de los
  cambios reversibles.
- **Fuentes** (opcional): Google Drive, carpetas locales y Notion — leer, crear
  y editar archivos y documentos desde el chat.
- **Panel de configuración** (`/settings`): modelo e IA, chat y agentes, datos y
  copias de seguridad, apariencia y opciones avanzadas (diagnóstico y edición de
  `openexpert.json`). Los cambios surten efecto sin reiniciar.
- **Interfaz bilingüe** (español/inglés) seleccionable desde Apariencia.

## 4. Uso

Abre <http://localhost:3000>, elige un Experto y pregunta en lenguaje natural,
por ejemplo: «¿Cuál es el estado del pipeline y qué oportunidades llevan más de
tres semanas sin avance?». Obtienes una respuesta estructurada con la conclusión,
una tabla y recomendaciones.

## 5. Alcance

| Capacidad                                                                   | Estado    |
| --------------------------------------------------------------------------- | --------- |
| Edición local, propietario único                                            | Activo    |
| Chat con herramientas y streaming                                           | Activo    |
| Google Drive, carpetas locales y Notion (lectura; escritura con aprobación) | Opcional  |
| Registro de actividad y reversión                                           | Activo    |
| Pipedrive, Holded, Salesforce, Meta Ads, Gmail, Slack, Google Analytics     | Pendiente |
| Planificador automático de disparadores                                     | Pendiente |

## 6. Edición

Hay una única edición: **local**. Ver [Inicio rápido](./00-inicio-rapido.md) y
[Modelo de licencia](./12-licencia.md).
