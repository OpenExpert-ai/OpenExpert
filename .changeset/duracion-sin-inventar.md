---
"@openexpert/openexpert": patch
---

El registro de actividad ya no inventa duraciones. La columna `duration_ms`
guardaba 300 ms por defecto (`NOT NULL DEFAULT 300`) y `logActivity` escribía
`duration_ms ?? 300`, así que **todas** las acciones que nadie cronometró —
crear un Experto, guardar un ajuste, una escritura en Drive, un intento de
inyección bloqueado — se archivaban con 300 ms y la pantalla las pintaba como
«0.30s». En un registro de auditoría, una cifra que nadie ha medido se lee
como una medida real, que es la misma clase de fallo que un resumen que
afirma un envío que no ocurrió.

Ahora un evento sin medición guarda la duración nula y la pantalla muestra un
guion; las que sí se cronometran (la consulta al modelo, la puerta de
inyección, la reversión, la ejecución de Python) guardan el tiempo real. Los
números fijos que había —40 ms en el bloqueo por inyección y 320 ms en la
reversión— se han sustituido por la medida de verdad. La migración `0007`
rehace la tabla sin el `NOT NULL` y sin el valor por defecto; las filas ya
guardadas conservan su valor, porque una entrada pasada no se puede dejar de
medir.
