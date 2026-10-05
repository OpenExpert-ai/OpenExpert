# 001 · SQLite con `sql.js`

- **Estado:** aceptado.
- **Fecha:** 2025-10 (reescritura local-first).

## Contexto

OpenExpert se ejecuta en la máquina del usuario sin servidor de base de datos ni
compilación nativa. Necesitábamos un almacén portátil de un solo fichero que
funcionase con cualquier versión de Node y que viajase dentro de una imagen
Docker y de la app Tauri.

## Decisión

Usar SQLite a través de `sql.js` (SQLite compilado a WebAssembly), tipado con
Drizzle ORM. La base de datos es un fichero en
`OPENEXPERT_DATA_DIR/openexpert.db`; las escrituras se vuelcan con `persist()`.

## Consecuencias

- Sin compilación nativa ni problemas de ABI de `better-sqlite3`.
- La base vive en memoria, así que cada escritura re-serializa el fichero; lo
  escribimos de forma atómica (`.tmp` + `rename`).
- Un solo proceso: dos servidores sobre el mismo fichero se pisarían. Aceptable
  para una app local de propietario único.
