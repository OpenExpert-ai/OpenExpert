# 002 · Propietario único, sin autenticación

- **Estado:** aceptado.
- **Fecha:** 2025-10 (reescritura local-first).

## Contexto

Las versiones anteriores eran una app cloud multiusuario con Supabase, roles y
seguridad a nivel de fila. La edición local apunta a una sola persona en su
equipo.

## Decisión

Eliminar la autenticación, `profiles`, `user_roles`, `expert_access` e
`invitations`. El espacio de trabajo tiene un propietario único implícito
("Propietario local"). La autorización no es un camino de código; el aislamiento
entre Expertos es el único control de acceso (ver ADR 004).

## Consecuencias

- Superficie mucho menor: sin sesiones, sin RLS, sin gestión de usuarios.
- El servidor es de confianza. Escucha en todas las interfaces por defecto, así
  que exponer el puerto más allá de `localhost` es responsabilidad explícita de
  quien opera (`docs/es/04-seguridad-y-acceso.md`).
- Volver a multiusuario sería otro ADR y una reescritura incompatible.
