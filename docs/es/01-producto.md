# Producto

> **Audiencia:** dirección y equipo de negocio.
> **Relevancia adicional:** ingeniería, para la delimitación del alcance implementado y pendiente.

---

## 1. Descripción general

**OpenExpert** es un panel de operaciones con inteligencia artificial para la empresa. Su principio central es el siguiente:

> Un **Experto** es un asistente digital con su propio contexto de datos, su propio chat y sus propios permisos, capaz de ejecutar procesos operativos, siempre previa confirmación por una persona.

No se trata de un chatbot genérico. Cada Experto está vinculado a un dominio concreto (dirección, ventas, finanzas, marketing), y el sistema impide que un Experto acceda a los datos de otro.

## 2. Problema que resuelve

La información de una empresa mediana se encuentra distribuida entre el CRM, el ERP, las plataformas de publicidad y los documentos corporativos. La dirección debe responder de forma recurrente a preguntas transversales, por ejemplo:

- ¿Cuál es el importe del pipeline y qué oportunidades se encuentran estancadas?
- ¿Qué facturas se encuentran vencidas y por qué importe?
- ¿Qué campañas superan su objetivo de coste?
- ¿Qué cuentas de cliente presentan riesgo de baja?

La elaboración manual de estas respuestas requiere exportaciones y consolidación. OpenExpert automatiza la lectura y el análisis, pero **no la ejecución**: la inteligencia artificial propone y la persona aprueba.

## 3. Funcionalidades

### 3.1. Expertos

El Experto constituye el contexto de trabajo. La configuración inicial incluye cuatro Expertos:

| Experto     | Ámbito                                   | Fuentes declaradas                       |
| ----------- | ---------------------------------------- | ---------------------------------------- |
| `general`   | Dirección: indicadores consolidados, OKR | Pipedrive, Holded, Meta, Slack, Drive    |
| `ventas`    | CRM, pipeline, leads, previsión          | Pipedrive, Salesforce, Gmail             |
| `finanzas`  | Facturación, conciliación, tesorería     | Holded, Gmail, Google Drive              |
| `marketing` | Campañas, inversión, atribución          | Meta Ads, Google Analytics, Google Drive |

El chat opera siempre dentro de un Experto. El cambio de Experto modifica el contenido, las herramientas disponibles y los datos accesibles. El Experto es la unidad de aislamiento del sistema.

### 3.2. Chat con datos reales

El asistente responde mediante herramientas que consultan la base de datos. **No genera cifras estimadas**: si un dato no está disponible, lo indica expresamente. El detalle técnico se describe en [05-inteligencia-artificial](./05-inteligencia-artificial.md).

Asimismo, el asistente puede **crear y editar documentos en Google Drive** desde el propio chat y proporcionar el enlace correspondiente.

### 3.3. Procesos autónomos

Un proceso es una secuencia de pasos con un disparador y una política de aprobación definidos. Procesos previstos:

| Proceso                          | Disparador                     | Aprobación  | Estado   |
| -------------------------------- | ------------------------------ | ----------- | -------- |
| Seguimiento de facturas vencidas | Evento · factura vence +7 días | Requerida   | Activo   |
| Eficiencia de campañas           | Umbral · CPA > objetivo +30 %  | Requerida   | Activo   |
| Salud del pipeline               | Cron · viernes 17:00           | Ninguna     | Activo   |
| Generación de leads B2B          | Cron · lunes 08:00             | Ninguna     | Activo   |
| Detección de churn               | Cron · diario 06:00            | Doble firma | Inactivo |

Cuando se inicia un proceso o una acción desde el chat, **el sistema no aplica ninguna modificación directa**: genera una tarjeta de confirmación con el detalle exacto de los cambios propuestos y su solicitante. Sin aprobación explícita, no se ejecuta ninguna acción.

### 3.4. Gobierno: roles, permisos y trazabilidad

