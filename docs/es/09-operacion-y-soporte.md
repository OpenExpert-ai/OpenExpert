# 09 · Operación y soporte

> **Audiencia:** ambos. Negocio: tareas y costes. Ingeniería: diagnóstico.

---

## 1. Costes y cuotas (cloud)

La operación actual se mantiene dentro de los planes gratuitos. **Coste mensual de infraestructura: 0 €.**

| Servicio           | Plan           | Cobertura                                    | Primer cobro        |
| ------------------ | -------------- | -------------------------------------------- | ------------------- |
| Supabase           | Free           | Base de datos, auth, almacenamiento limitado | Al superar la cuota |
| Vercel             | Hobby          | Hosting, ancho de banda incluido             | Al superar la cuota |
| Google AI Studio   | Nivel gratuito | Cuota de peticiones de Gemini                | Al agotar la cuota  |
| Google Cloud/Drive | Gratuito       | Drive API y OAuth, sin tarjeta               | No aplica           |

| Límite alcanzado        | Efecto                                                        |
| ----------------------- | ------------------------------------------------------------- |
| Cuota del modelo        | El chat responde con mensaje de límite e indicación de espera |
| Peticiones por minuto   | Posibles respuestas 429                                       |
| Almacenamiento          | Detención de escrituras                                       |
| Límite de compilaciones | Detención hasta la renovación del ciclo                       |

En modo local con Ollama no existe coste externo de inferencia.

## 2. Tareas periódicas

| Tarea                                     | Frecuencia | Responsable    |
| ----------------------------------------- | ---------- | -------------- |
| Revisar el registro de actividad          | Semanal    | ADMIN          |
| Renovar autorizaciones próximas a caducar | Mensual    | ADMIN          |
| Exportar la base de datos                 | Mensual    | Ingeniería     |
| Revisar invitaciones pendientes           | Mensual    | ADMIN          |
| Actualizar dependencias (`npm outdated`)  | Trimestral | Ingeniería     |
| Revisar integraciones sin credenciales    | Trimestral | Negocio + Ing. |

En modo local, la exportación se sustituye por la copia del directorio de datos (`OPENEXPERT_DATA_DIR`).

## 3. Mantenimiento automático

- **Retención de conversaciones:** 30 días, limpieza oportunista al abrir el historial.
- **Refresco de tokens de Drive:** automático.
- **Reversión de cambios:** cada cambio conserva su copia en el registro de actividad.

## 4. Diagnóstico de incidencias

### 4.1. Inicio de sesión

| Síntoma                            | Causa probable                       | Actuación                                                              |
| ---------------------------------- | ------------------------------------ | ---------------------------------------------------------------------- |
| `Error 400: redirect_uri_mismatch` | Falta la URI en el cliente OAuth     | Registrar la URI de Supabase. Ver [08-despliegue](./08-despliegue.md). |
| Acceso denegado sin detalle        | Correo no invitado                   | Crear la invitación o usar la cuenta del administrador                 |
| La sesión retorna a `localhost`    | `site_url` sin actualizar            | Asignar `site_url` al dominio.                                         |
| Aviso de «app no verificada»       | Estado de consentimiento, esperable  | Ninguna. Ver [06-integraciones](./06-integraciones.md).                |
| Permisos inesperados en Google     | Confusión de URI entre login y Drive | El login debe pedir solo `email profile`.                              |

### 4.2. Google Drive

| Síntoma                           | Causa                           | Actuación                            |
| --------------------------------- | ------------------------------- | ------------------------------------ |
| «Drive no está conectado»         | Sin conexión o revocación       | _Integraciones → Fuentes_ → conectar |
| Caduca cada semana                | Consentimiento en Testing       | Pasar a **In production**.           |
| Drive no habilitado en un Experto | Falta `gdrive` en `sources`     | Añadirlo en la edición del Experto.  |
| «Permisos insuficientes»          | La cuenta no alcanza el fichero | Revisar permisos del fichero.        |

### 4.3. Chat

| Síntoma                     | Causa                          | Actuación                                           |
| --------------------------- | ------------------------------ | --------------------------------------------------- |
| Falta la clave del modelo   | Variable vacía o no desplegada | Completarla en `.env` y en Vercel.                  |
| Límite del modelo alcanzado | Cuota gratuita agotada         | Aguardar el reinicio diario.                        |
| Clave no válida             | Clave incorrecta o restringida | Generar una nueva.                                  |
| «Fuera de contexto»         | Experto que no cubre el dato   | Cambiar de Experto. Es el aislamiento, no un fallo. |
| Sin acceso al Experto       | Permisos insuficientes         | Solicitar acceso a un ADMIN.                        |
| Sin permiso de ejecución    | Falta nivel `exec`             | Solicitar el permiso.                               |

### 4.4. Base de datos

| Síntoma                         | Causa                          | Actuación                   |
| ------------------------------- | ------------------------------ | --------------------------- |
| `db:migrate` aborta por hash    | Migración editada tras aplicar | Crear una migración nueva.  |
| Error 500 al listar usuarios    | Nulo en tokens de `auth.users` | Completar con cadena vacía. |
| «Acceso no autorizado» legítimo | Sin fila en `profiles`         | Emitir nueva invitación.    |

### 4.5. Despliegue

| Síntoma                            | Causa                              | Actuación               |
| ---------------------------------- | ---------------------------------- | ----------------------- |
| La preview no deja iniciar sesión  | Subdominio fuera de la allow list  | Añadir el patrón.       |
| Valores `undefined` en pantalla    | `VITE_*` cambiadas sin redesplegar | Redesplegar.            |
| El servidor arranca en otro puerto | 3000 ocupado (`strictPort`)        | Liberar el puerto 3000. |
| Faltan variables en producción     | `.env` no se despliega             | Declararlas en Vercel.  |

## 5. Particularidades del modo local (OpenCore)

| Aspecto            | Cloud                        | Local                                                                        |
| ------------------ | ---------------------------- | ---------------------------------------------------------------------------- |
| Diagnóstico        | Paneles de Vercel / Supabase | `node packages/opencore/bin/opencore.js doctor`                              |
| Copia de seguridad | Volcado PostgreSQL           | Copia de `OPENEXPERT_DATA_DIR`                                               |
| Secretos           | Variables de Vercel          | `credentials.json` (`0600`) + `openexpert.json`                              |
| Modelo             | Gemini vía `GOOGLE_API_KEY`  | Según `OPENEXPERT_MODEL_PROVIDER`; con Ollama verificar disponibilidad local |

## 6. Criterios de escalado

1. **Conectar las integraciones pendientes.** Máximo valor sin coste de hosting.
2. **Afinar los permisos** por Experto.
3. **Nuevas migraciones** para automatizar la ingesta.
4. **Plan de base de datos superior** cuando la cuota resulte insuficiente.
5. **Plan de alojamiento superior** si el tráfico lo justifica.

## Referencias

- [Despliegue](./08-despliegue.md) — primer despliegue.
- [Seguridad y acceso §8](./04-seguridad-y-acceso.md#8-registro-y-reversión) — auditoría y reversión.
