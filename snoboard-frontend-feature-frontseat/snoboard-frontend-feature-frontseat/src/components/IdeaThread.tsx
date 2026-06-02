import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  getAllUserRoles,
  getIdeaAssignments,
  addIdeaAssignment,
  removeIdeaAssignment,
  getIdeaComments,
  postIdeaComment,
} from "@/services/api";

type TrackerType = "reel" | "post";
type CommentType = "comment" | "blocker" | "update" | "review_request";
type FilterType = CommentType | "all";

const COMMENT_TYPE_META: Record<CommentType, { label: string; color: string; bg: string; emoji: string }> = {
  comment:        { label: "Comment",        emoji: "💬", color: "#a1a1aa", bg: "rgba(161,161,170,0.12)" },
  blocker:        { label: "Blocker",        emoji: "🔴", color: "#FF7070", bg: "rgba(201,59,59,0.15)"  },
  update:         { label: "Update",         emoji: "🟡", color: "#F0C060", bg: "rgba(212,149,42,0.15)" },
  review_request: { label: "Review Request", emoji: "👁",  color: "#7BB0FF", bg: "rgba(74,127,212,0.15)" },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface IdeaThreadProps {
  ideaId: string;
  active: boolean;
  trackerType: TrackerType;
}

export default function IdeaThread({ ideaId, active, trackerType }: IdeaThreadProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { can } = usePermissions();
  const authorEmail = user?.email || "";
  const authorName  = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "";

  const [commentText, setCommentText] = useState("");
  const [commentType, setCommentType] = useState<CommentType>("comment");
  const [typeFilter, setTypeFilter] = useState<FilterType>("all");
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const threadRef = useRef<HTMLDivElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<any>(null);

  // ── Supabase Realtime — typing indicator ─────────────────────────────────────

  useEffect(() => {
    if (!active || !ideaId) return;

    const channel = supabase.channel(`idea-thread-${ideaId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on("broadcast", { event: "typing" }, ({ payload }: any) => {
        if (payload.email === authorEmail) return;
        setTypingUsers((prev) => prev.includes(payload.name) ? prev : [...prev, payload.name]);
        // Clear that user after 3s of no new event
        setTimeout(() => {
          setTypingUsers((prev) => prev.filter((n) => n !== payload.name));
        }, 3000);
      })
      .subscribe();

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [ideaId, active, authorEmail]);

  const broadcastTyping = useCallback(() => {
    channelRef.current?.send({ type: "broadcast", event: "typing", payload: { name: authorName, email: authorEmail } });
  }, [authorName, authorEmail]);

  const handleTyping = (val: string) => {
    setCommentText(val);
    if (val.trim()) {
      broadcastTyping();
      if (typingTimeout.current) clearTimeout(typingTimeout.current);
    }
  };

  // ── Data ────────────────────────────────────────────────────────────────────

  const { data: assignments = [] } = useQuery({
    queryKey: ["idea-assignments", ideaId],
    queryFn: () => getIdeaAssignments(ideaId),
    enabled: active,
  });

  const { data: comments = [] } = useQuery({
    queryKey: ["idea-comments", ideaId],
    queryFn: () => getIdeaComments(ideaId),
    enabled: active,
    refetchInterval: 10_000,
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ["user-roles-all"],
    queryFn: getAllUserRoles,
    enabled: active && can("tag_collaborator"),
  });

  const targetRole = trackerType === "reel" ? "editors" : "carousel_designer";
  const pickableUsers = allUsers.filter((u: any) =>
    (u.role || "").split(",").map((r: string) => r.trim()).includes(targetRole)
  );

  // Filter comments by selected type
  const visibleComments = typeFilter === "all"
    ? comments
    : comments.filter((c: any) => c.type === typeFilter);

  // Count per type for badges
  const typeCounts = (Object.keys(COMMENT_TYPE_META) as CommentType[]).reduce((acc, t) => {
    acc[t] = comments.filter((c: any) => c.type === t).length;
    return acc;
  }, {} as Record<CommentType, number>);

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const assignMut = useMutation({
    mutationFn: (u: { email: string; name: string }) =>
      addIdeaAssignment(ideaId, { assignee_email: u.email, assignee_name: u.name, assigned_by_email: authorEmail }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["idea-assignments", ideaId] }),
    onError: () => toast.error("Failed to tag — backend may not be deployed yet."),
  });

  const unassignMut = useMutation({
    mutationFn: (assignmentId: string) => removeIdeaAssignment(ideaId, assignmentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["idea-assignments", ideaId] }),
    onError: () => toast.error("Failed to remove — backend may not be deployed yet."),
  });

  const commentMut = useMutation({
    // Pass text + type as variables so they're captured before any state clears
    mutationFn: ({ text, type }: { text: string; type: CommentType }) =>
      postIdeaComment(ideaId, { author_email: authorEmail, author_name: authorName, text, type }),
    onMutate: async ({ text, type }) => {
      const optimistic = {
        id: `optimistic-${Date.now()}`,
        idea_id: ideaId,
        author_email: authorEmail,
        author_name: authorName,
        text,
        type,
        created_at: new Date().toISOString(),
        _optimistic: true,
      };
      queryClient.setQueryData(["idea-comments", ideaId], (old: any[]) => [...(old || []), optimistic]);
      setCommentText("");
      return { snapshot: text };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["idea-comments", ideaId] });
      setTimeout(() => threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" }), 100);
    },
    onError: (_err, _vars, context: any) => {
      queryClient.invalidateQueries({ queryKey: ["idea-comments", ideaId] });
      setCommentText(context?.snapshot || "");
      toast.error("Failed to send — check backend logs.");
    },
  });

  useEffect(() => {
    if (threadRef.current && typeFilter === "all") {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [comments.length, typeFilter]);

  if (!active) return null;

  // ── Styles ────────────────────────────────────────────────────────────────────

  const sectionLabel: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#52525b", marginBottom: 8,
  };
  const divider: React.CSSProperties = { borderTop: "1px solid #27272a", margin: "18px 0 14px" };
  const assigneeLabel  = trackerType === "reel" ? "Assigned Editor" : "Assigned Carousel Designer";
  const tagPlaceholder = trackerType === "reel" ? "Tag an editor..."  : "Tag a carousel designer...";

  return (
    <div style={{ marginTop: 4 }}>
      <div style={divider} />

      {/* ── Assignment ───────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <p style={sectionLabel}>{assigneeLabel}</p>

        {assignments.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {assignments.map((a: any) => (
              <div key={a.id} style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "#1c1c1e", border: "1px solid #3f3f46", borderRadius: 20, padding: "4px 10px 4px 8px", fontSize: 12,
              }}>
                <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#534AB7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff" }}>
                  {a.assignee_name?.[0]?.toUpperCase() || "?"}
                </span>
                <span style={{ color: "#e4e4e7", fontWeight: 500 }}>{a.assignee_name}</span>
                {can("tag_collaborator") && (
                  <button onClick={() => unassignMut.mutate(a.id)} style={{ background: "none", border: "none", color: "#71717a", cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>
                )}
              </div>
            ))}
          </div>
        )}

        {can("tag_collaborator") && (
          <select
            defaultValue=""
            onChange={(e) => {
              if (!e.target.value) return;
              const u = pickableUsers.find((u: any) => u.email === e.target.value);
              if (u) assignMut.mutate({ email: u.email, name: u.name });
              e.target.value = "";
            }}
            style={{ padding: "6px 10px", borderRadius: 7, border: "1.5px solid #3f3f46", fontSize: 12, background: "#09090b", color: "#a1a1aa", cursor: "pointer", width: "100%" }}
          >
            <option value="">{pickableUsers.length === 0 ? `No ${targetRole}s assigned yet` : `+ ${tagPlaceholder}`}</option>
            {pickableUsers.map((u: any) => (
              <option key={u.email} value={u.email}>{u.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* ── Discussion ───────────────────────────────────────────────────────── */}
      <div>
        {/* Header + type filter */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
          <p style={{ ...sectionLabel, marginBottom: 0 }}>Discussion {comments.length > 0 && `(${comments.length})`}</p>
          {comments.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              <button
                onClick={() => setTypeFilter("all")}
                style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 600, cursor: "pointer", border: `1px solid ${typeFilter === "all" ? "#71717a" : "#3f3f46"}`, background: typeFilter === "all" ? "#27272a" : "transparent", color: typeFilter === "all" ? "#e4e4e7" : "#52525b" }}
              >
                All
              </button>
              {(Object.keys(COMMENT_TYPE_META) as CommentType[]).map((t) => {
                const m = COMMENT_TYPE_META[t];
                const count = typeCounts[t];
                if (!count) return null;
                const active = typeFilter === t;
                return (
                  <button key={t} onClick={() => setTypeFilter(active ? "all" : t)} style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 600, cursor: "pointer", border: `1px solid ${active ? m.color : "#3f3f46"}`, background: active ? m.bg : "transparent", color: active ? m.color : "#52525b" }}>
                    {m.emoji} {count}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {visibleComments.length === 0 ? (
          <p style={{ fontSize: 12, color: "#3f3f46", marginBottom: 12 }}>
            {comments.length === 0 ? "No messages yet. Start the discussion below." : `No ${COMMENT_TYPE_META[typeFilter as CommentType]?.label.toLowerCase() ?? ""} messages.`}
          </p>
        ) : (
          <div ref={threadRef} style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto", marginBottom: 8, paddingRight: 2 }}>
            {visibleComments.map((c: any) => {
              const meta = COMMENT_TYPE_META[c.type as CommentType] ?? COMMENT_TYPE_META.comment;
              const isMe = c.author_email === authorEmail;
              return (
                <div key={c.id} style={{ background: isMe ? "rgba(83,74,183,0.08)" : "#18181b", border: `1px solid ${isMe ? "rgba(83,74,183,0.25)" : "#27272a"}`, borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
                    <span style={{ width: 20, height: 20, borderRadius: "50%", background: isMe ? "#534AB7" : "#3f3f46", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                      {c.author_name?.[0]?.toUpperCase() || "?"}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#e4e4e7" }}>{c.author_name}</span>
                    <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: meta.bg, color: meta.color, fontWeight: 600 }}>
                      {meta.emoji} {meta.label}
                    </span>
                    <span style={{ fontSize: 10, color: "#52525b", marginLeft: "auto" }}>{timeAgo(c.created_at)}</span>
                  </div>
                  <p style={{ fontSize: 13, color: "#d4d4d8", margin: 0, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{c.text}</p>
                  {c.attachment_url && (
                    <a href={c.attachment_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "#7BB0FF", display: "block", marginTop: 6 }}>📎 View attachment</a>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <p style={{ fontSize: 11, color: "#71717a", margin: "0 0 8px", fontStyle: "italic" }}>
            {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing...
          </p>
        )}

        {/* Composer */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <textarea
            value={commentText}
            onChange={(e) => handleTyping(e.target.value)}
            placeholder="Add a comment, flag a blocker, or request a review..."
            rows={2}
            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #3f3f46", background: "#09090b", color: "#e4e4e7", fontSize: 13, resize: "vertical", fontFamily: "inherit" }}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && commentText.trim()) commentMut.mutate({ text: commentText.trim(), type: commentType }); }}
          />

          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
            {(Object.keys(COMMENT_TYPE_META) as CommentType[]).map((t) => {
              const m = COMMENT_TYPE_META[t];
              const sel = commentType === t;
              return (
                <button key={t} onClick={() => setCommentType(t)} style={{ padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer", border: `1.5px solid ${sel ? m.color : "#3f3f46"}`, background: sel ? m.bg : "transparent", color: sel ? m.color : "#71717a", transition: "all 0.15s" }}>
                  {m.emoji} {m.label}
                </button>
              );
            })}
            <button
              disabled={!commentText.trim() || commentMut.isPending}
              onClick={() => commentMut.mutate({ text: commentText.trim(), type: commentType })}
              style={{ marginLeft: "auto", padding: "4px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer", border: "none", background: commentText.trim() ? "#534AB7" : "#27272a", color: commentText.trim() ? "#fff" : "#52525b", transition: "all 0.15s" }}
            >
              {commentMut.isPending ? "Sending..." : "Send →"}
            </button>
          </div>
          <p style={{ fontSize: 10, color: "#3f3f46", margin: 0 }}>Cmd+Enter to send</p>
        </div>
      </div>
    </div>
  );
}
