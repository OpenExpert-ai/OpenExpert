# Glosario

> **Audiencia:** negocio y cualquier lector de la interfaz o de la documentación técnica.
>
> Los términos se presentan en el idioma en que aparecen en la aplicación.

---

## Conceptos del producto

**Experto**
: Contexto de trabajo con interfaz, datos y permisos propios. Constituye la unidad de aislamiento del sistema: un Experto no puede acceder a los datos de otro. Corresponde a un ámbito funcional con su propio asistente. Los Expertos iniciales son `general`, `ventas`, `finanzas` y `marketing`.

**Fuentes**
: Conectores asignados a un Experto. Se declaran por Experto: si una fuente no está declarada en un Experto, su chat no habilita las herramientas correspondientes, aunque la persona tenga su cuenta conectada.

**Proceso**
: Secuencia de pasos automatizable con un disparador («Cron · viernes 17:00», «Evento · factura vence +7 días») y una política de aprobación. Ejemplos: seguimiento de facturas vencidas, eficiencia de campañas, salud del pipeline.

**Ejecución**
: Puesta en marcha de un proceso. Si el proceso requiere aprobación, la ejecución genera una tarjeta de confirmación y no produce efectos hasta su aprobación.

**Propuesta**
: Acción sugerida por el asistente y pendiente de ejecución. Se presenta como tarjeta con el detalle exacto de los cambios previstos. Constituye el mecanismo central de control: la inteligencia artificial propone y la persona decide.

## Personas y permisos

**ADMIN (administrador)**
: Control total. Puede crear Expertos, invitar miembros, modificar roles y permisos, revertir cambios, configurar integraciones y aprobar acciones en cualquier Experto.

**INTERMEDIO**
: Puede consultar y ejecutar en los Expertos donde dispone de permiso. No puede gestionar miembros ni permisos.

**LECTOR**
: Únicamente puede consultar y leer. **No** puede ejecutar acciones ni escribir, con independencia del permiso asignado. Es el rol aplicado por defecto en ausencia de rol explícito.

**Permiso de un Experto**
: Nivel de acceso de una persona a un Experto concreto: `none` (sin acceso), `read` (consulta y lectura) o `exec` (además, ejecución). Es independiente del rol.

**Invitación**
: Autorización previa de acceso. Una persona no autorizada no puede iniciar sesión, aunque disponga de una cuenta de Google válida. Cada invitación es de **un solo uso**.

**Propietario**
: Primera cuenta registrada y única exenta del requisito de invitación. Su protección se implementa en el trigger de altas de la base de datos.

## Datos y métricas

**Deal / oportunidad**
: Registro del CRM. Campos principales: empresa, etapa, valor, responsable, **días en la etapa** —utilizado para la detección de oportunidades estancadas— y estado.

**Win rate**
: Porcentaje de oportunidades ganadas sobre el total de oportunidades cerradas.

**Previsión (forecast)**
: Suma del valor de las oportunidades abiertas, ponderada por la probabilidad de cada etapa: cualificación 10 %, demo 25 %, propuesta 45 %, negociación 70 %, y 20 % para etapas no clasificadas.

**Factura vencida**
: Factura cuya fecha de vencimiento ha transcurrido. El asistente calcula los días de retraso y el número de recordatorios enviados.

**CPA**
: Coste por adquisición. Se calcula como gasto dividido por conversiones de los últimos siete días, y se compara con el objetivo de la campaña para la detección de sobrecostes.

**MRR**
: Ingreso mensual recurrente de una cuenta de cliente.

**Churn**
: Baja de un cliente. Se estima mediante la combinación de caída de uso, tickets abiertos y puntuación de riesgo.

## Inteligencia artificial y herramientas

**Herramienta**
: Función que el asistente puede invocar para obtener datos o proponer una acción. El asistente no accede directamente a la base de datos; únicamente opera a través de estas funciones.

**Razonamiento**
: Exposición del proceso de análisis del modelo antes de la respuesta, cuando utiliza herramientas. Es auditable: indica el motivo de cada invocación.

**Streaming**
: Transmisión progresiva de la respuesta durante su generación, visible como texto incremental en la interfaz.

**Prompt del sistema**
: Conjunto de instrucciones que define el comportamiento del asistente: idioma, formato de respuesta y reglas de seguridad. Se encuentra versionado en el código.

**Prompt injection / intento de evasión**
: Intento de eludir las reglas del asistente, por ejemplo mediante la suplantación de rol administrativo. El sistema lo detecta con un filtro previo, bloquea la petición antes de su procesamiento por el modelo y registra el intento.

**Fuera de contexto**
: Respuesta del sistema ante la solicitud de un dato perteneciente a otro Experto. Corresponde al funcionamiento correcto del aislamiento, no a un error.

## Infraestructura

**Supabase**
: Plataforma que proporciona la base de datos, la autenticación y la API. Los datos residen en PostgreSQL con seguridad a nivel de fila.

**Service role key**
: Credencial de administración de la base de datos, con acceso total. Su uso está restringido a módulos del servidor.

**Publishable key**
: Credencial pública destinada al navegador. Únicamente permite las operaciones autorizadas por las reglas de seguridad; en este proyecto, lectura.

**RLS (Row Level Security)**
: Seguridad a nivel de fila. Conjunto de reglas aplicadas por la base de datos para determinar las filas visibles o modificables por cada usuario. En este proyecto, los miembros disponen de acceso de lectura y toda escritura se realiza a través del servidor.

**Trigger**
: Acción ejecutada automáticamente ante la inserción o modificación de una fila. Se utiliza para la validación de acceso de nuevos usuarios y la normalización de valores.

**Migración**
: Fichero SQL versionado que modifica el esquema de la base de datos. Las migraciones se aplican en orden y son inmutables una vez aplicadas; cualquier corrección requiere una nueva migración.

**Server function**
: Función ejecutada en el servidor e invocada de forma remota por el navegador. Todas las escrituras de la aplicación utilizan este mecanismo, que constituye el punto único de verificación de permisos.

**Vercel**
: Plataforma de despliegue y ejecución de la aplicación.

**Nitro**
: Capa que adapta el servidor para su ejecución en la plataforma de despliegue.

**Refresh token**
: Credencial de larga duración que permite la obtención de nuevos tokens de acceso sin requerir una nueva autorización.

**Scope**
: Permiso solicitado al usuario durante la autorización. El inicio de sesión solicita `email profile`; Drive solicita `drive.readonly` (lectura) y `drive.file` (creación y edición).

**Allow list**
: Lista de direcciones de retorno aceptadas tras el inicio de sesión. Si la dirección de la aplicación no figura en ella, el acceso queda bloqueado tras la autenticación.

## Referencias

- [Producto](./01-producto.md) — descripción funcional del sistema.
- [Seguridad y acceso](./04-seguridad-y-acceso.md) — detalle de roles y permisos.
- [Inteligencia artificial](./05-inteligencia-artificial.md) — catálogo de herramientas.
