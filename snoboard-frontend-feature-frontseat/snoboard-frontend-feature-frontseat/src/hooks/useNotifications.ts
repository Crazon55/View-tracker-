import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { getNotifications, markAllNotificationsRead } from "@/services/api";

type AudioCtx = AudioContext;

let sharedCtx: AudioCtx | null = null;
let unlockBound = false;
let titleFlashTimer: ReturnType<typeof setInterval> | null = null;
let baseDocumentTitle = typeof document !== "undefined" ? document.title : "FSOS";

function getAudioCtx(): AudioCtx | null {
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedCtx) sharedCtx = new Ctor();
  return sharedCtx;
}

function requestDesktopPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "default") {
    void Notification.requestPermission().catch(() => {});
  }
}

/** Unlock Web Audio + request desktop notification permission on first gesture. */
function ensureAudioUnlocked() {
  if (unlockBound || typeof window === "undefined") return;
  unlockBound = true;
  const unlock = () => {
    const ctx = getAudioCtx();
    if (ctx?.state === "suspended") void ctx.resume();
    requestDesktopPermission();
  };
  window.addEventListener("pointerdown", unlock, { once: true, capture: true });
  window.addEventListener("keydown", unlock, { once: true, capture: true });
  window.addEventListener("touchstart", unlock, { once: true, capture: true });
}

/** WhatsApp / Slack-style double chime (Web Audio — no mp3). */
export function playNotificationSound() {
  try {
    ensureAudioUnlocked();
    const ctx = getAudioCtx();
    if (!ctx) return;
    const run = () => {
      const notes = [880, 1174.7]; // A5 → D6
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        const t = ctx.currentTime + i * 0.16;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.linearRampToValueAtTime(0.4, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
        osc.start(t);
        osc.stop(t + 0.4);
      });
    };
    if (ctx.state === "suspended") {
      void ctx.resume().then(run).catch(() => {});
    } else {
      run();
    }
  } catch {
    // audio unavailable — silent fail
  }
}

function stopTitleFlash() {
  if (titleFlashTimer) {
    clearInterval(titleFlashTimer);
    titleFlashTimer = null;
  }
  if (typeof document !== "undefined") document.title = baseDocumentTitle;
}

function flashDocumentTitle(label: string) {
  if (typeof document === "undefined") return;
  stopTitleFlash();
  baseDocumentTitle = document.title.replace(/^\(\d+\)\s*/, "").replace(/^🔔\s*.*?\s*[·|]\s*/, "") || baseDocumentTitle;
  let on = true;
  const flash = `🔔 ${label}`;
  document.title = flash;
  titleFlashTimer = setInterval(() => {
    document.title = on ? `(1) ${baseDocumentTitle}` : flash;
    on = !on;
  }, 900);
}

function notificationHref(n: AppNotification): string | null {
  if (!n.idea_id) return null;
  if (n.tracker_type === "seeding") return `/seeding/deals/${n.idea_id}`;
  if (n.tracker_type === "post") return `/post-tracker?idea=${n.idea_id}`;
  if (n.tracker_type === "reel" || n.tracker_type === "content" || !n.tracker_type) {
    return `/content-tracker?idea=${n.idea_id}`;
  }
  return `/content-tracker?idea=${n.idea_id}`;
}

function showDesktopNotification(n: AppNotification) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    const title = n.from_name || "FSOS";
    const body = n.message || n.idea_title || "New update";
    const note = new Notification(title, {
      body,
      tag: n.id || `fsos-${Date.now()}`,
      // Let the OS also ding when the tab is in the background / another app is focused.
      silent: false,
      icon: "/favicon.ico",
    });
    note.onclick = () => {
      try {
        window.focus();
        const href = notificationHref(n);
        if (href) window.location.assign(href);
      } catch {
        /* ignore */
      }
      note.close();
    };
  } catch {
    /* ignore */
  }
}

