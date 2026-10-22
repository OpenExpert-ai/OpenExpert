---
"@openexpert/openexpert": patch
---

El registro de actividad ya no enseña 300 eventos como si fueran todos.

`getWorkspace` le pedía a la base de datos los 300 eventos más recientes y
nada más, y la pantalla pintaba `{a} / {b} eventos` con `b = ws.activity.length`:
el **tamaño de la ventana** presentado como el **total del registro**. Con 305
eventos en la base la pantalla decía «300 eventos» y no había manera de llegar
a los cinco últimos —ni de leerlos, ni de revertir su snapshot, que es
justamente lo que la pantalla promete («reversión por snapshots»). El mismo
patrón mudo que ya se corrigió en `list_local_files` (total y nota) y al revés
del que se corrigió en `search_drive`: aquí el silencio era peor, porque el
número se presentaba como el total.

Ahora el total sale de un `COUNT(*)` de verdad, con los mismos filtros que la
lista, y la pantalla lo dice como lo que es: «40 de 305 eventos». Y los
eventos antiguos se alcanzan: una server function nueva (`listActivity`) devuelve
la ventana que se pide, con el desplazamiento que le corresponde, así que el
evento más antiguo del registro se puede abrir —y por tanto revertir— como
cualquier otro. La ventana no crece: crece el desplazamiento, y `nextOffset`
dice dónde empieza la siguiente.

De paso, la búsqueda del registro se hace en la base de datos (antes filtraba
en el navegador los eventos que ya tenía, así que solo buscaba en los 300 más
recientes) y busca en el resumen, el tipo, el nombre del actor y el id. El
término se escapa, así que `%` y `_` son literales y no comodines: buscar
«100%» encuentra «Descuento del 100%» y no «Descuento del 1000». Y el plegado
de mayúsculas es el de Unicode (`casefold`, un ayudante SQL registrado en
`db.server.ts`), no el de SQLite, que solo pliega ASCII: «Configuración»
ahora se encuentra buscando «configuración» y «INTEGRACIÓN» buscando
«integración».

Por el camino, la acción pendiente de un evento se lee con el mismo esquema que
usa la decisión (`pendingActionSchema`): un snapshot escrito a mano que lleva
una acción que el servidor no sabe ejecutar ya no se enseña con los botones de
aprobar, porque aprobarla iba a fallar.
