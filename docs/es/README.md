# Documentación de OpenExpert

Documentación de referencia del proyecto, dirigida al **equipo de ingeniería** —que requiere precisión, detalle y fundamento técnico— y al **equipo de negocio** —que requiere alcance, riesgos y decisiones—, de modo que cada perfil pueda consultar directamente los documentos de su ámbito.

## Índice

| N.º | Documento                                                  | Destinatario         | Contenido                                                         |
| --- | ---------------------------------------------------------- | -------------------- | ----------------------------------------------------------------- |
| 01  | [Producto](./01-producto.md)                               | Negocio              | Descripción de la plataforma y funcionalidad actual               |
| 02  | [Arquitectura](./02-arquitectura.md)                       | Ingeniería           | Capas, componentes y flujo de peticiones y de chat                |
| 03  | [Modelo de datos](./03-modelo-de-datos.md)                 | Ingeniería + Negocio | Información almacenada y significado de cada tabla                |
| 04  | [Seguridad y acceso](./04-seguridad-y-acceso.md)           | Ambos                | Control de acceso, permisos y mecanismos de protección            |
| 05  | [Inteligencia artificial](./05-inteligencia-artificial.md) | Ambos                | Capacidades del asistente, datos utilizados y controles           |
| 06  | [Integraciones](./06-integraciones.md)                     | Ambos                | Estado de cada conector y procedimiento de incorporación          |
| 07  | [Desarrollo](./07-desarrollo.md)                           | Ingeniería           | Entorno local, scripts, migraciones y convenciones                |
| 08  | [Despliegue](./08-despliegue.md)                           | Ingeniería           | Publicación en producción y configuración de dominio              |
| 09  | [Operación y soporte](./09-operacion-y-soporte.md)         | Ambos                | Tareas periódicas, límites de planes y diagnóstico de incidencias |
| 10  | [Glosario](./10-glosario.md)                               | Negocio              | Definición de los términos técnicos de la aplicación              |
| 11  | [OpenCore](./11-opencore.md)                               | Ambos                | Motor distribuido bajo licencia MIT: modo local y alcance         |
| —   | [Hoja de ruta](./roadmap.md)                               | Ambos                | Estado de implementación y planificación                          |

## Convenciones

- **Idioma:** todo el material está en español, idioma de la interfaz y de los comentarios del código.
- **Audiencia:** cada documento indica su destinatario principal. Los contenidos estrictamente técnicos se presentan en bloques diferenciados o tablas explícitas, de modo que puedan omitirse sin pérdida del contenido general.
- **Identificadores:** los identificadores técnicos (nombres de tablas, columnas, variables de entorno y rutas) se presentan siempre en `código monoespaciado`.

## Documentos complementarios

| Fichero        | Finalidad                                                             |
| -------------- | --------------------------------------------------------------------- |
| `AGENTS.md`    | Reglas operativas para asistentes de IA que operan en el repositorio. |
| `.env.example` | Relación comentada de variables de entorno.                           |
| `README.md`    | Presentación general y arranque rápido, con enlace a esta carpeta.    |

## Estado

- **Entorno:** producción sobre Supabase (región `eu-west-1`) y Vercel.
- **Coste de infraestructura:** planes vigentes sin coste adicional. El modelo de costes y sus límites se describen en [09-operacion-y-soporte](./09-operacion-y-soporte.md).
- **Madurez:** aplicación funcional y navegable. Únicamente Google Drive se encuentra conectado; los restantes conectores están declarados y pendientes de credenciales. Detalle en [01-producto](./01-producto.md#5-alcance-actual).
