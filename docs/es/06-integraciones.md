# 06 · Integraciones

> **Audiencia:** ambos.

---

## 1. Estado

Solo **Google Drive** está conectada, y es opcional. Los demás conectores están
modelados en los datos pero pendientes de credenciales.

| Integración      | Categoría      | Conexión     | Estado         |
| ---------------- | -------------- | ------------ | -------------- |
| **Google Drive** | Productividad  | OAuth        | **Disponible** |
| Pipedrive        | CRM            | Por licencia | Pendiente      |
| Salesforce       | CRM            | Por licencia | Pendiente      |
| Holded           | ERP / Finanzas | Por licencia | Pendiente      |
| Gmail            | Productividad  | OAuth        | Pendiente      |
| Slack            | Productividad  | OAuth        | Pendiente      |
| Google Analytics | Publicidad     | OAuth        | Pendiente      |
| Meta Ads         | Publicidad     | Token        | Pendiente      |

## 2. Google Drive

Cada instalación conecta la cuenta de Google del propietario desde
_Integraciones → Fuentes_. No hay cuenta de servicio compartida.

### 2.1 Flujo

1. _Conectar Google Drive_ construye una URL de consentimiento con un `state` firmado.
2. Google redirige a `/auth/google/callback` con `code` y `state`.
3. El callback verifica el HMAC del `state`, canjea el código y guarda los tokens
   en `~/.openexpert/credentials.json` (`0600`).

### 2.2 Scopes

| Scope            | Finalidad               |
| ---------------- | ----------------------- |
| `drive.readonly` | Buscar y leer ficheros  |
| `drive.file`     | Crear y editar ficheros |

### 2.3 Estado del consentimiento: «In production»

En **Testing**, Google limita el refresh token a 7 días. Deja la pantalla de
consentimiento **In production** para que no caduque semanalmente.

## 3. Añadir una integración

1. **Credenciales.** Documenta el flujo OAuth o los requisitos de plan.
2. **Tokens.** Reutiliza el patrón de Drive (fichero local, `0600`).
3. **Cliente de API.** Un módulo de servidor con las credenciales del propietario.
4. **Sincronización.** Función que puebla la tabla destino y actualiza estado.
5. **Herramientas de IA.** Funciones de lectura con comprobación de dominio.

## 4. Referencias

- [Arquitectura](./02-arquitectura.md) — capas.
- [IA](./05-inteligencia-artificial.md) — catálogo de herramientas.
