import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { SeedingSelect } from "@/components/seeding/SeedingSelect";
import { DELIVERABLE_TYPES } from "@/services/seeding/constants";
import {
  BRIEF_PACKAGES,
  formatPackagePrice,
  resolvePackagePages,
  type BriefPackage,
} from "@/services/seeding/packages";

export type DeliverableRow = {
  key: string;
  page_id: string;
  deliverable_type: string;
  quantity: number;
};

type SeedingPage = { page_id: string; page_name: string; active?: boolean };

const inputCls = "seeding-submit-input";

export function newDeliverableRow(pageId = ""): DeliverableRow {
  return {
    key: `row_${Math.random().toString(36).slice(2, 9)}`,
    page_id: pageId,
    deliverable_type: "Reel",
    quantity: 1,
  };
}

type Props = {
  pages: SeedingPage[];
  rows: DeliverableRow[];
  onRowsChange: (rows: DeliverableRow[]) => void;
  /** Prefill price when a package is selected (parent still owns the field). */
  onPackagePrice?: (priceInr: number) => void;
};

export function BriefPagesDeliverables({ pages, rows, onRowsChange, onPackagePrice }: Props) {
  const [packageId, setPackageId] = useState<string | null>(null);
  const [missingNote, setMissingNote] = useState("");

  const eligiblePages = useMemo(() => pages.filter((p) => p.active !== false), [pages]);

  const applyPackage = (pkg: BriefPackage) => {
    const { matched, missing } = resolvePackagePages(pkg, eligiblePages);
    if (!matched.length) {
      setMissingNote(
        missing.length
          ? `None of this package’s pages are available yet (${missing.join(", ")}).`
          : "No pages available for this package.",
      );
      return;
    }
    setPackageId(pkg.id);
    setMissingNote(
      missing.length
        ? `Added ${matched.length} pages. Not in catalogue: ${missing.join(", ")}.`
        : "",
    );
    onRowsChange(matched.map((p) => newDeliverableRow(p.page_id)));
    onPackagePrice?.(pkg.priceInr);
  };

  const clearPackage = () => {
    setPackageId(null);
    setMissingNote("");
  };

  const updateRow = (key: string, patch: Partial<DeliverableRow>) => {
    onRowsChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const removeRow = (key: string) => {
    if (rows.length <= 1) return;
    onRowsChange(rows.filter((r) => r.key !== key));
  };

  return (
    <div className="seeding-submit-field seeding-submit-field--full">
      <span>Package (optional)</span>
      <div className="seeding-package-grid" role="list">
        {BRIEF_PACKAGES.map((pkg) => {
          const on = packageId === pkg.id;
          return (
            <button
              key={pkg.id}
              type="button"
              role="listitem"
              className={`seeding-package-card${on ? " is-on" : ""}`}
              onClick={() => applyPackage(pkg)}
            >
              <div className="seeding-package-card-name">{pkg.name}</div>
              <div className="seeding-package-card-price">{formatPackagePrice(pkg.priceInr)}</div>
              <div className="seeding-package-card-meta">{pkg.pages.length} pages</div>
            </button>
          );
        })}
        <button
          type="button"
          className={`seeding-package-card seeding-package-card--custom${!packageId ? " is-on" : ""}`}
          onClick={() => {
            clearPackage();
            if (!rows.length) onRowsChange([newDeliverableRow(eligiblePages[0]?.page_id || "")]);
          }}
        >
          <div className="seeding-package-card-name">Custom</div>
          <div className="seeding-package-card-meta">Pick pages yourself</div>
        </button>
      </div>
      <p className="seeding-submit-hint" style={{ marginTop: 8 }}>
        Packages fill the list below — add or remove pages to customise. Price is prefilled and editable.
      </p>
      {missingNote ? (
        <p className="seeding-submit-hint" style={{ marginTop: 4, color: "var(--f-dim)" }}>
          {missingNote}
        </p>
      ) : null}

      <span style={{ marginTop: 14, display: "block" }}>Pages &amp; deliverables *</span>
      <div className="seeding-deliverable-rows">
        {rows.map((row) => (
          <div key={row.key} className="seeding-deliverable-row">
            <SeedingSelect
              value={row.page_id}
              onChange={(v) => updateRow(row.key, { page_id: v })}
              options={eligiblePages.map((p) => ({ value: p.page_id, label: p.page_name }))}
            />
            <SeedingSelect
              value={row.deliverable_type}
              onChange={(v) => updateRow(row.key, { deliverable_type: v })}
              options={DELIVERABLE_TYPES.map((t) => ({ value: t, label: t }))}
              className="seeding-select-trigger--compact"
            />
            <input
              type="number"
              min={1}
              className={`${inputCls} seeding-qty-input`}
              value={row.quantity}
              onChange={(e) => updateRow(row.key, { quantity: Math.max(1, Number(e.target.value) || 1) })}
            />
            <button
              type="button"
              className="seeding-detail-icon-btn"
              onClick={() => removeRow(row.key)}
              aria-label="Remove row"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="seeding-submit-add-row"
        onClick={() => onRowsChange([...rows, newDeliverableRow(eligiblePages[0]?.page_id || "")])}
      >
        + Add another page/deliverable
      </button>
    </div>
  );
}
