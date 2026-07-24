import { useState } from "react";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/seeding/StatusBadge";
import { api } from "@/services/seeding/client";

// Matches the backend monetisable_pages model: page_id, page_name, active, notes.
export type MonetisablePage = {
  page_id: string;
  page_name: string;
  active?: boolean;
  notes?: string;
};

function seedingErrMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { status?: number; data?: { detail?: unknown } }; message?: string };
  const status = e?.response?.status;
  const detail = e?.response?.data?.detail;
  let text = "";
  if (typeof detail === "string") text = detail;
  else if (Array.isArray(detail)) {
    text = detail
      .map((d) => (typeof d === "string" ? d : (d as { msg?: string })?.msg || ""))
      .filter(Boolean)
      .join("; ");
  }
  if (status === 403) {
    return text || "Admin access required. Exit role preview if you're previewing as BD.";
  }
  if (status === 503) return text || "Seeding database unavailable.";
  if (text) return text;
  if (e?.message && !e.message.startsWith("Request failed")) return e.message;
  return fallback;
}

const inputCls = "fglass-input w-full rounded-lg px-2.5 py-1.5 text-sm";
const ghostBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500, padding: "6px 11px", borderRadius: 8, border: "1px solid var(--f-line)", background: "transparent", color: "var(--f-dim)", cursor: "pointer" };
const solidBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, padding: "7px 13px", borderRadius: 8, border: "none", background: "#fff", color: "#000", cursor: "pointer" };
const fieldLabel: React.CSSProperties = { fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--f-faint)", marginBottom: 5 };

function PageForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: MonetisablePage;
  onSave: (v: { page_name: string; notes: string; active: boolean }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.page_name ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [active, setActive] = useState(initial?.active !== false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) { toast.error("Page name is required."); return; }
    setBusy(true);
    try {
      await onSave({ page_name: name.trim(), notes: notes.trim(), active });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div>
        <div style={fieldLabel}>Page name / handle</div>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 101x Founders" className={inputCls} />
      </div>
      <div>
        <div style={fieldLabel}>Notes</div>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" className={inputCls} />
      </div>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--f-dim)", cursor: "pointer" }}>
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Active (deal-eligible)
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" disabled={busy} onClick={submit} style={solidBtn}><Check size={13} strokeWidth={2} /> Save</button>
        <button type="button" disabled={busy} onClick={onCancel} style={{ ...ghostBtn, border: "none" }}><X size={13} strokeWidth={1.5} /> Cancel</button>
      </div>
    </div>
  );
}

export function PageCardList({
  rows,
  empty,
  canManage = false,
  onChanged,
}: {
  rows: MonetisablePage[];
  empty: string;
  canManage?: boolean;
  onChanged?: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const create = async (v: { page_name: string; notes: string; active: boolean }) => {
    try {
      await api.post("/pages", v);
      toast.success("Page added.");
      setAdding(false);
      onChanged?.();
    } catch (err: unknown) {
      toast.error(seedingErrMessage(err, "Couldn't add page."));
    }
  };

  const update = async (id: string, v: { page_name: string; notes: string; active: boolean }) => {
    try {
      await api.put(`/pages/${id}`, v);
      toast.success("Page updated.");
      setEditingId(null);
      onChanged?.();
    } catch (err: unknown) {
      toast.error(seedingErrMessage(err, "Couldn't update page."));
    }
  };

  const remove = async (p: MonetisablePage) => {
    if (!window.confirm(`Delete "${p.page_name}"? This can't be undone.`)) return;
    try {
      await api.delete(`/pages/${p.page_id}`);
      toast.success("Page deleted.");
      onChanged?.();
    } catch (err: unknown) {
      toast.error(seedingErrMessage(err, "Couldn't delete page."));
    }
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {canManage && (
        adding ? (
          <div className="seeding-card" style={{ borderRadius: 14, padding: "16px 18px" }}>
            <PageForm onSave={create} onCancel={() => setAdding(false)} />
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)} style={{ ...ghostBtn, alignSelf: "start", padding: "9px 14px" }}>
            <Plus size={14} strokeWidth={1.75} /> Add page
          </button>
        )
      )}

      {!rows.length ? (
        <p style={{ fontSize: 13, color: "var(--f-faint)", padding: "8px 0" }}>{empty}</p>
      ) : (
        rows.map((p) => (
          <div key={p.page_id} className="seeding-card" style={{ borderRadius: 14, padding: "14px 16px" }}>
            {editingId === p.page_id ? (
              <PageForm initial={p} onSave={(v) => update(p.page_id, v)} onCancel={() => setEditingId(null)} />
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{p.page_name || "Untitled page"}</div>
                  {p.notes ? (
                    <div style={{ fontSize: 12, color: "var(--f-faint)", marginTop: 4 }}>{p.notes}</div>
                  ) : null}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <StatusBadge status={p.active === false ? "Inactive" : "Active"} />
                  {canManage && (
                    <div style={{ display: "flex", gap: 4 }}>
                      <button type="button" title="Edit" onClick={() => setEditingId(p.page_id)} style={{ padding: 6, borderRadius: 7, border: "1px solid var(--f-line)", background: "transparent", color: "var(--f-dim)", cursor: "pointer", display: "inline-flex" }}>
                        <Pencil size={13} strokeWidth={1.5} />
                      </button>
                      <button type="button" title="Delete" onClick={() => remove(p)} style={{ padding: 6, borderRadius: 7, border: "1px solid var(--f-line)", background: "transparent", color: "var(--f-dim)", cursor: "pointer", display: "inline-flex" }}>
                        <Trash2 size={13} strokeWidth={1.5} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
