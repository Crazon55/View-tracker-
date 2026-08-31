import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Subscribes to the backend's per-playbook idea-bank WebSocket and invalidates the same
 * ["exp", playbookId, "idea-bank", ...] query-key prefix every local mutation already
 * invalidates — so a teammate's change on another machine (add/move/assign/delete/post)
 * shows up here without waiting for the next poll or a manual reload.
 *
 * Deliberately dumb on payload (just "something changed, go refetch") rather than a synced
 * diff — reuses the exact invalidation path already proven throughout ExperimentX.tsx.
 * Reconnects with capped backoff on drop; the existing polling (refetchInterval already on
 * the Production/Frontseat queries) covers the gap if the socket can't connect at all (e.g.
 * a reverse proxy in front of the backend not forwarding the Upgrade header yet), so a
 * failed connection here never breaks anything — it just falls back to what already existed.
 */
export function useIdeaBankRealtime(playbookId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!playbookId) return;
    let stopped = false;
    let socket: WebSocket | null = null;
    let retryDelay = 1000;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (stopped) return;
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${proto}//${location.host}/api/v1/experiment/${playbookId}/ws`);
      socket.onmessage = () => qc.invalidateQueries({ queryKey: ["exp", playbookId, "idea-bank"], refetchType: "all" });
      socket.onopen = () => { retryDelay = 1000; };
      socket.onclose = () => {
        if (stopped) return;
        retryTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 15_000);
      };
    };
    connect();

    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      socket?.close();
    };
  }, [playbookId, qc]);
}
