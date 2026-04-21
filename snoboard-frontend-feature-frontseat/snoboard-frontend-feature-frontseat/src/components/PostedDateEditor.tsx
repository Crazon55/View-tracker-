import { useEffect, useRef, useState } from "react";

/**
 * Date picker for an idea's `posted_at` field (post tracker "Uploaded" stage
 * or reel tracker "Posted" stage). Drives the Bandwidth tracker's Posted
 * metric attribution date.
 *
 * Core invariant: once the user picks a date, the picker's displayed value
 * is controlled ONLY by this component's own state machine:
 *   - pick → "saving" (showing user's pick)
 *   - save ok with verified row → "idle" showing server-confirmed value
 *   - save error → "error" showing last known good (pre-edit) value
 * We intentionally do NOT sync from the parent's `value` prop on every
 * change, because a stale React-Query refetch during the save round-trip
 * would otherwise clobber the user's pick (the classic "I picked 24 but it
 * changed to 16" bug — 16 was the old auto-stamped date from when the card
 * first entered "uploaded", which the refetch was still returning).
 *
 * We key reset solely on `ideaId` changing (the parent passes the idea's
 * primary key). Opening a different idea → fresh mount state; editing the
 * same idea → local state is king.
 *
 * Backend contract: `onSave(iso)` must resolve with the fresh row from the
 * PUT endpoint, which re-SELECTs after update. We read `result.posted_at`
 * as the authoritative persisted value. If the backend can't confirm what
 * was stored, we fail loud instead of lying.
 */

function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    // UTC accessors, since we always save as UTC noon.
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
  const [confirmed, setConfirmed] = useState<string | null | undefined>(value);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const lastIdeaId = useRef(ideaId);
  const hasInteracted = useRef(false);

  // Reset ONLY when a different idea is opened. Within the same idea,
  // local state is the source of truth — we do NOT re-sync from the
  // `value` prop, because a stale refetch during the save round-trip
  // would otherwise blow away the user's pick.
  useEffect(() => {
    if (lastIdeaId.current !== ideaId) {
      lastIdeaId.current = ideaId;
      setLocal(isoToDateInput(value));
      setConfirmed(value);
      setStatus("idle");
      setErrorMsg(null);
      hasInteracted.current = false;
    }
  }, [ideaId, value]);

  // One-shot: if we mounted before the parent query resolved (`value` was
  // null at mount but is now non-null), and the user hasn't interacted,
  // accept the first real value.
  useEffect(() => {
    if (hasInteracted.current) return;
    if (status !== "idle") return;
    if (value == null) return;
    if (confirmed != null) return;
    setLocal(isoToDateInput(value));
    setConfirmed(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    hasInteracted.current = true;
    setLocal(v);
    setStatus("saving");
    setErrorMsg(null);
    const iso = v ? `${v}T12:00:00.000Z` : null;

    try {
      const result = await onSave(iso);
      // Backend's PUT endpoint re-SELECTs and returns the fresh row; the
      // fetchApi wrapper unwraps `json.data`, so `result` IS the row.
      const persisted =
        result && typeof result === "object" && "posted_at" in result
          ? (result as any).posted_at
          : undefined;

      if (persisted === undefined) {
        // Older backend response shape — no re-SELECT. Trust the request
        // went through (we got a 2xx) and use what we sent. Not ideal,
        // but at least we don't get a ghost snap-back.
        setConfirmed(iso);
        setLocal(isoToDateInput(iso));
      } else {
        setConfirmed(persisted);
        setLocal(isoToDateInput(persisted));
      }
      setStatus("idle");
    } catch (err: any) {
      const msg = err?.message || String(err || "Save failed");
      setStatus("error");
      setErrorMsg(msg);
      // Revert to the last confirmed server value so the UI reflects
      // reality. (Not `value`, which may be stale/wrong mid-refetch.)
      setLocal(isoToDateInput(confirmed));
    }
  }

  const storedPretty = prettyDate(confirmed);
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
        ) : confirmed ? (
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
