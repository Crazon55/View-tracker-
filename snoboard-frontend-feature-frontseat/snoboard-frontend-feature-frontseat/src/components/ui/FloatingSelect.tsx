import { SelectHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';

interface FloatingSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: { value: string; label: string }[];
}

export const FloatingSelect = forwardRef<HTMLSelectElement, FloatingSelectProps>(
  ({ label, options, className, id, value, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          ref={ref}
          id={id}
          value={value}
          className={cn(
            "peer w-full h-14 px-4 pt-4 bg-input border border-border rounded-xl",
            "text-foreground appearance-none cursor-pointer",
            "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary",
            "transition-all duration-200",
            className
          )}
          {...props}
        >
          <option value="" disabled>Select {label}</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-card">
              {opt.label}
            </option>
          ))}
        </select>
        <label
          htmlFor={id}
          className={cn(
            "absolute left-4 top-1/2 -translate-y-1/2",
            "text-muted-foreground text-sm",
            "transition-all duration-200 pointer-events-none",
            (value || props.defaultValue) && "-translate-y-7 scale-75 text-primary left-3"
          )}
        >
          {label}
        </label>
        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
      </div>
    );
  }
);

FloatingSelect.displayName = 'FloatingSelect';
