// SPDX-License-Identifier: MIT
// The notices that the configuration file had to give up to be used.
//
// The server sends the **data** of a notice (which field, which value, which
// limit) and not a sentence: the interface is bilingual, and a sentence
// written on the server would stay in Spanish with the interface in English.
// The wording lives here, next to the panel that shows it, and the client
// translates it with the same `t()` the rest of the interface uses.

import type { ConfigNotice } from "@openexpert/openexpert/config";

export type { ConfigNotice };

/** What one notice says, in the language of the interface. */
export function noticeText(
  notice: ConfigNotice,
  t: (text: string, params?: Record<string, string | number>) => string,
): string {
  if (notice.kind === "patterns") {
    return t("{field}: {dropped} patrones descartados (el máximo son {limit})", {
      field: "chat.injectionExtraPatterns",
      dropped: notice.dropped,
      limit: notice.limit,
    });
  }
  const unit = t("{n} {unit}", {
    n: notice.limit,
    unit:
      notice.field === "chat.maxSteps"
        ? t("pasos por consulta")
        : notice.field === "chat.retentionDays"
          ? t("días")
          : t("tokens"),
  });
  return t("{field}: {value} traídos a {limit}", {
    field: notice.field,
    value: notice.value,
    limit: unit,
  });
}
