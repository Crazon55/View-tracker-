import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { getNotifications, markAllNotificationsRead } from "@/services/api";

// Slack-like double chime using Web Audio API — no audio file needed
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const notes = [880, 1100];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      const t = ctx.currentTime + i * 0.18;
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.75, t + 0.2);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.25, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.start(t);
      osc.stop(t + 0.35);
    });
  } catch {}
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
  const email = user?.email || "";
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const loaded = useRef(false);

  const fetchNotifications = useCallback(async () => {
    if (!email) return;
    try {
      const data = await getNotifications(email);
      setNotifications(data || []);
      setUnreadCount((data || []).filter((n: AppNotification) => !n.read).length);
      loaded.current = true;
    } catch {}
  }, [email]);

  // Initial load + poll every 20s
  useEffect(() => {
    if (!email) return;
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 20_000);
    return () => clearInterval(interval);
  }, [email, fetchNotifications]);

  // Supabase Realtime — instant delivery + sound
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
          setNotifications((prev) => [n, ...prev]);
          setUnreadCount((prev) => prev + 1);
          if (loaded.current) playNotificationSound();
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [email]);

  const markAllRead = useCallback(async () => {
    if (!email) return;
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try { await markAllNotificationsRead(email); } catch {}
  }, [email]);

  return { notifications, unreadCount, markAllRead, refetch: fetchNotifications };
}
