# Registros de decisiones de arquitectura

Notas breves e inmutables sobre las decisiones que dan forma a OpenExpert. Cada
una registra el contexto, la decisión y las consecuencias, para que quien
colabora no tenga que deducirlas del código.

| N.º | Decisión                                                                        |
| --- | ------------------------------------------------------------------------------- |
| 001 | [SQLite con `sql.js`](./0001-sqlite-sqljs.md)                                   |
| 002 | [Propietario único, sin autenticación](./0002-propietario-unico.md)             |
| 003 | [El proveedor de modelo es configuración](./0003-proveedor-configuracion.md)    |
| 004 | [Aislamiento de dominio por Experto en servidor](./0004-aislamiento-dominio.md) |
| 005 | [Migraciones con `PRAGMA user_version`](./0005-migraciones.md)                  |

Los ADR son solo de adición: para cambiar una decisión se añade un registro
nuevo que sustituye al anterior en lugar de editarlo.
