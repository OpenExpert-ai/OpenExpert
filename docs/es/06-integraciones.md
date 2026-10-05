# 06 · Integraciones

> **Audiencia:** ambos.

---

## 1. Estado

Solo **Google Drive** está conectada, y es opcional. Los demás conectores están
modelados en los datos pero pendientes de credenciales.

| Integración      | Categoría      | Conexión       | Estado         |
| ---------------- | -------------- | -------------- | -------------- |
| **Google Drive** | Productividad  | OAuth + Picker | **Disponible** |
| Pipedrive        | CRM            | Por licencia   | Pendiente      |
| Salesforce       | CRM            | Por licencia   | Pendiente      |
| Holded           | ERP / Finanzas | Por licencia   | Pendiente      |
| Gmail            | Productividad  | API            | Pendiente      |
| Slack            | Productividad  | API            | Pendiente      |
| Google Analytics | Publicidad     | API            | Pendiente      |
| Meta Ads         | Publicidad     | Token          | Pendiente      |

## 2. Google Drive

El cliente OAuth va **embebido en el build** (cliente único propiedad del proyecto). **El usuario final no entra en Google Cloud.**

### 2.1 Flujo

1. **Integraciones → Fuentes** → `Conectar mi cuenta`.
2. Aparece un consentimiento que explica el scope, adónde va el dato y qué ve el
   modelo. Pulsa `Entiendo y conecto` para continuar.
3. Google pide `drive.file` y redirige a `http://localhost:3000/auth/google/callback`
   con `code` y un verifier PKCE.
4. El callback verifica el `state` (HMAC), canjea el código con el verifier y
   guarda los tokens cifrados en `~/.openexpert/credentials.json`.
5. **Integraciones → Fuentes** → `Seleccionar archivos` abre el Google Picker
   para que concedas acceso a archivos concretos.
6. La lista de concesiones se guarda cifrada en `~/.openexpert/drive-grants.json`.
   El chat solo puede buscar/leer/crear/editar dentro de esa lista.

### 2.2 Scopes

| Scope        | Finalidad                                                                           |
| ------------ | ----------------------------------------------------------------------------------- |
| `drive.file` | Acceso por archivo (no sensible). No requiere CASA. El usuario elige con el Picker. |

### 2.3 Claves (las pone el distribuidor, nunca el usuario)

| Variable / secret                                  | Finalidad                                                  | Dónde vive                                        |
| -------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------- |
| `OPENEXPERT_GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_ID` | Client_id de OAuth (público)                               | env, `openexpert.json` o `secrets.json`           |
| `GOOGLE_CLIENT_SECRET`                             | Secret del cliente OAuth                                   | env o `secrets.json` (`0600`)                     |
| `GOOGLE_PICKER_API_KEY`                            | API key del Picker (restringir por referrer localhost)     | env o `secrets.json`                              |
| `GOOGLE_PICKER_APP_ID`                             | Número de proyecto de Cloud (público)                      | env                                               |
| `OPENEXPERT_PRIVACY_URL`                           | URL de la política de privacidad que se muestra al activar | env (por defecto, apunta a `PRIVACY.md` del repo) |

### 2.4 Pantalla de consentimiento

Publica la pantalla de consentimiento en producción para que los refresh
tokens no caduquen a los 7 días. Consulta la
[FAQ de verificación OAuth](https://support.google.com/cloud/answer/9110914).
`drive.file` es **no sensible** → no se requiere auditoría CASA.

### 2.5 Consentimiento, privacidad y Limited Use

Antes de conectar se muestra una explicación en la propia app. La frase
obligatoria de Limited Use está en [`PRIVACY.md`](../../PRIVACY.md) (inglés) y
[`POLITICA-DE-PRIVACIDAD.md`](./POLITICA-DE-PRIVACIDAD.md) (español), y un
extracto aparece en el diálogo de conectar. La URL es configurable vía
`OPENEXPERT_PRIVACY_URL`.

## 3. Herramientas de IA

| Herramienta         | Comportamiento                                   |
| ------------------- | ------------------------------------------------ |
| `search_drive`      | Busca **solo** dentro de los archivos concedidos |
| `read_drive_file`   | Lee solo dentro de las concesiones               |
| `create_drive_file` | Crea un nuevo archivo propiedad de la app        |
| `update_drive_file` | Edita un archivo concedido o creado por la app   |

Las lecturas requieren `gdrive` en `sources` del Experto. Las escrituras
requieren aprobación humana.

## 4. Notas de seguridad

- Los **tokens** y la **lista de concesiones** están cifrados con **AES-256-GCM**
  con una clave generada en tu máquina (`~/.openexpert/secret.key`, `0600`).
- El `state` de OAuth incluye el verifier PKCE firmado con HMAC; el secreto
  vive en `~/.openexpert/state-secret` (o en `GOOGLE_OAUTH_STATE_SECRET`).
- El navegador se considera de confianza en la edición local
  monopropietario (ver [`04-seguridad-y-acceso.md`](./04-seguridad-y-acceso.md)).

## 5. Añadir una integración

1. **Credenciales.** Documenta el flujo OAuth o los requisitos de plan.
2. **Tokens.** Reutiliza el patrón de Drive (fichero local cifrado, `0600`).
3. **Cliente de API.** Módulo de servidor con las credenciales del propietario.
4. **Sincronización.** Función que rellena la tabla destino y actualiza estado.
5. **Herramientas de IA.** Funciones de lectura con comprobación de dominio,
   de scope y registro de fuente. Incluye siempre un disclosure en producto si
   los datos se envían a un modelo.

## 6. Referencias

- [Arquitectura](./02-arquitectura.md) — capas.
- [IA](./05-inteligencia-artificial.md) — catálogo de herramientas.
- [Seguridad y acceso](./04-seguridad-y-acceso.md) — secretos.
- [PRIVACY.md](../../PRIVACY.md) — política de privacidad.
