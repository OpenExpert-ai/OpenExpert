---
"@openexpert/openexpert": patch
---

La guardia anti-ReDoS deja de decidir por la forma del patrón y decide por su **coste**. El detector
anterior solo rechazaba un grupo que se repite y lleva dentro otro cuantificador o una alternación, y
esa regla dejó pasar `.*.*.*.*.*.*b`: trece caracteres, la mitad del límite de 120, que se guardaban
desde Ajustes → Chat o desde `openexpert.json` y se ejecutaban contra cada mensaje en el hilo
principal. Con un mensaje de 60 caracteres la app se quedaba **23 422 ms** con el hilo bloqueado
(medido contra el módulo del repo), y con diez estrellas y 40 caracteres el turno no volvía nunca.

Los cuantificadores **en secuencia al mismo nivel** son la misma trampa que `(a+)+`: para el motor
hay 2ⁿ formas de repartirse el texto. Ninguna detector de formas lo ve, y por eso la tarea pedía
explícitamente no añadir una forma más a la misma lista.

Ahora el patrón se **mide** contra una entrada adversa (`src/lib/ai/redos.server.ts`): se prueba
con entradas construidas para que el motor tenga que repartirlas de todas las formas posibles —las
letras que el propio patrón usa, seguidas de un carácter que no usa, que es lo que hace fallar la
coincidencia al final— y se rechaza el que tarda más de lo debido. El criterio no depende de la
forma, así que una forma nueva no vuelve a abrir el agujero. La medición corre dentro de un contexto
`vm`, cuyo plazo corta la expresión si no vuelve: medir un patrón malo no congela a quien lo mide.

Las dos reglas se quedan, y en este orden: la de forma es instantánea y ya conoce las formas
clásicas, y la de coste solo se paga para los patrones que la de forma no reconoce. El texto de
Ajustes → Chat ya no promete que solo se rechacen los grupos anidados, porque con él la promesa era
falsa.
