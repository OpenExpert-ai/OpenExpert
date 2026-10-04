# 08 · Despliegue

> **Audiencia:** ingeniería. No hay despliegue en la nube.

---

## 1. Formas de ejecutar OpenExpert

| Forma               | Comando                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------- |
| Desarrollo          | `npm ci && npm run dev`                                                                   |
| Build de producción | `npm run build` y luego `node .output/server/index.mjs`                                   |
| Docker              | `docker run -p 3000:3000 -v openexpert-data:/data ghcr.io/openexpert-ai/openexpert:local` |
| CLI                 | `npx @openexpert/opencore serve`                                                          |

La aplicación escucha en el puerto 3000. El preset de Nitro es `node-server`.

## 2. Docker

```sh
docker build -f docker/Dockerfile -t openexpert:local .
docker run --rm -p 3000:3000 -v openexpert-data:/data \
  -e OPENEXPERT_MODEL_PROVIDER=ollama openexpert:local
```

`docker/docker-compose.yml` también arranca un servicio Ollama:

```sh
docker compose -f docker/docker-compose.yml up -d
docker compose -f docker/docker-compose.yml exec ollama ollama pull llama3.1
```

## 3. OAuth de Google Drive

Basta con un cliente OAuth. Registra la URI de redirección:

| Entorno | URI                                          |
| ------- | -------------------------------------------- |
| Local   | `http://localhost:3000/auth/google/callback` |

Define `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` (en `.env` o el entorno).
Deja la pantalla de consentimiento **In production** para que el refresh token
no caduque a los 7 días. Ver
[Integraciones](./06-integraciones.md).

## 4. Copias de seguridad

Todo el estado es `OPENEXPERT_DATA_DIR`. Copia ese directorio para respaldar; el
fichero SQLite es `openexpert.db`.

## 5. Actualizaciones

- Código: `git pull` / reinstala el paquete y reconstruye.
- Servidor descargado: `npx @openexpert/opencore update`.

## Referencias

- [Desarrollo](./07-desarrollo.md) — scripts.
- [Operación y soporte](./09-operacion-y-soporte.md) — diagnóstico.
