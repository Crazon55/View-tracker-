type Opt = { value: string; label: string };

export function FilterDropdown({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Opt[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="seeding-filter-dropdown">
      <span className="seeding-filter-dropdown-label">{label}</span>
      <select
        className="seeding-filter-dropdown-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`Filter by ${label}`}
      >
        {options.map((o) => (
          <option key={o.value || "__all"} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
