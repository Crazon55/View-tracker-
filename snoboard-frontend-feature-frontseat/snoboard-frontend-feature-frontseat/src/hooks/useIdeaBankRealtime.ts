import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";

/**
 * One shared WebSocket per playbook (Idea Engine mounts bpb/xf/tech at once; Content
 * Distribution / Production add the same hook for the open playbook). A "something
 * changed" ping invalidates active React Query caches so teammates see updates without
 * waiting for the next poll.
 *
 * Why this is a module-level hub, not a socket per hook:
 * - React Strict Mode unmounts/remounts immediately. Closing a CONNECTING socket is
 *   exactly Chrome's "WebSocket is closed before the connection is established" — and
 *   the old onclose then opened another socket, looping while the API was already slow.
 * - refetchType "all" on every ping also refetched unmounted boards (and Idea Engine's
 *   unused exp caches), stacking GET /idea-bank on a backend that was already struggling.
 *
 * Polling on the boards is the fallback if the proxy never upgrades WS. When a socket
 * is actually OPEN, those polls can run much less often — see isIdeaBankSocketLive.
 */
type Hub = {
  refCount: number;
  socket: WebSocket | null;
  retryTimer: ReturnType<typeof setTimeout> | null;
  teardownTimer: ReturnType<typeof setTimeout> | null;
  invalidateTimer: ReturnType<typeof setTimeout> | null;
  retryDelay: number;
  clients: Set<QueryClient>;
  closing: boolean;
};

const hubs = new Map<string, Hub>();
const START_RETRY_MS = 4_000;
const MAX_RETRY_MS = 30_000;
const INVALIDATE_DEBOUNCE_MS = 400;
const STRICT_MODE_GRACE_MS = 500;

function dropSocket(socket: WebSocket | null) {
  if (!socket) return;
  socket.onopen = null;
  socket.onclose = null;
  socket.onerror = null;
  socket.onmessage = null;
  if (socket.readyState === WebSocket.OPEN) {
    socket.close();
    return;
  }
  // Closing while CONNECTING prints the console error and is what used to retrigger
  // onclose → reconnect. Wait until it opens, then close; if it never opens, the
  // browser drops it without our retry loop attached.
  if (socket.readyState === WebSocket.CONNECTING) {
    socket.onopen = () => {
      try { socket.close(); } catch { /* already gone */ }
    };
  }
}

function invalidateHub(playbookId: string, hub: Hub) {
  if (hub.invalidateTimer) return;
  hub.invalidateTimer = setTimeout(() => {
    hub.invalidateTimer = null;
    for (const qc of hub.clients) {
      qc.invalidateQueries({ queryKey: ["exp", playbookId, "idea-bank"], refetchType: "active" });
      qc.invalidateQueries({ queryKey: ["idea-engine"], refetchType: "active" });
    }
  }, INVALIDATE_DEBOUNCE_MS);
}

function connectHub(playbookId: string, hub: Hub) {
  if (hub.closing || hub.refCount <= 0) return;
  const state = hub.socket?.readyState;
  if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) return;

  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${proto}//${location.host}/api/v1/experiment/${playbookId}/ws`);
  hub.socket = socket;

  socket.onopen = () => {
    hub.retryDelay = START_RETRY_MS;
  };
  socket.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      if (data?.type === "ping") return;
    } catch {
      // Non-JSON still means "something changed".
    }
    invalidateHub(playbookId, hub);
  };
  socket.onerror = () => {
    // Chrome logs the failed handshake; onclose drives retry.
  };
  socket.onclose = () => {
    if (hub.socket === socket) hub.socket = null;
    if (hub.closing || hub.refCount <= 0) return;
    hub.retryTimer = setTimeout(() => connectHub(playbookId, hub), hub.retryDelay);
    hub.retryDelay = Math.min(hub.retryDelay * 2, MAX_RETRY_MS);
  };
}

function teardownHub(playbookId: string, hub: Hub) {
  hub.closing = true;
  if (hub.retryTimer) clearTimeout(hub.retryTimer);
  if (hub.invalidateTimer) clearTimeout(hub.invalidateTimer);
  hub.retryTimer = null;
  hub.invalidateTimer = null;
  const sock = hub.socket;
  hub.socket = null;
  if (hubs.get(playbookId) === hub) hubs.delete(playbookId);
  dropSocket(sock);
}

/** True while this playbook's shared socket is OPEN — boards can poll less often. */
export function isIdeaBankSocketLive(playbookId: string | undefined): boolean {
  if (!playbookId) return false;
  const hub = hubs.get(playbookId);
  return hub?.socket?.readyState === WebSocket.OPEN;
}

export function useIdeaBankRealtime(playbookId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!playbookId) return;

    let hub = hubs.get(playbookId);
    if (!hub) {
      hub = {
        refCount: 0,
        socket: null,
        retryTimer: null,
        teardownTimer: null,
        invalidateTimer: null,
        retryDelay: START_RETRY_MS,
        clients: new Set(),
        closing: false,
      };
      hubs.set(playbookId, hub);
    }

    if (hub.teardownTimer) {
      clearTimeout(hub.teardownTimer);
      hub.teardownTimer = null;
    }
    hub.closing = false;
    hub.refCount += 1;
    hub.clients.add(qc);
    connectHub(playbookId, hub);

    return () => {
      hub.clients.delete(qc);
      hub.refCount -= 1;
      if (hub.refCount > 0) return;
      // Keep the handshake alive across Strict Mode's immediate remount.
      hub.teardownTimer = setTimeout(() => {
        hub.teardownTimer = null;
        if (hub.refCount > 0) return;
        teardownHub(playbookId, hub);
      }, STRICT_MODE_GRACE_MS);
    };
  }, [playbookId, qc]);
}
