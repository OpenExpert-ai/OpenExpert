---
"@openexpert/openexpert": patch
---

`read_local_file` lee un CSV con comillas como lo lee cualquier hoja de cálculo: una celda
entrecomillada puede llevar dentro el delimitador y saltos de línea. El recuento se hacía partiendo
el texto por saltos de línea y la cabecera por comas, sin mirar las comillas, así que una dirección
escrita en dos líneas contaba una fila de más (una tabla de dos clientes se anunciaba como de tres)
y una cabecera como `"cliente, nombre",importe` devolvía tres columnas donde hay dos, inventando una
columna que no existe. Las dos cosas viajan al modelo en `sheets`, que las repite al usuario con
toda la confianza. Ahora el archivo se trocea en registros respetando las comillas: las comillas
escapadas (`""`) son una comilla literal, los campos vacíos y las líneas en blanco no descuadran el
recuento, y el nombre de cada columna llega sin las comillas que lo envuelven. Un CSV que ya se
leía bien sigue dando el mismo número.
