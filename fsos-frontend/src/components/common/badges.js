import React from "react";
import { STREAM_META, IDEA_STATES, VSTATUS_BADGE, VSTATUS, PERF_TIER } from "../../domain/constants";
import { cn } from "../../lib/utils";

export function StreamBadge({ stream, className }) {
  const m = STREAM_META[stream];
  if (!m) return null;
  return (
    <span data-testid={`stream-badge-${stream}`} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold", m.badge, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
      {m.short}
    </span>
  );
}

export function StatusBadge({ state, className }) {
  const m = IDEA_STATES[state] || IDEA_STATES.draft;
  return <span data-testid={`status-badge-${state}`} className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium", m.badge, className)}>{m.label}</span>;
}

export function VersionBadge({ status, className }) {
  return <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium", VSTATUS_BADGE[status], className)}>{VSTATUS[status]}</span>;
}

export function IPBadge({ ip, className, showName }) {
  if (!ip) return null;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md border border-stone-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-stone-700", className)}>
      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: ip.hex }} />
      <span className="font-mono">{ip.code}</span>
      {showName && <span className="text-stone-500">{ip.name}</span>}
    </span>
  );
}

export function FormatBadge({ format, className }) {
  return <span className={cn("inline-flex items-center rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-600", className)}>{format}</span>;
}

export function PerfBadge({ tier, className }) {
  const label = { good: "Good", average: "Average", bad: "Bad", unrated: "Unrated" }[tier] || "Unrated";
  return <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold", PERF_TIER[tier], className)}>{label}</span>;
}

export function Avatar({ user, size = 28, className }) {
  if (!user) return null;
  return (
    <span title={user.name} className={cn("inline-flex items-center justify-center rounded-full text-[11px] font-semibold text-white shrink-0", className)} style={{ width: size, height: size, background: user.color }}>
      {user.initials}
    </span>
  );
}
