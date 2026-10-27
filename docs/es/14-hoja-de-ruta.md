# 14 · Hoja de ruta

Estado de los elementos implementados y pendientes.

## Implementado

| Elemento                                                             | Documento                                   |
| -------------------------------------------------------------------- | ------------------------------------------- |
| Edición local, propietario único (sin nube)                          | [Arquitectura](./02-arquitectura.md)        |
| Persistencia SQLite con esquema Drizzle                              | [Modelo de datos](./03-modelo-de-datos.md)  |
| Chat con herramientas, aislamiento por Experto, razonamiento visible | [IA](./05-inteligencia-artificial.md)       |
| Tarjetas de confirmación para acciones propuestas                    | [IA](./05-inteligencia-artificial.md)       |
| Integración con Google Drive (opcional)                              | [Integraciones](./06-integraciones.md)      |
| Carpetas locales (opcional, lectura + escritura con aprobación)      | [Integraciones](./06-integraciones.md)      |
| Notion (opcional, OAuth 2.0, lectura + escritura con aprobación)     | [Integraciones](./06-integraciones.md)      |
| Registro de actividad y reversión                                    | [Seguridad](./04-seguridad-y-acceso.md)     |
| Filtro previo anti-inyección                                         | [Seguridad](./04-seguridad-y-acceso.md)     |
| Proveedores de modelo: Ollama, Gemini, BYOK                          | [Proveedores de IA](./13-proveedores-ia.md) |
| Motor y CLI (asistente, doctor, fix, models, serve, update)          | [Motor y CLI](./11-motor-y-cli.md)          |
| Imagen Docker y scaffold `create-openexpert`                         | [Inicio rápido](./00-inicio-rapido.md)      |
| Licencia MIT para todo el repositorio                                | [Modelo de licencia](./12-licencia.md)      |
| Documentación bilingüe (inglés / español)                            | [Documentación](../README.md)               |
| CI, escaneo de secretos, CodeQL, Scorecard                           | [Contribuir](../../CONTRIBUTING.md)         |

## Pendiente

- [ ] **Conectores restantes** (Meta Ads, Gmail, Slack, Google Analytics,
      Salesforce). Pipedrive (ventas), Holded (facturas) y la importación CSV ya
      están disponibles como fuentes opcionales de solo lectura.
- [ ] **Procesos autónomos (eliminados, por reconstruir).** El catálogo anterior
      era andamiaje: "ejecutar" un proceso solo subía un contador, el disparador
      era descriptivo (sin planificador) y las etapas nunca se ejecutaban. Se ha
      eliminado hasta poder construirlo de verdad: ejecución real de etapas, un
      planificador y, cuando haga falta, doble firma.
- [ ] **Instaladores firmados de Windows y macOS.** La CI genera `.msi`/`.dmg`
      sin firmar; la firma necesita certificados.
- [ ] **Copias programadas.** La descarga cifrada con contraseña es manual hoy.
