---
"@openexpert/openexpert": patch
---

Quitar un archivo de Google Drive en Ajustes → Fuentes revoca el acceso de verdad. La papelera
mandaba a `setGrantedFiles` la lista restante, pero esa función acumulaba por id y nunca borraba:
el id quitado seguía en `~/.openexpert/drive-grants.json`, `search_drive` lo seguía listando y
`read_drive_file` devolvía su contenido, así que el usuario creía haber retirado el permiso y el
modelo lo conservaba (la única revocación real era «Desconectar», que borra todos). Ahora el Picker
añade con `addGrantedFiles` (sigue acumulando y conserva el `addedAt` original) y la papelera llama
a `revokeGrantedFile`, que borra el id del fichero de concesiones, recalcula los tipos de la
integración y deja traza en el registro de actividad.
