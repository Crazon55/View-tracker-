export type ConnectionEndpoints = {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

/** Stable key for optimistic ids — includes handles so multiple edges per pair are allowed. */
export function connectionEndpointsKey(c: ConnectionEndpoints): string {
  return `${c.source}|${c.target}|${c.sourceHandle ?? ""}|${c.targetHandle ?? ""}`;
}

/** True when source, target, and both handles match (null/undefined handles treated as empty). */
export function isSameConnectionEndpoints(a: ConnectionEndpoints, b: ConnectionEndpoints): boolean {
  return (
    a.source === b.source &&
    a.target === b.target &&
    (a.sourceHandle ?? "") === (b.sourceHandle ?? "") &&
    (a.targetHandle ?? "") === (b.targetHandle ?? "")
  );
}
