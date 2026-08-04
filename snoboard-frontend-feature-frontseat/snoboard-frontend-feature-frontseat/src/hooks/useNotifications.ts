import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { getNotifications, markAllNotificationsRead } from "@/services/api";

type AudioCtx = AudioContext;

let sharedCtx: AudioCtx | null = null;
let unlockBound = false;

function getAudioCtx(): AudioCtx | null {
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedCtx) sharedCtx = new Ctor();
  return sharedCtx;
}

/** Browsers mute Web Audio until a user gesture — unlock once on first click/key/touch. */
function ensureAudioUnlocked() {
  if (unlockBound || typeof window === "undefined") return;
  unlockBound = true;
  const unlock = () => {
    const ctx = getAudioCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
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
        gain.gain.linearRampToValueAtTime(0.35, t + 0.02);
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

export function useNotifications() {
  const { user } = useAuth();
  const email = (user?.email || "").trim().toLowerCase();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const seenIds = useRef<Set<string>>(new Set());
  const seeded = useRef(false);

  useEffect(() => {
    ensureAudioUnlocked();
  }, []);

  const absorbNew = useCallback((rows: AppNotification[], { play }: { play: boolean }) => {
    let fresh = 0;
    for (const n of rows) {
      if (!n?.id || seenIds.current.has(n.id)) continue;
      seenIds.current.add(n.id);
      fresh += 1;
    }
    if (play && seeded.current && fresh > 0) playNotificationSound();
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!email) return;
    try {
      const data = (await getNotifications(email)) as AppNotification[];
      const rows = data || [];
      // After first load, any newly appeared ids (Realtime miss / delayed insert) still chime.
      absorbNew(rows, { play: true });
      seeded.current = true;
      setNotifications(rows);
      setUnreadCount(rows.filter((n) => !n.read).length);
    } catch {
      /* ignore */
    }
  }, [email, absorbNew]);

  // Initial load + poll every 8s (Realtime may be off for notifications; poll is the reliable path).
  useEffect(() => {
    if (!email) return;
    seeded.current = false;
    seenIds.current = new Set();
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 8_000);
    return () => clearInterval(interval);
  }, [email, fetchNotifications]);

  // Supabase Realtime — instant delivery + sound when publication is enabled.
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
          if (seeded.current && !already) playNotificationSound();
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
    try {
      await markAllNotificationsRead(email);
    } catch {
      /* ignore */
    }
  }, [email]);

  return { notifications, unreadCount, markAllRead, refetch: fetchNotifications };
}
