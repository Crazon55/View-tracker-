import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalendarDays } from "lucide-react";

type Preset = "this_week" | "last_week" | "this_month" | "last_month" | "last_7" | "last_30" | "custom" | "all";

function getPresetRange(preset: Preset): { from: string; to: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case "this_week": {
      const day = today.getDay();
      const diff = day === 0 ? 6 : day - 1; // Monday = start
      const monday = new Date(today);
      monday.setDate(today.getDate() - diff);
      return { from: fmt(monday), to: fmt(today) };
    }
    case "last_week": {
      const day = today.getDay();
      const diff = day === 0 ? 6 : day - 1;
      const thisMonday = new Date(today);
      thisMonday.setDate(today.getDate() - diff);
      const lastMonday = new Date(thisMonday);
      lastMonday.setDate(thisMonday.getDate() - 7);
      const lastSunday = new Date(thisMonday);
      lastSunday.setDate(thisMonday.getDate() - 1);
      return { from: fmt(lastMonday), to: fmt(lastSunday) };
    }
    case "this_month": {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: fmt(first), to: fmt(today) };
    }
    case "last_month": {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: fmt(first), to: fmt(last) };
    }
    case "last_7": {
      const d = new Date(today);
      d.setDate(today.getDate() - 6);
      return { from: fmt(d), to: fmt(today) };
    }
    case "last_30": {
      const d = new Date(today);
      d.setDate(today.getDate() - 29);
      return { from: fmt(d), to: fmt(today) };
    }
    case "all":
    default:
      return { from: "", to: "" };
  }
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface DateRangeFilterProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}

export default function DateRangeFilter({ from, to, onChange }: DateRangeFilterProps) {
  const [activePreset, setActivePreset] = useState<Preset>("all");

  function applyPreset(preset: Preset) {
    setActivePreset(preset);
    if (preset === "custom") return;
    const range = getPresetRange(preset);
    onChange(range.from, range.to);
  }

  const presets: { label: string; value: Preset }[] = [
    { label: "All", value: "all" },
    { label: "This Week", value: "this_week" },
    { label: "Last Week", value: "last_week" },
    { label: "This Month", value: "this_month" },
    { label: "Last Month", value: "last_month" },
    { label: "Last 7 Days", value: "last_7" },
    { label: "Last 30 Days", value: "last_30" },
    { label: "Custom", value: "custom" },
  ];

  return (
    <div className="space-y-3">
      {/* Preset pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        <CalendarDays className="w-4 h-4 text-zinc-500 mr-1" />
        {presets.map((p) => (
          <button
            key={p.value}
            onClick={() => applyPreset(p.value)}
            className={`text-[11px] uppercase tracking-wider px-2.5 py-1 rounded-full font-medium transition-all ${
              activePreset === p.value
                ? "bg-violet-600 text-white"
                : "text-zinc-500 bg-zinc-800/80 hover:text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom date inputs */}
      {activePreset === "custom" && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={from}
            onChange={(e) => onChange(e.target.value, to)}
            onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
            className="w-40 bg-zinc-900 border-zinc-700 text-sm cursor-pointer"
          />
          <span className="text-zinc-500 text-sm">to</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => onChange(from, e.target.value)}
            onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
            className="w-40 bg-zinc-900 border-zinc-700 text-sm cursor-pointer"
          />
        </div>
      )}

      {/* Show active range */}
      {from && to && (
        <p className="text-[11px] text-zinc-600">
          Showing: {new Date(from).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} — {new Date(to).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
        </p>
      )}
    </div>
  );
}

export function filterByDateRange<T extends Record<string, any>>(
  items: T[],
  from: string,
  to: string,
  dateField: string = "posted_at"
): T[] {
  if (!from && !to) return items;
  return items.filter((item) => {
    const d = item[dateField];
    if (!d) return false;
    const date = d.slice(0, 10);
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  });
}
