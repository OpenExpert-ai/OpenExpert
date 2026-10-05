# 004 · Aislamiento de dominio por Experto en servidor

- **Estado:** aceptado.
- **Fecha:** 2025-10.

## Contexto

Los "Expertos" (ventas, finanzas, marketing, general) no deben leer los datos de
los demás. No se puede confiar en que un modelo lo garantice: el prompt del
sistema puede ignorarse o manipularse.

## Decisión

Cada herramienta de lectura declara un dominio. `domainAllowed(expertId, domain)`
en `src/lib/ai/chat.server.ts` se comprueba **dentro del `execute` de cada
herramienta**, antes de devolver dato alguno; las llamadas fuera de contexto
devuelven un error explícito en vez de datos. Es el equivalente local de RLS.

## Consecuencias

- El aislamiento se mantiene aunque se haga jailbreak; el prefiltro
  (`src/lib/ai/injection.ts`) es defensa en profundidad, no la garantía.
- Las acciones destructivas nunca las ejecuta una herramienta: solo se _proponen_
  y requieren aprobación humana (`propose_*`, `request_process_run`).
- Añadir una herramienta implica declarar su dominio y probar el camino de
  denegación.
