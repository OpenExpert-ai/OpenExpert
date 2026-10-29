---
"@openexpert/openexpert": patch
---

La ventana de lectura ya no parte un emoji por la mitad. El presupuesto se cuenta en unidades
UTF-16 y el corte caía entre las dos mitades de un par suplente, así que la ventana terminaba en
`\uD83D` suelto y la siguiente empezaba por `\uDE00`: el modelo leía un carácter roto en cada
frontera de un documento con emojis, CJK del plano 1 o cualquier carácter fuera del plano básico.
Ahora el corte se echa atrás hasta una frontera de carácter y el cursor (`line`/`char`) la
acompaña, de modo que recomponer las ventanas sigue dando el texto exacto; con un presupuesto de
una sola unidad se lleva el carácter entero, una unidad de más, antes que una ventana vacía que no
mueva el cursor. Afecta a los tres lectores que comparten `takeWindow`: `read_local_file`,
`read_drive_file` y la lectura de CSV.
