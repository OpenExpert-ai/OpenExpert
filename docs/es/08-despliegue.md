# 08 · Despliegue

> **Audiencia:** ingeniería. Publicación en producción y configuración de dominio. El modo local (sección 8) no requiere despliegue.

---

## 1. Distribución de componentes

| Pieza                         | Ubicación                                                   |
| ----------------------------- | ----------------------------------------------------------- |
| Base de datos y autenticación | Supabase (proyecto gestionado, región UE)                   |
| Aplicación                    | Vercel                                                      |
| Credenciales de Google        | Proyecto de Google Cloud con Drive API y cliente OAuth      |
| Clave del modelo              | Google AI Studio (cloud) u Ollama / endpoint propio (local) |

## 2. Primer despliegue (cloud)

```sh
npx vercel link
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
npx vercel env add GOOGLE_CLIENT_SECRET production
npx vercel env add GOOGLE_API_KEY production
npx vercel env add GOOGLE_OAUTH_STATE_SECRET production
npx vercel env add PUBLIC_APP_URL production
npx vercel env add SUPABASE_URL production
npx vercel env add SUPABASE_PUBLISHABLE_KEY production
npx vercel env add VITE_SUPABASE_URL production
npx vercel env add VITE_SUPABASE_PUBLISHABLE_KEY production
npx vercel env add VITE_SUPABASE_PROJECT_ID production
npx vercel env add GOOGLE_CLIENT_ID production
npx vercel deploy --prod
```

Vercel detecta Vite automáticamente. El preset Nitro es `vercel` en cloud y `node-server` en local.

> Las variables `VITE_*` se incorporan al bundle en compilación: su modificación exige nuevo despliegue.

No se versionan valores de variables: se configuran en el panel de Vercel o en `.env` local (ver `.env.example`).

## 3. Registro del dominio en tres sistemas

| N.º | Dónde                                        | Qué registrar                            |
| --- | -------------------------------------------- | ---------------------------------------- |
| 1   | Google Cloud → cliente OAuth → redirecciones | `https://<dominio>/auth/google/callback` |
| 2   | Supabase Auth → `site_url`                   | `https://<dominio>`                      |
| 3   | Supabase Auth → redirecciones permitidas     | `https://<dominio>/**`                   |

### 3.1. `site_url` frente a lista de permitidas

La aplicación retorna a `<origen>/auth`, por lo que la validación efectiva recae en la lista de permitidas. Si se actualiza la lista sin `site_url`, la sesión redirige a localhost sin error visible. Ambos valores deben actualizarse conjuntamente.

### 3.2. Dominios de previsualización

Para entornos efímeros, añadir el patrón:

```text
https://<proyecto>-*.vercel.app/**
```

## 4. Cliente OAuth de Google

Un **único** cliente sirve al inicio de sesión (Supabase Auth) y a Drive (la aplicación). Deben registrarse **ambas familias** de URI:

| Flujo             | URI a registrar                                      |
| ----------------- | ---------------------------------------------------- |
| Inicio de sesión  | `https://<project-ref>.supabase.co/auth/v1/callback` |
| Drive, local      | `http://localhost:3000/auth/google/callback`         |
| Drive, producción | `https://<dominio>/auth/google/callback`             |

Google propaga los cambios en 1–5 minutos. El consentimiento debe estar en **In production** (ver [06-integraciones](./06-integraciones.md#25-estado-del-consentimiento-in-production)).

## 5. Verificación posterior

1. La aplicación responde en `https://<dominio>/auth` (código 200).
2. El inicio de sesión redirige a Google y no a localhost.
3. Auth confirma Google habilitado y correo/contraseña deshabilitado.
4. _Integraciones → Fuentes_ conecta Drive solicitando únicamente acceso a Drive.
5. El chat responde con herramientas y registra en actividad.

## 6. Actualizaciones, reversión y copias de seguridad

Vercel conserva el historial; la reversión se efectúa desde el panel o por comando.

> Los cambios de base de datos no se revierten con el código. Las migraciones se corrigen solo con una migración nueva.

El plan gratuito de base de datos no incluye recuperación point-in-time: se recomienda exportación lógica periódica (mensual) fuera del repositorio, así como copia de las variables de Vercel.

## 7. Modo local (OpenCore): sin despliegue

```sh
cp openexpert.json.example openexpert.json
OPENEXPERT_MODE=local npm run dev   # http://localhost:3000
node packages/opencore/bin/opencore.js doctor
```

Con `OPENEXPERT_MODEL_PROVIDER=ollama` no se requiere ninguna clave externa. Los datos residen en `OPENEXPERT_DATA_DIR` (por defecto `~/.openexpert/`).

## Referencias

- [Desarrollo](./07-desarrollo.md) — scripts y migraciones.
- [Integraciones](./06-integraciones.md) — flujo OAuth de Drive.
- [Operación y soporte](./09-operacion-y-soporte.md) — costes y diagnóstico.
