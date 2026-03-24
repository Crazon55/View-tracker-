import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, Check } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

/* ── Brand SVG icons (filled, proper glyphs) ─────────────────────── */

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  );
}

function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function TwitterXIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/* ── Platform config ─────────────────────────────────────────────── */

export interface PlatformOption {
  value: string;
  label: string;
  icon: React.FC<{ className?: string }>;
  color: string;          // tailwind text-* class for the icon
  activeBg: string;       // tailwind bg for the selected indicator
}

export const PLATFORM_OPTIONS: PlatformOption[] = [
  { value: 'instagram', label: 'Instagram', icon: InstagramIcon, color: 'text-pink-400', activeBg: 'bg-pink-500/15' },
  { value: 'youtube',   label: 'YouTube',   icon: YouTubeIcon,  color: 'text-red-500',  activeBg: 'bg-red-500/15' },
  { value: 'linkedin',  label: 'LinkedIn',  icon: LinkedInIcon, color: 'text-[#0A66C2]', activeBg: 'bg-blue-500/15' },
  { value: 'twitter',   label: 'Twitter / X', icon: TwitterXIcon, color: 'text-zinc-200', activeBg: 'bg-zinc-500/15' },
];

/* ── Component ───────────────────────────────────────────────────── */

interface PlatformSelectProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  options?: PlatformOption[];
  className?: string;
}

export function PlatformSelect({
  id,
  label = 'Platform',
  value,
  onChange,
  options = PLATFORM_OPTIONS,
  className,
}: PlatformSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  // close on click-outside
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  // close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen]);

  const handleSelect = (val: string) => {
    onChange({ target: { value: val } });
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Trigger */}
      <button
        type="button"
        id={id}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full h-14 px-4 pt-4 bg-input border border-border rounded-xl',
          'text-foreground cursor-pointer text-left',
          'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary',
          'transition-all duration-200 flex items-center gap-3',
          isOpen && 'ring-2 ring-primary/50 border-primary',
        )}
      >
        {selected && (
          <>
            <selected.icon className={cn('w-4 h-4 shrink-0', selected.color)} />
            <span className="text-sm">{selected.label}</span>
          </>
        )}
        {!selected && <span className="text-sm text-muted-foreground">Select {label}</span>}
        <ChevronDown
          className={cn(
            'w-4 h-4 text-muted-foreground ml-auto shrink-0 transition-transform duration-200',
            isOpen && 'rotate-180',
          )}
        />
      </button>

      {/* Floating label */}
      <label
        htmlFor={id}
        className={cn(
          'absolute left-4 top-1/2 -translate-y-1/2',
          'text-muted-foreground text-sm',
          'transition-all duration-200 pointer-events-none',
          (value || isOpen) && '-translate-y-7 scale-75 text-primary left-3',
        )}
      >
        {label}
      </label>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 top-full left-0 right-0 mt-1.5 bg-card border border-white/[0.08] rounded-xl shadow-2xl shadow-black/40 overflow-hidden"
          >
            {options.map((opt) => {
              const Icon = opt.icon;
              const isActive = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelect(opt.value)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors duration-100',
                    isActive
                      ? 'bg-white/[0.06] text-foreground'
                      : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground',
                  )}
                >
                  <div
                    className={cn(
                      'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors',
                      isActive ? opt.activeBg : 'bg-white/[0.03]',
                    )}
                  >
                    <Icon className={cn('w-3.5 h-3.5', opt.color)} />
                  </div>
                  <span className="text-sm font-medium">{opt.label}</span>
                  {isActive && (
                    <Check className="w-4 h-4 text-primary ml-auto shrink-0" />
                  )}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Re‑usable icon map for tables / lists ───────────────────────── */

export const platformIconMap: Record<string, React.ReactNode> = {
  instagram: <InstagramIcon className="w-3.5 h-3.5 text-pink-400" />,
  youtube:   <YouTubeIcon  className="w-3.5 h-3.5 text-red-500" />,
  linkedin:  <LinkedInIcon className="w-3.5 h-3.5 text-[#0A66C2]" />,
  twitter:   <TwitterXIcon className="w-3.5 h-3.5 text-zinc-300" />,
};
