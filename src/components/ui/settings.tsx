// SPDX-License-Identifier: MIT
// Shared layout primitives for the settings panel. They used to be copy-pasted
// into every `settings.*` route.
import type { ReactNode } from "react";

export function SettingsCard({
  title,
  desc,
  children,
  danger = false,
  bodyClassName = "mt-5 space-y-4",
}: {
  title: string;
  desc?: string;
  children: ReactNode;
  danger?: boolean;
  bodyClassName?: string;
}) {
  return (
    <section
      className={`rounded-lg border bg-card p-6 ${
        danger ? "border-destructive/40" : "border-border"
      }`}
    >
      <h2 className="font-display text-xl">{title}</h2>
      {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function SettingsField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}
