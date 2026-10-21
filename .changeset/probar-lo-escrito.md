---
"@openexpert/openexpert": patch
---

«Probar conexión» y «Listar» ya no prueban la configuración guardada, sino la
que está escrita en el formulario.

El panel guarda el proveedor, el endpoint y la clave en su propio estado y
solo los escribe cuando se pulsa «Guardar cambios», así que los dos botones
preguntaban siempre por lo que había en disco: se elegía otro proveedor, se
escribía su clave y el aviso era del anterior. Con una clave equivocada
recién escrita, «Probar conexión» podía responder «Conexión correcta» porque
la clave vieja seguía guardada.

Ahora los dos botones viajan con lo que hay escrito: el proveedor elegido, su
endpoint y su clave. La clave se usa para la pregunta y se tira —probar no
guarda, y ni `secrets.json` ni `openexpert.json` se tocan— y la llamada
recibe una **copia** del entorno con esa clave, así que el proceso sigue con
la guardada. Sin argumentos, las funciones de servidor siguen preguntando por
la configuración guardada, que es lo que hace el CLI.

El aviso dice de qué se trata: «Preguntado por la configuración guardada» o
«Preguntado por lo que has escrito, sin guardar».
