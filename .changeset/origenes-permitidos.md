---
"@openexpert/openexpert": patch
---

`OPENEXPERT_ALLOWED_ORIGINS` (nombres separados por comas) añade los que el servidor atiende
además del bucle local y de la interfaz de escucha. Con `OPENEXPERT_HOST=0.0.0.0` — lo que
recomienda la documentación para publicar la app — el servidor aceptaba cualquier `Host` en el
puerto pero seguía comparando el `Origin` contra una lista en la que el comodín no añade nada: el
`POST /api/chat` respondía 403 desde otra máquina y el chat no funcionaba en el modo que
documentábamos. Un proxy inverso delante se topaba con lo mismo, porque el `Host` que reenvía es
su dominio público y tampoco estaba en la lista. Los nombres siguen saliendo de la configuración
y nunca del `Host` de la petición, así que el DNS rebinding se queda fuera; sin la variable todo
se comporta como antes.
