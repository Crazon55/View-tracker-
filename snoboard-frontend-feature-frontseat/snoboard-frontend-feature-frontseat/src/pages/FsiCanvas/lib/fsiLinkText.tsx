import type { ReactNode } from "react";

const URL_PATTERN = /((?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?)}\]'"])/gi;

export function normalizeLinkHref(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  if (/^[a-z0-9][-a-z0-9.]*\.[a-z]{2,}(\/[^\s]*)?$/i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

export function looksLikeUrl(value: string): boolean {
  const v = value.trim();
  return (
    /^https?:\/\//i.test(v) ||
    /^www\./i.test(v) ||
    /^[a-z0-9][-a-z0-9.]*\.[a-z]{2,}(\/[^\s]*)?$/i.test(v)
  );
}

export function FsiLinkifiedText({
  text,
  className,
  linkClassName = "underline decoration-emerald-950/40 hover:decoration-emerald-950",
}: {
  text: string;
  className?: string;
  linkClassName?: string;
}) {
  if (!text.trim()) return <span className={className}>—</span>;

  const parts: ReactNode[] = [];
  let lastIndex = 0;
  const re = new RegExp(URL_PATTERN.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const url = match[0];
    parts.push(
      <a
        key={`${match.index}-${url}`}
        href={normalizeLinkHref(url)}
        target="_blank"
        rel="noopener noreferrer"
        className={`nodrag nopan ${linkClassName}`}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {url}
      </a>,
    );
    lastIndex = match.index + url.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <span className={className}>{parts}</span>;
}
