# 12 · Modelo de licencia

> **Audiencia:** ambos. Qué es abierto, qué se monetiza y qué
> obligaciones asumen contribuidores y usuarios.

---

## 1. Licencia

Todo el repositorio de OpenExpert se distribuye bajo la **Licencia MIT**.
El texto completo está en [`LICENSE`](../../LICENSE) en la raíz del
repositorio.

Esto incluye:

- El código de la aplicación cloud (`src/`, `drizzle/migrations/`,
  `supabase/`, la configuración de la aplicación).
- El paquete OpenCore MIT (`packages/opencore/`).
- La configuración de la imagen Docker (`docker/`).
- La documentación (`docs/`, `README.md`, `README.es.md`).

## 2. Qué se monetiza

La licencia MIT concede a cualquiera la libertad de usar, copiar,
modificar y distribuir el software. OpenExpert no monetiza el código;
monetiza **servicios** que se ejecutan sobre él:

1. **Edición cloud alojada.** Despliegue gestionado multi-usuario con
   roles, invitaciones, auditoría centralizada y copias gestionadas.
   El usuario paga por el alojamiento y las garantías operativas, no
   por el código.
2. **Pasarela de modelos OpenExpert.** Una pasarela de IA gestionada (el
   proveedor `openexpert`). El usuario obtiene una experiencia curada,
   cuotas y soporte; el cliente en sí es MIT y puede apuntar también a
   cualquier endpoint OpenAI-compatible.

Este patrón — cliente open source más servicio monetizado — es el mismo
que siguen proyectos como OpenCode + Go/Zen.

## 3. Obligaciones

MIT es permisiva. El único requisito es mantener el aviso de copyright
y el aviso de permiso en las copias del software. No hay copyleft: se
puede modificar el código y distribuir un derivado cerrado.

Obligaciones prácticas:

- Conservar el fichero `LICENSE` y los avisos de copyright en cualquier
  distribución.
- Los componentes de terceros (React, Tailwind, Radix, AI SDK, …)
  mantienen sus propias licencias. Ver
  [`NOTICE`](../../NOTICE).
- No usar la marca OpenExpert de forma que induzca a error sobre el
  respaldo del proyecto.

## 4. Contribuir

Al enviar una contribución aceptas el Developer Certificate of Origin
1.1 (ver [`CONTRIBUTING.md`](../../CONTRIBUTING.md)) y tu contribución
se publica bajo la licencia MIT.

## 5. Reportes de seguridad

Las vulnerabilidades se reportan de forma privada. Ver
[`SECURITY.md`](../../SECURITY.md).

## 6. Marcas

"OpenExpert" y "OpenCore" son nombres del proyecto. La licencia MIT no
concede derechos para usarlos como nombres de producto ni para sugerir
respaldo. Contacta con los maintainers si quieres utilizarlos.
