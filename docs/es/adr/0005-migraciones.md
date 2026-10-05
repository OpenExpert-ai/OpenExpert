# 005 · Migraciones con `PRAGMA user_version`

- **Estado:** aceptado.
- **Fecha:** 2026-10.

## Contexto

El DDL base (`drizzle/init.sql`) se aplica de forma idempotente con
`CREATE TABLE IF NOT EXISTS`, así que las columnas o índices nuevos nunca
llegaban a bases creadas por una versión anterior.

## Decisión

Añadir un ejecutor de migraciones ligero en `src/lib/db.server.ts`. `init.sql`
sigue siendo la base; cada cambio para bases existentes es un fichero numerado
`drizzle/migrations/NNNN_*.sql`. El ejecutor aplica los que tienen número mayor
que `PRAGMA user_version` y sube la versión.

## Consecuencias

- Las bases antiguas y nuevas convergen al arrancar; sin herramienta externa ni
  dependencia nativa.
- Quien contribuye debe añadir una migración numerada por cada cambio de esquema
  (documentado en `docs/es/07-desarrollo.md` y `AGENTS.md`).
- Los cambios complejos (borrar/renombrar columnas en SQLite) siguen necesitando
  una migración de reconstrucción de tabla, escrita a mano.
