---
"@openexpert/openexpert": patch
---

Escuchar en `0.0.0.0` deja de aceptar cualquier `Host`. La comprobación de nombre tenía una salida
para el comodín que daba por buena toda petición cuyo `Host` terminara en el puerto de escucha, así
que el servidor atendía nombres que nadie había declarado. Como una petición segura sin cabecera
`Origin` —toda petición _same-origin_ que hace una página, y por tanto la forma entera del ataque de
DNS rebinding— pasaba también la comprobación de origen, una página servida desde `evil.test:3000`
que el DNS reenganchara a `127.0.0.1` podía pedir `GET /api/backup` y recibir la copia completa:
`secrets.json`, las credenciales cifradas y la `secret.key` que las descifra. Ahora el comodín dice
solo dónde escuchar, como ya decían `SECURITY.md` y la guía de despliegue: los nombres se declaran en
`OPENEXPERT_ALLOWED_ORIGINS` y cualquier otro se responde 403, también cuando el `Host` es el de un
nombre de la LAN. Una instalación que expusiera la app con `OPENEXPERT_HOST=0.0.0.0` y sin esa lista
tiene que añadirla para seguir abriéndola desde otro equipo.
