---
"@openexpert/openexpert": patch
---

El importador de CSV decide el separador con la regla del lector de archivos locales
(`src/lib/csv-text.ts`, módulo puro compartido): parte los primeros registros de cada
candidato, cuenta solo los separadores fuera de comillas y exige que la tabla más ancha se
repita en al menos la mitad de los registros. Antes contaba las apariciones en la primera
línea, comillas incluidas, así que un CSV separado por `;` cuya cabecera entrecomillada
llevara tantas comas como separadores tiene la tabla se partía por comas y todas sus filas
se rechazaban con «Falta client (cliente)».
