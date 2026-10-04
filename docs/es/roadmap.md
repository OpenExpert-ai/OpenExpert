# Hoja de ruta

Estado de los elementos implementados y pendientes. El detalle de cada punto se encuentra en el documento enlazado.

## Implementado

| Elemento                                                                 | Documento                                                                                            |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Infraestructura propia, sin intermediarios en el proceso de build        | [Arquitectura §7](./02-arquitectura.md#7-elementos-excluidos-por-diseño)                             |
| Inicio de sesión con Google, restringido a cuentas autorizadas           | [Seguridad y acceso §1](./04-seguridad-y-acceso.md#1-quién-puede-entrar)                             |
| Chat con razonamiento visible, herramientas y aislamiento                | [IA §2](./05-inteligencia-artificial.md#2-catálogo-de-herramientas)                                  |
| Tarjetas de confirmación, incluida la doble firma                        | [IA §2.3](./05-inteligencia-artificial.md#23-herramientas-de-propuesta-no-ejecutan)                  |
| Integración con Google Drive: búsqueda, lectura, creación y edición      | [Integraciones §2](./06-integraciones.md#2-google-drive-funcionamiento)                              |
| Gobierno: roles, permisos por Experto, registro y reversión              | [Seguridad y acceso §2, §3 y §8](./04-seguridad-y-acceso.md#2-modelo-de-roles)                       |
| Detección y registro de intentos de evasión                              | [Seguridad y acceso §5.1](./04-seguridad-y-acceso.md#51-filtro-previo-antes-de-que-el-modelo-exista) |
| Retirada de los datos de ejemplo de negocio                              | —                                                                                                    |
| Retirada de la función `reset_demo` y del control «Reiniciar demo»       | [Modelo de datos §7](./03-modelo-de-datos.md#7-migraciones)                                          |
| Eliminación del modelo de datos anterior                                 | [Modelo de datos §4](./03-modelo-de-datos.md#4-tablas-eliminadas-modelo-anterior)                    |
| Edición local OpenCore (MIT): modo local, BYOK y Ollama                  | [OpenCore](./11-opencore.md)                                                                         |
| CLI interactiva: asistente, `doctor`, `fix`, `models`, `serve`, `update` | [Inicio rápido](./00-inicio-rapido.md)                                                               |
| Edición local usable de extremo a extremo (UI, semilla, bienvenida)      | [OpenCore](./11-opencore.md)                                                                         |
| Docker Compose sin configuración (app + Ollama) y `create-openexpert`    | [Inicio rápido](./00-inicio-rapido.md)                                                               |

## Pendiente

Elementos ordenados por relación entre valor y esfuerzo.

### Sin coste externo, valor alto

- [ ] **Conexión de Google Drive para los miembros pendientes.** La tabla `google_tokens` registra los tokens por usuario.
- [ ] **Envío de invitaciones por correo electrónico.** Actualmente la invitación se crea en la aplicación y su comunicación se realiza por un canal externo.

### Requiere credenciales del cliente

- [ ] **Pipedrive** — CRM. Las herramientas de `ventas` están implementadas y operan cuando existen datos.
- [ ] **Holded** — ERP. Habilita las herramientas de `finanzas` y el seguimiento de facturas vencidas.
- [ ] **Meta Ads** — publicidad. Habilita el análisis de CPA frente a objetivo y la propuesta de pausa de campañas.
- [ ] **Google Analytics** — analítica. Complementa a Meta Ads.
- [ ] **Slack** — notificaciones de procesos y avisos.
- [ ] **Gmail** — envío efectivo de reclamaciones de cobro. Actualmente se registran sin envío.
- [ ] **Salesforce** — CRM. Requiere evaluación previa de su aportación frente a Pipedrive.

### Automatización pendiente

- [ ] **Disparadores efectivos de los procesos.** Actualmente el campo `trigger` es descriptivo; no existe planificador de ejecución temporal.
- [ ] **Ingesta automática de las tablas de negocio.** Las tablas `deals`, `invoices`, `campaigns` y `accounts` están destinadas a ser alimentadas por las integraciones correspondientes.

### Pendiente de despliegue

- [ ] **Primer despliegue en producción** y registro del dominio en los tres puntos descritos en [08-despliegue §3](./08-despliegue.md#3-registro-del-dominio-en-tres-sistemas).
- [ ] **Plan de copias de seguridad.** Ver [08-despliegue §6](./08-despliegue.md#6-actualizaciones-reversión-y-copias-de-seguridad).
