# 007 · Un nombre y una versión

- **Estado:** aceptado.
- **Fecha:** 2026-10.

## Contexto

La aplicación es OpenExpert, pero el paquete con el que se distribuye se llamaba
`@openexpert/opencore`, su CLI respondía a `opencore` y la documentación tenía una
página con ese nombre. Técnicamente no fallaba nada y **nada registraba por qué**
se llamaba así: no hay ADR, comentario ni nota que lo explique, de modo que se leía
como una estrategia de licencia («open core») en vez de como un componente — y
choca con un proyecto de terceros muy conocido con el mismo nombre.

Del mismo sitio salían dos cosas más. Changesets nombra la release con el paquete
que publica, así que la página de releases mostraba `@openexpert/opencore@0.4.0`
en vez del producto. Y el producto tenía dos versiones: la del paquete (que se
publicaba) y la del manifiesto raíz (que no, y que la interfaz mostraba).

## Decisión

**El producto tiene un nombre y una versión, y los dos viven en un solo sitio.**

- El paquete es `@openexpert/openexpert`, en `packages/openexpert/`; el único
  binario del CLI es `openexpert`. El manifiesto raíz es un fichero de workspace
  privado y no tiene versión propia (`0.0.0`).
- La versión que muestra la interfaz es la del paquete: `src/lib/version.ts` lee
  el manifiesto y el empaquetador la incrusta.
- Las releases se etiquetan `v<versión>` y se titulan `OpenExpert <versión>`. Las
  crea `release.yml`, no changesets, porque changesets las nombraría con el paquete.
- La ventana de escritorio toma esa misma versión, y no puede leerla: Rust no
  tiene manifiesto JSON. `tauri.conf.json`, `Cargo.toml` y la entrada
  `openexpert-desktop` de `Cargo.lock` llevan copias que escribe
  `npm run desktop:sync-version` desde `packages/openexpert/package.json`;
  `version-packages` lo ejecuta, `install.sh` se niega a compilar cuando divergen
  y la puerta del escritorio lo avisa.

## Consecuencias

- Un número que subir y un nombre que leer, en la release, el CLI, la interfaz y
  la página de npm.
- El número que se sube sigue siendo uno, pero aterriza en cuatro ficheros: el
  manifiesto y las tres copias del lado Rust, a través del script. Cambiar solo el
  manifiesto deja atrás el binario y los paquetes, y la puerta lo para antes de
  publicar.
- El renombrado del paquete estrena nombre en npm: npm no permite renombrar y el
  _trusted publisher_ solo se puede configurar para un paquete que ya existe, así
  que la primera publicación del nombre nuevo es a mano y el viejo se marca como
  obsoleto con un aviso. A partir de ahí vuelve a publicar la CI como siempre.
- `ensureStandaloneApp` conserva la forma antigua del tag como respaldo, así que
  una versión publicada antes del renombrado sigue pudiendo descargar su bundle.
- El `CHANGELOG.md` de la raíz sigue siendo un agregado a mano: changesets versiona
  el paquete, no la raíz del workspace.
