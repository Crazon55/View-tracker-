type Opt = { value: string; label: string };

export function FilterPills({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: Opt[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="seeding-filter-row">
      {label ? <span className="seeding-filter-label">{label}</span> : null}
      <div className="seeding-filter-pills">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`seeding-filter-pill${value === o.value ? " is-on" : ""}`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
