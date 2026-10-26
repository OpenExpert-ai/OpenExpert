---
"@openexpert/openexpert": patch
---

La fecha de una fila del registro de actividad ya dice de qué año es. El registro no tiene retención,
así que la lista abarca varios años y la línea de cada evento se pintaba solo con día, mes y hora: un
evento del 15 de junio de 2025 y uno del 15 de junio de 2026 se leían igual, «15 jun, 10:30», y al
reconciliar un incidente o comprobar cuándo se revirtió algo la fecha visible se leía como si fuera
de este año. Ahora el año se escribe cuando la fecha no es del año en curso —una de este año sigue
corta, como hasta ahora— y se toma del calendario local, no del UTC. La lista de conversaciones del
Experto tenía el mismo defecto por duplicado; las dos pasan por un único formateador
(`formatDateTime`), así que no pueden separarse otra vez.
