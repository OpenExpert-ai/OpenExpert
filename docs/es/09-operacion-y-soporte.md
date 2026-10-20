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

- Retención de conversaciones: 30 días, limpieza oportunista.
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

Copia `OPENEXPERT_DATA_DIR` (contiene `openexpert.db`, `credentials.json` y
`secrets.json`). Guarda la copia con seguridad: contiene tus tokens.

## Referencias

- [Despliegue](./08-despliegue.md) — cómo arrancarlo.
- [Seguridad y acceso](./04-seguridad-y-acceso.md) — auditoría y reversión.
