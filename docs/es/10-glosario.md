# Glosario

> **Audiencia:** negocio y cualquier lector de la interfaz.

---

**Experto**
: Contexto de trabajo con interfaz, datos y dominio propios. Es la unidad de
aislamiento: un Experto no puede leer los datos de otro. Expertos iniciales:
`general`, `ventas`, `finanzas`, `marketing`.

**Fuentes**
: Conectores asignados a un Experto. Se declaran por Experto: si una fuente no
está declarada, su chat no habilita las herramientas correspondientes.

**Proceso**
: Secuencia automatizable con un disparador y una política de aprobación.
Concepto planificado: la versión anterior era un mock y se ha retirado hasta
poder construirlo de verdad (ver la hoja de ruta).

**Propuesta**
: Acción sugerida por el asistente y pendiente de ejecución, mostrada como
tarjeta. La IA propone y la persona decide.

**Herramienta**
: Función que el asistente puede invocar para obtener datos o proponer una
acción. El asistente no accede directamente a la base de datos.

**Razonamiento**
: Análisis del modelo expuesto antes de la respuesta cuando usa herramientas.

**Prompt injection**
: Intento de eludir las reglas del asistente. El sistema lo bloquea con un
filtro previo y lo registra.

**Fuera de contexto**
: Respuesta cuando una solicitud pertenece a otro Experto. Es aislamiento
correcto, no un error.

**Reversión**
: Restaurar un estado previo desde el snapshot guardado en el registro de
actividad.

**SQLite**
: El motor de base de datos local. Todos los datos viven en un único fichero,
`OPENEXPERT_DATA_DIR/openexpert.db`.

**Ollama**
: Runtime de modelos local. Sin claves y sin que los datos salgan del equipo.

**BYOK**
: «Bring your own key»: usar tu propia clave de API para un proveedor remoto.

**Scope**
: Permiso solicitado a Google durante la autorización. Drive solicita
`drive.readonly` y `drive.file`.

## Referencias

- [Producto](./01-producto.md).
- [IA](./05-inteligencia-artificial.md).