/** Alert the user wherever they are: sound + toast + desktop banner + title flash. */
function alertIncoming(n: AppNotification) {
  playNotificationSound();
  const body = n.message || n.idea_title || "New notification";
  toast(body, {
    description: n.from_name || (n.tracker_type === "seeding" ? "Seeding" : "FSOS"),
    duration: 6000,
  });
  showDesktopNotification(n);
  if (typeof document !== "undefined" && document.hidden) {
    flashDocumentTitle(n.idea_title || body.slice(0, 40));
  }
}

export interface AppNotification {
  id: string;
  user_email: string;
  type: string;
  idea_id: string | null;
  idea_title: string | null;
  from_name: string | null;
  message: string | null;
  tracker_type: string | null;
  read: boolean;
  created_at: string;
}

type NotificationApi = {
  notifications: AppNotification[];
  unreadCount: number;
  markAllRead: () => Promise<void>;
  refetch: () => Promise<void>;
};

const NotificationContext = createContext<NotificationApi | null>(null);

function useNotificationsState(): NotificationApi {
  const { user } = useAuth();
  const email = (user?.email || "").trim().toLowerCase();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const seenIds = useRef<Set<string>>(new Set());
  const seeded = useRef(false);

  useEffect(() => {
    ensureAudioUnlocked();
  }, []);

  // Stop title flash when they return to this tab.
  useEffect(() => {
    const onVis = () => {
      if (!document.hidden) stopTitleFlash();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const absorbNew = useCallback((rows: AppNotification[], { alert }: { alert: boolean }) => {
    const fresh: AppNotification[] = [];
    for (const n of rows) {
      if (!n?.id || seenIds.current.has(n.id)) continue;
      seenIds.current.add(n.id);
      fresh.push(n);
    }
    if (alert && seeded.current && fresh.length > 0) {
      // One chime/desktop alert for the newest item (avoid spam if several arrived together).
      alertIncoming(fresh[0]);
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!email) return;
    try {
      const data = (await getNotifications(email)) as AppNotification[];
      const rows = data || [];
      absorbNew(rows, { alert: true });
      seeded.current = true;
      setNotifications(rows);
      setUnreadCount(rows.filter((n) => !n.read).length);
    } catch {
      /* ignore */
    }
  }, [email, absorbNew]);

  // Keep polling even when the tab is in the background so alerts still arrive.
  useEffect(() => {
    if (!email) return;
    seeded.current = false;
    seenIds.current = new Set();
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 8_000);
    return () => clearInterval(interval);
  }, [email, fetchNotifications]);

  useEffect(() => {
    if (!email) return;
    const channel = supabase
      .channel(`notif-${email}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_email=eq.${email}`,
        },
        (payload) => {
          const n = payload.new as AppNotification;
          if (!n?.id) return;
          const already = seenIds.current.has(n.id);
          seenIds.current.add(n.id);
          setNotifications((prev) => (prev.some((x) => x.id === n.id) ? prev : [n, ...prev]));
          setUnreadCount((prev) => prev + (already || n.read ? 0 : 1));
          if (seeded.current && !already) alertIncoming(n);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [email]);

  const markAllRead = useCallback(async () => {
    if (!email) return;
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    stopTitleFlash();
    try {
      await markAllNotificationsRead(email);
    } catch {
      /* ignore */
    }
  }, [email]);

  return useMemo(
    () => ({ notifications, unreadCount, markAllRead, refetch: fetchNotifications }),
    [notifications, unreadCount, markAllRead, fetchNotifications],
  );
}

/** Single app-wide listener so chimes fire on every route / background tab. */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const value = useNotificationsState();
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications(): NotificationApi {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    // Safe fallback if a tree mounts outside the provider (shouldn't happen in App).
    return {
      notifications: [],
      unreadCount: 0,
      markAllRead: async () => {},
      refetch: async () => {},
    };
  }
  return ctx;
}
