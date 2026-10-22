---
"@openexpert/openexpert": patch
---

La lectura de `openexpert.json` recorta los límites, como ya hacían la escritura y la restauración.

Los topes de `chat.maxSteps` (200 pasos), `chat.retentionDays` (3650 días) y `ai.maxOutputTokens`
(200000 tokens) existían en la puerta de escritura —el panel de ajustes y el editor en crudo los
rechazan— y en la de la restauración de una copia. Faltaba la tercera: la **lectura**, que es la que
ocurre cada vez que la aplicación arranca. El fichero manda, así que un `openexpert.json` escrito a
mano (la documentación dice que se puede editar a mano), o uno de una versión anterior a los topes,
dejaba la instalación con 100000 pasos por consulta —100000 llamadas facturables al proveedor en una
sola petición—, con la purga del historial desactivada de golpe y con 100 millones de tokens de
salida en un turno. Y no se avisaba de nada: el panel enseñaba los valores por defecto (50 pasos, 30
días) mientras el proceso corría con 100000.

Ahora el recorte va en el lector del paquete (`packages/openexpert/src/config.ts`), que es el mismo
por el que pasan el servidor y el CLI, y los números viven allí: el panel y el editor en crudo los
toman del paquete, así que no hay dos copias que puedan separarse.

El caso grave era la lista de patrones de inyección: cada patrón se **mide** contra una entrada
adversaria antes de usarse, así que una lista de cinco mil costaba treinta segundos de hilo
bloqueado en el primer chat (medido: 30 274 ms antes, 337 ms ahora con la lista acotada a cincuenta,
el mismo máximo que acepta el panel).

Y un límite recortado se anuncia, nunca en silencio: el diagnóstico de Ajustes → Avanzado lista lo que
se cortó y a qué, y `openexpert doctor` dice lo mismo. Un fichero que dice una cosa y una aplicación
en marcha que hace otra es algo que hay que contarle a quien lo tiene.
