# OpenExpert

Paquete de la edición local de OpenExpert (MIT): el motor que la aplicación
reutiliza y el CLI que la instala, la configura y la arranca. Se descarga y
funciona en tu máquina, sin crear cuentas ni depender de la nube. OpenExpert es
**local-first**: no hay edición cloud.

## Qué incluye

- `src/providers.ts` — catálogo de proveedores (adaptador, dirección, variable de clave, modelos).
- `src/model-provider.ts` — elige modelo y avisa de la clave que falta.
- `src/provider-models.ts` — pregunta a un proveedor qué modelos sirve.
- `src/config.ts` — lee `openexpert.json` + `OPENEXPERT_*`.
- `src/storage.ts` — interfaz de guardado local.
- `src/secrets.ts` — interfaz de tokens de Drive (fichero local, `0600`).
- `src/tools.ts` — catálogo de las 12 herramientas y sus dominios.
- `src/cli/` — el CLI `openexpert` (asistente, doctor, fix, models, serve, update).

## Uso

```sh
npx @openexpert/openexpert           # asistente, luego arranca
npx @openexpert/openexpert doctor    # revisar la configuración
```

Ver `openexpert.json.example` en la raíz y `docs/es/11-motor-y-cli.md`.
