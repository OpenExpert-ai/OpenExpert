# 09 · Operación y soporte

> **Audiencia:** ambos.

---

## 1. Coste

El coste de infraestructura es **cero**: todo se ejecuta en local. Si usas un
modelo remoto (nivel gratuito de Gemini o BYOK), pagas al proveedor; Ollama es
gratis.

## 2. Tareas periódicas

| Tarea                                 | Frecuencia |
| ------------------------------------- | ---------- |
| Revisar el registro de actividad      | Semanal    |
| Copiar `OPENEXPERT_DATA_DIR`          | Mensual    |
| Revisar las autorizaciones de fuentes | Mensual    |

## 3. Mantenimiento automático

- Retención de conversaciones: 30 días, limpieza oportunista (0 la desactiva).
- Refresco de tokens de Drive: automático.
- Reversión: cada cambio conserva su snapshot en el registro de actividad.

## 4. Diagnóstico

### 4.1 Chat

| Síntoma                   | Causa                       | Actuación                            |
| ------------------------- | --------------------------- | ------------------------------------ |
| Falta la clave del modelo | Proveedor sin configurar    | `openexpert fix` / `openexpert init` |
| Límite alcanzado          | Cuota del proveedor         | Esperar o cambiar de modelo          |
| Clave no válida           | Clave incorrecta            | Generar una nueva                    |
| «Fuera de contexto»       | El Experto no cubre el dato | Cambiar de Experto; es aislamiento   |
| Ollama no responde        | Ollama no está en marcha    | Arranca Ollama, `openexpert doctor`  |

### 4.2 Google Drive

| Síntoma                           | Causa                           | Actuación                            |
| --------------------------------- | ------------------------------- | ------------------------------------ |
| «Drive no conectado»              | Sin conexión o revocado         | _Integraciones → Fuentes_ → conectar |
| Caduca cada semana                | Consentimiento en Testing       | Pasar a **In production**            |
| Drive no habilitado en un Experto | Falta `gdrive` en `sources`     | Añadirlo en el Experto               |
| Permisos insuficientes            | La cuenta no alcanza el fichero | Revisar permisos del fichero         |

### 4.3 Base de datos

| Síntoma             | Causa                  | Actuación                                        |
| ------------------- | ---------------------- | ------------------------------------------------ |
| Datos perdidos      | Fichero borrado/movido | Restaurar tu copia de `OPENEXPERT_DATA_DIR`      |
| Puerto 3000 ocupado | Otro proceso           | Liberar el puerto 3000, o `PORT=3100 openexpert` |

Los comandos de esta tabla se ejecutan en el terminal: `openexpert doctor`,
`fix`, `init` y `version` no abren la ventana. Solo `openexpert` sin argumentos
(o `openexpert desktop`) arranca la interfaz gráfica.

### 4.4 Lanzador de escritorio

| Síntoma                                   | Causa                                          | Actuación                                                    |
| ----------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------ |
| La entrada del menú no hace nada          | El lanzador apunta a un fichero que ya no está | `npm run desktop:check` y luego `npm run desktop:install`    |
| La ventana muestra otra aplicación        | Otro proceso ocupa el puerto                   | `ss -ltnp \| grep :3000`; libéralo o arranca con `PORT=3100` |
| La ventana sale en blanco tras `git pull` | La ventana es más antigua que el servidor      | Reinstálala: `npm run desktop:install`                       |

`install.sh --doctor` hace esa misma comprobación del lanzador y sale con código
distinto de cero cuando falla, así que sirve desde un script.

## 5. Copias de seguridad

Copia `OPENEXPERT_DATA_DIR`. Contiene `openexpert.db`, `secrets.json`,
`credentials.json`, `drive-grants.json`, `local-roots.json`, `notion.json`,
`secret.key`, `state-secret` y `state-secret-notion`. `openexpert.json` vive en
el directorio desde el que se arranca la aplicación, así que cópialo también.
Guarda la copia con seguridad: contiene tus tokens y las claves que los cifran
y firman.

`GET /api/backup` (Ajustes → Datos → Descargar copia) empaqueta ese mismo
conjunto en un único JSON: la base de datos, `openexpert.json`, `secrets.json`,
los ficheros cifrados de credenciales y `secret.key`. Al importarlo se reescriben
todos, así que Drive, la selección del Picker, las carpetas locales y Notion
vuelven conectados. Como el fichero lleva la clave, es tan sensible como los
propios tokens: guárdalo donde guardarías una contraseña. Las copias anteriores
al formato 2 solo llevaban la base de datos, la configuración y los ficheros de
credenciales sin la clave; al importarlas se avisa de lo que no pudieron traer.

Una copia es un fichero que llega de fuera, así que la configuración que trae
se comprueba antes de escribir nada: los mismos límites que aplican el panel y
el editor en crudo. Una copia cuyo `openexpert.json` pide más de 200 pasos por
consulta, más de 3650 días de historial o un patrón que puede congelar el
servidor se rechaza entera, y el mensaje dice qué campo rompe qué límite. Cuando
se rechaza una copia no se cambia nada: la instalación se queda con la
configuración que tenía.

La base de datos que lleva la copia se comprueba igual, y por la misma razón: un
`openexpert.db` escrito por una versión **más nueva** de OpenExpert (una copia
restaurada de otra máquina con una build posterior, o la de una beta) trae tablas
que esta versión no conoce. La aplicación lo rechaza en vez de abrirlo y escribir
a ciegas sobre un esquema que no ha leído: el mensaje dice de qué versión viene
la base y hasta cuál entiende esta instalación, y no se toca nada —ni la base del
destino ni su `.bak`—. Actualiza OpenExpert y vuelve a importar la copia. Lo mismo
vale al arrancar: un `openexpert.db` con un esquema más nuevo no se abre y el
mensaje dice por qué.

## Referencias

- [Despliegue](./08-despliegue.md) — cómo arrancarlo.
- [Seguridad y acceso](./04-seguridad-y-acceso.md) — auditoría y reversión.
