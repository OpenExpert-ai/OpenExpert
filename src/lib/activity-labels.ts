// SPDX-License-Identifier: MIT
// Etiquetas del registro de actividad.
//
// El `type` y el `status` de un evento son **datos**, no textos de la interfaz:
// la base guarda el mismo valor en las dos lenguas y lo que cambia con el idioma
// es lo que se pinta. El tipo ya se escribe en español («Consulta», «Drive ·
// creación»), así que pasa por `t()` tal cual y su traducción está en el
// diccionario. El estado no: se guarda con el identificador en inglés («ok»,
// «pending», «reverted»…) y por eso necesita una etiqueta antes de llegar a
// `t()`. Traducir el identificador a pelo acertaba en inglés por casualidad
// —«ok» → «done»— y dejaba «pending» en una página española.
//
// Las etiquetas son claves del diccionario: `src/locales/activity-i18n.test.ts`
// exige que todas tengan su entrada en inglés.

export const ACTIVITY_STATUS_LABELS: Record<string, string> = {
  ok: "Hecho",
  pending: "Pendiente",
  reverted: "Revertido",
  denied: "Denegado",
  failed: "Fallido",
  cancelled: "Cancelado",
};

/** La etiqueta de un estado del registro; uno que no esté en el mapa se pinta tal cual. */
export function activityStatusLabel(status: string): string {
  return ACTIVITY_STATUS_LABELS[status] ?? status;
}
