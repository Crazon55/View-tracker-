import { InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface FloatingInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  prefix?: string;
}

export const FloatingInput = forwardRef<HTMLInputElement, FloatingInputProps>(
  ({ label, prefix, className, id, ...props }, ref) => {
    return (
      <div className="relative">
        {prefix && (
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-mono-data">
            {prefix}
          </span>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(
            "peer w-full h-14 px-4 pt-4 bg-input border border-border rounded-xl",
            "text-foreground placeholder-transparent",
            "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary",
            "transition-all duration-200",
            prefix && "pl-8",
            className
          )}
          placeholder={label}
          {...props}
        />
        <label
          htmlFor={id}
          className={cn(
            "absolute left-4 top-1/2 -translate-y-1/2",
            "text-muted-foreground text-sm",
            "transition-all duration-200 pointer-events-none",
            "peer-focus:-translate-y-7 peer-focus:scale-75 peer-focus:text-primary peer-focus:left-3",
            "peer-[:not(:placeholder-shown)]:-translate-y-7 peer-[:not(:placeholder-shown)]:scale-75 peer-[:not(:placeholder-shown)]:left-3",
            prefix && "left-8 peer-focus:left-3 peer-[:not(:placeholder-shown)]:left-3"
          )}
        >
          {label}
        </label>
      </div>
    );
  }
);

FloatingInput.displayName = 'FloatingInput';
