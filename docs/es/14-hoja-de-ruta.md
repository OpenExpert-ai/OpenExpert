# 14 · Hoja de ruta

Estado de los elementos implementados y pendientes.

## Implementado

| Elemento                                                                  | Documento                                   |
| ------------------------------------------------------------------------- | ------------------------------------------- |
| Edición local, propietario único (sin nube)                               | [Arquitectura](./02-arquitectura.md)        |
| Persistencia SQLite con esquema Drizzle                                   | [Modelo de datos](./03-modelo-de-datos.md)  |
| Chat con herramientas, aislamiento por Experto, razonamiento visible      | [IA](./05-inteligencia-artificial.md)       |
| Tarjetas de confirmación para acciones propuestas                         | [IA](./05-inteligencia-artificial.md)       |
| Integración con Google Drive (opcional)                                   | [Integraciones](./06-integraciones.md)      |
| Carpetas locales (opcional, lectura + escritura con aprobación)           | [Integraciones](./06-integraciones.md)      |
| Notion (opcional, OAuth 2.0, lectura + escritura con aprobación)          | [Integraciones](./06-integraciones.md)      |
| Registro de actividad y reversión                                         | [Seguridad](./04-seguridad-y-acceso.md)     |
| Filtro previo anti-inyección                                              | [Seguridad](./04-seguridad-y-acceso.md)     |
| Proveedores de modelo: Ollama, Gemini, BYOK                               | [Proveedores de IA](./13-proveedores-ia.md) |
| Motor y CLI (asistente, doctor, fix, models, serve, update, jobs)         | [Motor y CLI](./11-motor-y-cli.md)          |
| Informe y copia cifrada programados sin ventana (temporizador de systemd) | [Operación](./09-operacion-y-soporte.md)    |
| Imagen Docker y scaffold `create-openexpert`                              | [Inicio rápido](./00-inicio-rapido.md)      |
| Licencia MIT para todo el repositorio                                     | [Modelo de licencia](./12-licencia.md)      |
| Documentación bilingüe (inglés / español)                                 | [Documentación](../README.md)               |
| CI, escaneo de secretos, CodeQL, Scorecard                                | [Contribuir](../../CONTRIBUTING.md)         |

## Pendiente

- [ ] **Conectores restantes** (Meta Ads, Gmail, Slack, Google Analytics,
      Salesforce). Pipedrive (ventas), Holded (facturas) y la importación CSV ya
      están disponibles como fuentes opcionales de solo lectura.
- [ ] **Otros procesos autónomos.** El informe diario de facturas vencidas y la
      copia diaria cifrada pueden ejecutarse sin ventana con `openexpert jobs`.
      Quedan pendientes los procesos de varias etapas y los que necesitan
      aprobación sin nadie delante.
- [ ] **Instaladores firmados de Windows y macOS.** La CI genera `.msi`/`.dmg`
      sin firmar; la firma necesita certificados.
