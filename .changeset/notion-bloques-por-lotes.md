---
"@openexpert/openexpert": patch
---

Añadir bloques a una página de Notion trocea la lista en lotes de 100. La API de Notion solo admite
100 bloques hijos por petición y responde 400 a una lista más larga, así que una página que el
modelo escribía de una vez —una lista de 150 viñetas— no se escribía y el turno se quedaba a medias
con un «Notion respondió 400» que no decía nada. Ahora `append_notion_blocks` manda los bloques en
lotes de 100, en orden y uno detrás de otro, y el resultado dice cuántos se añadieron (`appended`) y
en cuántas peticiones (`requests`). Si un lote falla, el error dice por cuál iba y cuántos bloques
quedaron escritos, para releer la página antes de repetir sin duplicar lo que sí llegó. La
descripción de la herramienta avisa del tope, así que el modelo ya sabe que puede mandar la lista
entera sin partirla él.
