// SPDX-License-Identifier: MIT
import { Check, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { approvalVerdict, type ApprovalPart } from "./approval";

/**
 * The line that replaces the approval card once the user has answered.
 *
 * It repeats the wording of the card («Aprobado. Escribiendo el archivo…») so
 * the approved call does not read as a denial while the tool runs, and says
 * nothing at all when the part carries no decision.
 */
export function ApprovalOutcome({ part }: { part: ApprovalPart }) {
  const { t } = useT();
  const verdict = approvalVerdict(part);
  if (!verdict) return null;

  const notion = part.type.includes("notion");
  const local = !notion && part.type.includes("local");
  const text =
    verdict === "approved"
      ? notion
        ? t("Aprobado. Escribiendo en Notion…")
        : local
          ? t("Aprobado. Escribiendo el archivo…")
          : t("Aprobado. Consultando Google Drive…")
      : notion
        ? t("Escritura en Notion denegada")
        : local
          ? t("Escritura local denegada")
          : t("Acceso a Google Drive denegado");
  const Icon = verdict === "approved" ? Check : X;
  return (
    <div
      className={`flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs ${
        verdict === "approved" ? "text-success" : "text-muted-foreground"
      }`}
    >
      <Icon className="size-3.5" /> {text}
    </div>
  );
}
