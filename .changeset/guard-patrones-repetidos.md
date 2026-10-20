---
"@openexpert/openexpert": patch
---

El guard de patrones de inyección rechaza `((a+))+`, `(?:(?:a+))+` y `(a|aa)+`. La comprobación
anterior solo veía un grupo cuyos corchetes cerraban justo detrás de un cuantificador, así que
esas formas —que cuestan lo mismo— se guardaban desde Ajustes → Chat o desde `openexpert.json` y
se ejecutaban sobre cada mensaje en el hilo principal: con `((a+))+$` y una frase de 31 caracteres
la app se quedaba cuatro minutos sin responder (medido: 251,7 s frente a 59 s de `(a+)+$`). El
detector recorre ahora el patrón una vez y rechaza cualquier grupo repetido —dos o más veces,
acotado o no— que lleve dentro una repetición de longitud variable o una alternación; en tiempo de
ejecución se salta igual, así que un patrón guardado antes del arreglo tampoco puede colgar la
app. La regla es conservadora a propósito: un grupo repetido con alternación se rechaza aunque sus
ramas no solapen, y una alternación sin repetir se sigue admitiendo.
