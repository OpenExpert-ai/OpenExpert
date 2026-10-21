---
"@openexpert/openexpert": patch
---

Crear un archivo local deja de seguir un enlace simbólico que ya esté en la carpeta autorizada.
`createLocalFile` comprobaba el destino con `existsSync`, que sigue el enlace: con un enlace
**roto** la comprobación contestaba que no había nada y `writeFileSync` creaba el fichero al otro
lado, fuera de las carpetas que el usuario concedió, mientras la ruta devuelta —y con ella la
tarjeta de aprobación— seguía enseñando la de dentro. Ahora mira la entrada con `lstat` (un enlace
cuenta aunque esté roto), comprueba además a dónde resuelve y escribe con `wx`, que falla en vez de
seguir una entrada que aparezca entre la comprobación y la escritura. Un nombre libre se sigue
creando igual, y el error explica en español por qué se rechaza.
