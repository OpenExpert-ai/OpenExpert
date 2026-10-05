// SPDX-License-Identifier: MIT
// Empty-state primitive: an icon, a title, a short explanation and an action.
// Keeps empty screens purposeful instead of a lone line of grey text.
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function Empty({
  icon: Icon,
  title,
  description,
  children,
  className = "",
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center px-6 py-16 text-center ${className}`}
    >
      {Icon && (
        <div className="mb-4 flex size-11 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
          <Icon className="size-5" />
        </div>
      )}
      <div className="font-display text-lg text-foreground">{title}</div>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {children && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{children}</div>
      )}
    </div>
  );
}
