import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Building2, Check } from 'lucide-react';
import { Brand } from '@/types/brand';

interface BrandComboboxProps {
  brands: Brand[];
  value: string;
  onChange: (value: string) => void;
  id?: string;
}

export function BrandCombobox({ brands, value, onChange, id }: BrandComboboxProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredBrands = brands.filter((brand) =>
    brand.name.toLowerCase().includes(inputValue.toLowerCase())
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue);
    // Only show dropdown if there's text being typed
    setOpen(newValue.length > 0);
  };

  const handleSelect = (brandName: string) => {
    setInputValue(brandName);
    onChange(brandName);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        placeholder=" "
        className={cn(
          "peer w-full h-14 px-4 pt-4 bg-input border border-border rounded-xl",
          "text-foreground placeholder-transparent",
          "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary",
          "transition-all duration-200"
        )}
      />
      <label
        htmlFor={id}
        className={cn(
          "absolute left-4 top-1/2 -translate-y-1/2",
          "text-muted-foreground text-sm",
          "transition-all duration-200 pointer-events-none",
          (inputValue || document.activeElement === inputRef.current) && 
            "-translate-y-7 scale-75 text-primary left-3"
        )}
      >
        Brand Name
      </label>

      {/* Dropdown */}
      {open && filteredBrands.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-xl shadow-lg overflow-hidden">
          <div className="max-h-[200px] overflow-y-auto">
            {filteredBrands.map((brand) => (
              <button
                key={brand.id}
                type="button"
                onClick={() => handleSelect(brand.name)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 text-left",
                  "hover:bg-accent transition-colors",
                  value === brand.name && "bg-accent"
                )}
              >
                <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-4 h-4 text-secondary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {brand.name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {brand.parentCompany}
                  </p>
                </div>
                {value === brand.name && (
                  <Check className="w-4 h-4 text-primary flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
