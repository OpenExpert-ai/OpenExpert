# Documentación de OpenExpert

Esta es la documentación en español. El inglés (`../en/`) es la fuente de verdad;
este contenido lo refleja.

## Índice

| N.º | Documento                                                  | Destinatario         | Contenido                       |
| --- | ---------------------------------------------------------- | -------------------- | ------------------------------- |
| 00  | [Inicio rápido](./00-inicio-rapido.md)                     | Todos                | De cero a chatear en 5 minutos  |
| 01  | [Producto](./01-producto.md)                               | Negocio              | Qué hace la plataforma, alcance |
| 02  | [Arquitectura](./02-arquitectura.md)                       | Ingeniería           | Capas y flujo de datos          |
| 03  | [Modelo de datos](./03-modelo-de-datos.md)                 | Ingeniería + Negocio | Tablas SQLite                   |
| 04  | [Seguridad y acceso](./04-seguridad-y-acceso.md)           | Ambos                | Acceso, aislamiento, secretos   |
| 05  | [Inteligencia artificial](./05-inteligencia-artificial.md) | Ambos                | Herramientas y límites          |
| 06  | [Integraciones](./06-integraciones.md)                     | Ambos                | Google Drive y conectores       |
| 07  | [Desarrollo](./07-desarrollo.md)                           | Ingeniería           | Entorno, scripts, convenciones  |
| 08  | [Despliegue](./08-despliegue.md)                           | Ingeniería           | Ejecución local y Docker        |
| 09  | [Operación y soporte](./09-operacion-y-soporte.md)         | Ambos                | Tareas, diagnóstico, copias     |
| 10  | [Glosario](./10-glosario.md)                               | Negocio              | Vocabulario                     |
| 11  | [OpenCore](./11-opencore.md)                               | Todos                | El motor y CLI MIT              |
| 12  | [Modelo de licencia](./12-licencia.md)                     | Ambos                | MIT y obligaciones              |
| 13  | [Proveedores de IA](./13-proveedores-ia.md)                | Ambos                | Ollama, Gemini, BYOK            |
| —   | [Hoja de ruta](./roadmap.md)                               | Ambos                | Estado y planificación          |

## Convenciones

- **Idioma:** el inglés ([`../en/`](../en/)) es la fuente de verdad; esta
  carpeta ([`../es/`](../es/)) lo refleja.
- **Identificadores:** los identificadores técnicos aparecen siempre en `código monoespaciado`.

## Estado

OpenExpert es una aplicación **local y de propietario único**. Se ejecuta en tu
equipo con SQLite; no hay edición en la nube.
