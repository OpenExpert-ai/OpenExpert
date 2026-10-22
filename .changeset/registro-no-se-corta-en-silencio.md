---
"@openexpert/openexpert": patch
---

El Registro de Actividad deja de presentar sus 300 eventos más recientes como el registro entero. La
lectura del espacio de trabajo cortaba la lista en 300 filas sin decirlo y la pantalla imprimía ese
tamaño como total, así que un registro de 305 eventos se anunciaba «completo» con la etiqueta «40 /
300 eventos» y los cinco más antiguos no se podían ver de ninguna manera — ni sus snapshots, que son
justo lo que necesita el botón de revertir: un evento fuera de la ventana ya no se podía deshacer
desde el panel aunque siguiera en la base. Ahora el total sale de un `COUNT(*)` real
(`activityTotal`) y la nueva `getActivityPage` pagina hacia atrás con `offset`, con el `id` como
desempate del orden para que dos eventos escritos en el mismo milisegundo no se repitan ni se
pierdan al cambiar de página. La cabecera dice «{cuántos} de {total} eventos» y, mientras queden
anteriores, una línea avisa de cuántos se están listando y de que los demás se cargan con «Cargar
más», que ahora pide la página siguiente al servidor en vez de mover el corte dentro del mismo
array de 300.
