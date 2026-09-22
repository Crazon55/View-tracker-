import React from "react";

export function PageHeader({ title, subtitle, children, icon: Icon }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div className="flex items-start gap-3">
        {Icon && <div className="mt-0.5 h-9 w-9 rounded-lg bg-stone-900 text-white grid place-items-center"><Icon className="h-4.5 w-4.5" /></div>}
        <div>
          <h1 className="font-serif text-2xl lg:text-3xl text-stone-900 leading-tight">{title}</h1>
          {subtitle && <p className="text-sm text-stone-500 mt-0.5 max-w-2xl">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

export function StatCard({ label, value, sub, tone = "default", testid }) {
  const tones = {
    default: "border-[#E6E1D8]",
    good: "border-emerald-200 bg-emerald-50/40",
    warn: "border-amber-200 bg-amber-50/40",
    bad: "border-rose-200 bg-rose-50/40",
  };
  return (
    <div data-testid={testid} className={`rounded-lg border bg-white p-4 ${tones[tone]}`}>
      <div className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 font-mono">{label}</div>
      <div className="mt-1 font-serif text-3xl text-stone-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-stone-500">{sub}</div>}
    </div>
  );
}
