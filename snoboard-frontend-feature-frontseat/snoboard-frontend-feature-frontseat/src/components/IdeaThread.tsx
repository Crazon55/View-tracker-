import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
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
  /** Pass the current normalised stage string */
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
  const threadRef = useRef<HTMLDivElement>(null);

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
    refetchInterval: 15_000,
  });

  // fetch all users to populate picker — only roles relevant to tracker type
  const { data: allUsers = [] } = useQuery({
    queryKey: ["user-roles-all"],
    queryFn: getAllUserRoles,
    enabled: active && can("tag_collaborator"),
  });

  const targetRole = trackerType === "reel" ? "editors" : "carousel_designer";
  const pickableUsers = allUsers.filter((u: any) =>
    (u.role || "").split(",").map((r: string) => r.trim()).includes(targetRole)
  );

  // ── Mutations ────────────────────────────────────────────────────────────────

  const assignMut = useMutation({
    mutationFn: (u: { email: string; name: string }) =>
      addIdeaAssignment(ideaId, { assignee_email: u.email, assignee_name: u.name, assigned_by_email: authorEmail }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["idea-assignments", ideaId] }),
  });

  const unassignMut = useMutation({
    mutationFn: (assignmentId: string) => removeIdeaAssignment(ideaId, assignmentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["idea-assignments", ideaId] }),
  });

  const commentMut = useMutation({
    mutationFn: () =>
      postIdeaComment(ideaId, { author_email: authorEmail, author_name: authorName, text: commentText.trim(), type: commentType }),
    onSuccess: () => {
      setCommentText("");
      queryClient.invalidateQueries({ queryKey: ["idea-comments", ideaId] });
      setTimeout(() => threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" }), 100);
    },
  });

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [comments.length]);

  if (!active) return null;

  // ── Styles (matching tracker dark theme) ─────────────────────────────────────

  const sectionLabel: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#52525b", marginBottom: 8,
  };
  const divider: React.CSSProperties = {
    borderTop: "1px solid #27272a", margin: "18px 0 14px",
  };

  const assigneeLabel = trackerType === "reel" ? "Assigned Editor" : "Assigned Carousel Designer";
  const tagPlaceholder = trackerType === "reel" ? "Tag an editor..." : "Tag a carousel designer...";

  return (
    <div style={{ marginTop: 4 }}>
      <div style={divider} />

      {/* ── Assignment section ─────────────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <p style={sectionLabel}>{assigneeLabel}</p>

        {/* Current assignees */}
        {assignments.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {assignments.map((a: any) => (
              <div key={a.id} style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "#1c1c1e", border: "1px solid #3f3f46",
                borderRadius: 20, padding: "4px 10px 4px 8px", fontSize: 12,
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

        {/* Tag picker — CS/CW only */}
        {can("tag_collaborator") && (
          <select
            defaultValue=""
            onChange={(e) => {
              if (!e.target.value) return;
              const u = pickableUsers.find((u: any) => u.email === e.target.value);
              if (u) assignMut.mutate({ email: u.email, name: u.name });
              e.target.value = "";
            }}
            style={{
              padding: "6px 10px", borderRadius: 7, border: "1.5px solid #3f3f46",
              fontSize: 12, background: "#09090b", color: "#a1a1aa", cursor: "pointer", width: "100%",
            }}
          >
            <option value="">{pickableUsers.length === 0 ? `No ${targetRole}s found` : `+ ${tagPlaceholder}`}</option>
            {pickableUsers.map((u: any) => (
              <option key={u.email} value={u.email}>{u.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* ── Comment thread ─────────────────────────────────────────────────── */}
      <div>
        <p style={sectionLabel}>Discussion</p>

        {comments.length === 0 ? (
          <p style={{ fontSize: 12, color: "#3f3f46", marginBottom: 12 }}>No messages yet. Start the discussion below.</p>
        ) : (
          <div
            ref={threadRef}
            style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto", marginBottom: 12, paddingRight: 2 }}
          >
            {comments.map((c: any) => {
              const meta = COMMENT_TYPE_META[c.type as CommentType] ?? COMMENT_TYPE_META.comment;
              const isMe = c.author_email === authorEmail;
              return (
                <div key={c.id} style={{
                  background: isMe ? "rgba(83,74,183,0.08)" : "#18181b",
                  border: `1px solid ${isMe ? "rgba(83,74,183,0.25)" : "#27272a"}`,
                  borderRadius: 10, padding: "10px 12px",
                }}>
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
                    <a href={c.attachment_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "#7BB0FF", display: "block", marginTop: 6 }}>
                      📎 View attachment
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Composer */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Add a comment, flag a blocker, or request a review..."
            rows={2}
            style={{
              width: "100%", padding: "8px 10px", borderRadius: 8,
              border: "1.5px solid #3f3f46", background: "#09090b",
              color: "#e4e4e7", fontSize: 13, resize: "vertical",
              fontFamily: "inherit",
            }}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && commentText.trim()) commentMut.mutate(); }}
          />

          {/* Type selector */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {(Object.keys(COMMENT_TYPE_META) as CommentType[]).map((t) => {
              const m = COMMENT_TYPE_META[t];
              const active = commentType === t;
              return (
                <button
                  key={t}
                  onClick={() => setCommentType(t)}
                  style={{
                    padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer",
                    border: `1.5px solid ${active ? m.color : "#3f3f46"}`,
                    background: active ? m.bg : "transparent",
                    color: active ? m.color : "#71717a",
                    transition: "all 0.15s",
                  }}
                >
                  {m.emoji} {m.label}
                </button>
              );
            })}
            <button
              disabled={!commentText.trim() || commentMut.isPending}
              onClick={() => commentMut.mutate()}
              style={{
                marginLeft: "auto", padding: "4px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                border: "none", background: commentText.trim() ? "#534AB7" : "#27272a",
                color: commentText.trim() ? "#fff" : "#52525b",
                transition: "all 0.15s",
              }}
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
