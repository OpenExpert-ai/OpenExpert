// SPDX-License-Identifier: MIT
// Shared loading indicator. Prefer this over ad-hoc Loader2 usage so the
// spinner stays consistent and announces itself to assistive tech.
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

export function Spinner({
  className,
  label = "Cargando…",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <Loader2 className={cn("size-4 animate-spin", className)} role="status" aria-label={label} />
  );
}
