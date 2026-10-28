---
"@openexpert/openexpert": patch
---

Las tres listas de negocio que faltaban dicen cuántas filas hay en vez de mandar la tabla entera:
`get_campaign_performance`, `get_churn_risk` y los deals estancados de `get_pipeline_summary`
devuelven como mucho 200 filas, con `total` (las que coinciden, la cifra que el modelo cita),
`hasMore` y una nota que dice cuántas se enseñan de cuántas; los estancados viajan con
`stalledTotal`, porque el resumen del pipeline ya lleva otras cifras. El importador de CSV y los
conectores llenan estas tablas con hasta 5 000 filas, así que la lista entera gastaba el turno en
tokens y, si el proveedor cortaba por longitud, el usuario leía un error en lugar de la lista.
