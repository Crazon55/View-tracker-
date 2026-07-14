import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Opt = { value: string; label: string };

export function SeedingSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  options: Opt[];
  placeholder?: string;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={`seeding-select-trigger ${className}`.trim()}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="seeding-select-content" position="popper" sideOffset={6}>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="seeding-select-item">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
