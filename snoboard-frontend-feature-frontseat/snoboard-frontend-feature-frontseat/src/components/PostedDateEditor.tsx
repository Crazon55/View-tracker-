import { useEffect, useRef, useState } from "react";

/**
 * Date picker for an idea's `posted_at` field (post tracker "Uploaded" stage
 * or reel tracker "Posted" stage). Drives the Bandwidth tracker's Posted
 * metric attribution date.
 *
 * - Controlled local state so the picker always reflects what the user just
 *   picked, even while the server round-trip is in flight.
 * - Saves as noon UTC on the selected date (UTC noon never crosses a date
 *   boundary in any timezone, so round-trip is timezone-safe).
 * - Shows an alert if the save errors (typically: migration not run).
 *
 * `label` is what shows above the picker ("Uploaded date" / "Posted date").
 */

function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    // Use the UTC date, since we always save as UTC noon.
    return d.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function prettyDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

export default function PostedDateEditor({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string | null | undefined;
  onSave: (iso: string | null) => Promise<unknown> | void;
}) {
  const [local, setLocal] = useState<string>(isoToDateInput(value));
  const [error, setError] = useState<string | null>(null);
  const dirty = useRef(false);

  // When the server value changes (after mutation completes), sync local
  // back to it — unless the user is mid-edit.
  useEffect(() => {
    if (!dirty.current) setLocal(isoToDateInput(value));
  }, [value]);

  const storedPretty = prettyDate(value);
  const localPretty = prettyDate(local ? `${local}T12:00:00.000Z` : null);
  const divergent = !!(local && storedPretty && localPretty && storedPretty !== localPretty);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    dirty.current = true;
    setLocal(v);
    setError(null);
    const iso = v ? `${v}T12:00:00.000Z` : null;
    try {
      await onSave(iso);
      dirty.current = false;
    } catch (err: any) {
      dirty.current = false;
      const msg = err?.message || String(err || "Save failed");
      setError(msg);
      alert(`Could not save ${label.toLowerCase()}:\n\n${msg}`);
    }
  }

  return (
    <div style={{ padding: "10px 12px", background: "rgba(34,197,94,0.06)", borderRadius: 8, border: "1.5px solid rgba(34,197,94,0.25)" }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#71717a", marginBottom: 6, letterSpacing: "0.04em", textTransform: "uppercase" }}>
        {label}
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <input
          type="date"
          value={local}
          onChange={handleChange}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1.5px solid #3f3f46", fontSize: 13, background: "#09090b", color: "#e4e4e7" }}
        />
        {value ? (
          <span style={{ fontSize: 11, color: divergent ? "#F0C060" : "#52525b" }}>
            {divergent ? "Pending save…" : <>Stored as <strong style={{ color: "#a1a1aa" }}>{storedPretty}</strong> &middot; counts toward Bandwidth on this date</>}
          </span>
        ) : (
          <span style={{ fontSize: 11, color: "#a1a1aa" }}>
            Not set &mdash; Bandwidth falls back to earliest page posting date
          </span>
        )}
      </div>
      {error && (
        <p style={{ marginTop: 8, fontSize: 11, color: "#FF7070" }}>
          {error}
        </p>
      )}
    </div>
  );
}
