---
"@openexpert/openexpert": patch
---

El recuento de una importación cuenta filas escritas, no apariciones de un id: un fichero que
repite un id ya no suma dos inserciones sobre una sola fila. La segunda aparición entra como
actualización de la fila que acaba de escribir la primera, y el total del aviso cuadra con lo que
hay en la base. El recuento vive en un solo helper que usan las cuatro entidades, en vez de repetir
la regla en cada rama.