- **Roles** en tres niveles (administrador, intermedio, lector), asignables por persona. Definiciones en [10-glosario](./10-glosario.md).
- **Permisos por Experto** independientes del rol: es posible administrar el ámbito comercial sin acceso al ámbito de facturación.
- **Registro de actividad** de todos los eventos relevantes: consultas, ejecuciones, cambios de permisos e intentos de acceso denegados, con autor, fecha y resultado.
- **Reversión**: cualquier cambio puede revertirse desde el propio registro de actividad. Detalle en [04-seguridad-y-acceso](./04-seguridad-y-acceso.md).

## 4. Uso

### 4.1. Acceso

El acceso se realiza con cuenta de Google, sin contraseñas. Únicamente pueden acceder las cuentas previamente autorizadas por el administrador. El fundamento de este modelo se describe en [04-seguridad-y-acceso](./04-seguridad-y-acceso.md).

### 4.2. Flujo de uso habitual

1. Acceder al panel de Expertos.
2. Seleccionar el Experto correspondiente a la consulta (por defecto, `general`).
3. Formular la pregunta en lenguaje natural, por ejemplo: «¿Cuál es el estado del pipeline y qué oportunidades llevan más de tres semanas sin avance?».
4. Recibir una respuesta estructurada con la conclusión, los datos en tabla y recomendaciones.
5. Si el asistente propone una acción —como el envío de reclamaciones o la pausa de una campaña—, se presenta una tarjeta de confirmación para su aprobación o rechazo.
6. Consultar el _Registro de actividad_ para la auditoría y, en su caso, la reversión de cambios.

### 4.3. Conexión de Google Drive

Cada persona conecta **su propia** cuenta de Google desde _Integraciones → Fuentes_, de forma individual. No se requiere cuenta corporativa adicional.

## 5. Alcance actual

### 5.1. Funcionalidad disponible

- Inicio de sesión con Google, restringido a cuentas autorizadas.
- Chat con razonamiento visible, herramientas, aislamiento por Experto y tarjetas de confirmación.
- Integración con **Google Drive**: búsqueda, lectura, creación y edición de ficheros desde el chat, con OAuth por usuario y renovación automática de credenciales.
- Gobierno completo: roles, permisos por Experto, registro de actividad y reversión de cambios.
- Procesos autónomos con disparadores y políticas de aprobación definidos.

### 5.2. Integraciones declaradas pendientes de credenciales

Pipedrive, Salesforce, Holded, Meta Ads, Google Analytics, Gmail y Slack figuran en el catálogo de integraciones y constan como fuentes de los Expertos, pero **requieren credenciales de API para su activación**. El estado detallado de cada conector se describe en [06-integraciones](./06-integraciones.md).

### 5.3. Consecuencia operativa

Las tablas de métricas de negocio —oportunidades, facturas, campañas y cuentas— **no contienen datos de ejemplo**. En consecuencia, las herramientas correspondientes devuelven conjuntos vacíos y el asistente indica la ausencia de registros en lugar de generar cifras. Este es el comportamiento previsto hasta la conexión de las fuentes reales.

## 6. Alcance excluido

- Aplicación móvil. La interfaz es web y adaptable.
- Multiempresa: existe un único espacio de trabajo con control de acceso por Experto.
- Otros idiomas de interfaz. El producto y las respuestas del asistente están en español.
- Facturación o cobro. El producto no emite facturas; consume información de facturación de un ERP externo.

## 7. Indicadores de valor

| Área               | Indicador                                                        |
| ------------------ | ---------------------------------------------------------------- |
| Tiempo de análisis | Duración de elaboración de informes respecto al proceso anterior |
| Cobertura de datos | Número de Expertos con al menos una fuente real conectada        |
| Adopción           | Miembros activos por semana                                      |
| Control            | Porcentaje de acciones ejecutadas con aprobación formal          |
| Confianza          | Acciones propuestas por el asistente consideradas útiles         |

## Documentos relacionados

- [Arquitectura](./02-arquitectura.md) — estructura técnica del sistema.
- [Modelo de datos](./03-modelo-de-datos.md) — información almacenada.
- [Seguridad y acceso](./04-seguridad-y-acceso.md) — roles, permisos y auditoría.
- [Hoja de ruta](./roadmap.md) — estado y planificación.
