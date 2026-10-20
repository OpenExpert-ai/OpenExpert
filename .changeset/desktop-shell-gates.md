---
"@openexpert/openexpert": patch
---

Escritorio: el lanzador ya no inyecta `desktop` en todos los comandos, así que
`openexpert doctor`, `fix`, `init`, `serve` y `version` ejecutan el CLI sin abrir
la ventana (solo `openexpert` sin argumentos, o `openexpert desktop`, arranca la
interfaz). La ventana carga el puerto que sirve el comando (`PORT=3100`) en vez
del 3000 compilado en el binario, y el instalador comprueba lo que escribe: un
lanzador que ejecuta un fichero que ya no existe falla en vez de darse por bueno.
Una sola versión manda: `npm run desktop:sync-version` escribe
`tauri.conf.json`, `Cargo.toml` y `Cargo.lock` desde el manifiesto del paquete.
