import React from "react";
import * as Icons from "lucide-react";
import { useTheme } from "next-themes";

/** Light/dark switch. Shows what you'd switch *to*, the way most apps do. */
export default function ThemeToggle({ className = "" }) {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const label = dark ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button
      type="button"
      data-testid="theme-toggle"
      onClick={() => setTheme(dark ? "light" : "dark")}
      title={label}
      aria-label={label}
      className={`relative rounded-md p-2 text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition-colors ${className}`}
    >
      {dark ? <Icons.Sun className="h-4 w-4" /> : <Icons.Moon className="h-4 w-4" />}
    </button>
  );
}
