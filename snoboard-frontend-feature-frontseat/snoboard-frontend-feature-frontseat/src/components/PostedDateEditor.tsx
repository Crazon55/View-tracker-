import { useEffect, useRef, useState } from "react";

/**
 * Date picker for an idea's `posted_at` field (post tracker "Uploaded" stage
 * or reel tracker "Posted" stage). Drives the Bandwidth tracker's Posted
 * metric attribution date.
 *
 * Design notes (hard-won):
 *  - The picker is keyed on `ideaId`: local state resets ONLY when a
 *    different idea is opened, NOT on every `value` prop flicker. This
 *    prevents the snap-back race where a React-Query refetch during the
 *    save round-trip would blow away the user's pick.
 *  - `onSave` is expected to return the fresh server row (from the PUT
 *    endpoint which now re-SELECTs after update). We trust that return
 *    value as the authoritative persisted date and sync local to it.
 *  - Save errors (missing column, RLS, etc.) surface as a visible banner +
 *    revert local to the pre-edit server value.
 *  - Dates are stored as UTC noon (`YYYY-MM-DDT12:00:00.000Z`) so they round
 *    trip identically regardless of the viewer's timezone.
 */

function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    // Use UTC date components, since we always save as UTC noon.
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  } catch {
    return "";
  }
}

function prettyDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return "";
  }
}

export default function PostedDateEditor({
  ideaId,
  label,
  value,
  onSave,
}: {
  ideaId: string;
  label: string;
  value: string | null | undefined;
  onSave: (iso: string | null) => Promise<any>;
}) {
  const [local, setLocal] = useState<string>(isoToDateInput(value));
  const [serverValue, setServerValue] = useState<string | null | undefined>(value);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const lastIdeaId = useRef(ideaId);

  // Reset ONLY when a different idea is opened. Do NOT reset on every
  // `value` change — the parent's refetch during our save would otherwise
  // blow away the user's pick.
  useEffect(() => {
    if (lastIdeaId.current !== ideaId) {
      lastIdeaId.current = ideaId;
      setLocal(isoToDateInput(value));
      setServerValue(value);
      setStatus("idle");
      setErrorMsg(null);
    }
  }, [ideaId, value]);

  // If the parent's value prop changes to something we haven't seen (and
  // we're not currently saving), accept it. This keeps us in sync if the
  // date changes via a different code path (e.g. auto-stamp on stage move).
  useEffect(() => {
    if (status === "saving") return;
    if (value !== serverValue) {
      setServerValue(value);
      setLocal(isoToDateInput(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setLocal(v);
    setStatus("saving");
    setErrorMsg(null);
    const iso = v ? `${v}T12:00:00.000Z` : null;

    try {
      const result = await onSave(iso);
      // Backend now returns { data: { posted_at, ... } } via fetchApi's
      // `json.data ?? json` unwrap, so `result` should be the fresh row.
      const persisted = result?.posted_at ?? iso;
      setServerValue(persisted);
      setLocal(isoToDateInput(persisted));
      setStatus("idle");
    } catch (err: any) {
      const msg = err?.message || String(err || "Save failed");
      setStatus("error");
      setErrorMsg(msg);
      // Revert to the last known server value so the UI doesn't lie.
      setLocal(isoToDateInput(serverValue));
    }
  }

  const storedPretty = prettyDate(serverValue);
  const isSaving = status === "saving";
  const isError = status === "error";

  return (
    <div
      style={{
        padding: "10px 12px",
        background: isError ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.06)",
        borderRadius: 8,
        border: `1.5px solid ${isError ? "rgba(239,68,68,0.4)" : "rgba(34,197,94,0.25)"}`,
      }}
    >
      <label
        style={{
          display: "block",
          fontSize: 11,
          fontWeight: 600,
          color: "#71717a",
          marginBottom: 6,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <input
          type="date"
          value={local}
          onChange={handleChange}
          disabled={isSaving}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1.5px solid #3f3f46",
            fontSize: 13,
            background: "#09090b",
            color: "#e4e4e7",
            opacity: isSaving ? 0.6 : 1,
          }}
        />
        {isSaving ? (
          <span style={{ fontSize: 11, color: "#F0C060" }}>Saving…</span>
        ) : serverValue ? (
          <span style={{ fontSize: 11, color: "#52525b" }}>
            Stored as <strong style={{ color: "#a1a1aa" }}>{storedPretty}</strong>
            &nbsp;&middot; counts toward Bandwidth on this date
          </span>
        ) : (
          <span style={{ fontSize: 11, color: "#a1a1aa" }}>
            Not set &mdash; Bandwidth falls back to earliest page posting date
          </span>
        )}
      </div>
      {isError && errorMsg && (
        <p style={{ marginTop: 8, fontSize: 11, color: "#FF7070", lineHeight: 1.45 }}>
          <strong>Couldn't save:</strong> {errorMsg}
        </p>
      )}
    </div>
  );
}
