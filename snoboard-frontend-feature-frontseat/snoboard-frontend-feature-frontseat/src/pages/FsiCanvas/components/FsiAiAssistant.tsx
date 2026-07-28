import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Send, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  FSI_CHAT_WELCOME,
  FSI_YOUTUBE_RESEARCH_PROMPT,
  formatSummaryForChat,
  loadChatHistory,
  saveChatHistory,
  type FsiChatMessage,
  type FsiChatReply,
  type SummaryData,
  type YoutubeResearchMeta,
} from "../lib/fsiAiChat";

type Props = {
  studyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerateSummary: () => Promise<SummaryData>;
  onSendMessage: (message: string, history: FsiChatMessage[]) => Promise<FsiChatReply | string>;
  summaryLoading: boolean;
  chatLoading: boolean;
  canvasNodeCount: number;
  connectionCount: number;
};

const QUICK_PROMPTS = [
  "Generate strategy summary",
  "What's on my canvas?",
  "What hooks should I test next?",
  "Research YouTube podcasts about ",
];

function renderMarkdownLite(text: string) {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <p key={i} className={cn("whitespace-pre-wrap", i > 0 && "mt-1.5")}>
        {parts.map((part, j) => {
          if (part.startsWith("**") && part.endsWith("**")) {
            return (
              <strong key={j} className="font-semibold text-white">
                {part.slice(2, -2)}
              </strong>
            );
          }
          return <span key={j}>{part}</span>;
        })}
      </p>
    );
  });
}

function researchNote(meta?: YoutubeResearchMeta) {
  if (!meta?.ran) return null;
  const n = meta.video_count ?? 0;
  const q = meta.query ? ` about “${meta.query}”` : "";
  return `Pulled ${n} podcast${n === 1 ? "" : "s"} from YouTube${q}`;
}

function MessageBubble({ message }: { message: FsiChatMessage }) {
  const isUser = message.role === "user";
  const note = researchNote(message.youtubeResearch);
  return (
    <div className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
          isUser
            ? "rounded-br-md bg-emerald-500 text-zinc-950"
            : "rounded-bl-md border border-zinc-800 bg-zinc-900/80 text-zinc-200",
        )}
      >
        {renderMarkdownLite(message.content)}
      </div>
      {note ? (
        <div className="max-w-[92%] px-1 text-[11px] text-zinc-500">{note}</div>
      ) : null}
    </div>
  );
}

export default function FsiAiAssistant({
  studyId,
  open,
  onOpenChange,
  onGenerateSummary,
  onSendMessage,
  summaryLoading,
  chatLoading,
  canvasNodeCount,
  connectionCount,
}: Props) {
  const [messages, setMessages] = useState<FsiChatMessage[]>(() => {
    const saved = loadChatHistory(studyId);
    return saved.length > 0 ? saved : [FSI_CHAT_WELCOME];
  });
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    saveChatHistory(studyId, messages);
  }, [studyId, messages]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      inputRef.current?.focus();
    });
  }, [open, messages, summaryLoading, chatLoading]);

  const appendMessage = useCallback(
    (role: "user" | "assistant", content: string, youtubeResearch?: YoutubeResearchMeta) => {
      const msg: FsiChatMessage = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role,
        content,
        youtubeResearch,
      };
      setMessages((prev) => [...prev, msg]);
      return msg;
    },
    [],
  );

  const runGenerateSummary = useCallback(async () => {
    appendMessage("user", "Generate strategy summary");
    try {
      const summary = await onGenerateSummary();
      appendMessage("assistant", formatSummaryForChat(summary));
    } catch (e) {
      appendMessage(
        "assistant",
        e instanceof Error ? `Couldn't generate summary: ${e.message}` : "Summary generation failed.",
      );
    }
  }, [appendMessage, onGenerateSummary]);

  const sendUserMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || summaryLoading || chatLoading) return;

      // Chip that ends with "about " — put it in the draft for the user to finish.
      if (trimmed === FSI_YOUTUBE_RESEARCH_PROMPT.trim() || trimmed === "Research YouTube podcasts about") {
        setDraft(FSI_YOUTUBE_RESEARCH_PROMPT);
        requestAnimationFrame(() => inputRef.current?.focus());
        return;
      }

      if (/^generate\s+(strategy\s+)?summary/i.test(trimmed)) {
        setDraft("");
        await runGenerateSummary();
        return;
      }

      appendMessage("user", trimmed);
      setDraft("");
      try {
        const history = messages.filter((m) => m.id !== "welcome");
        const result = await onSendMessage(trimmed, history);
        if (typeof result === "string") {
          appendMessage("assistant", result);
        } else {
          appendMessage("assistant", result.reply, result.youtubeResearch);
        }
      } catch (e) {
        appendMessage(
          "assistant",
          e instanceof Error ? `Something went wrong: ${e.message}` : "Request failed.",
        );
      }
    },
    [appendMessage, chatLoading, messages, onSendMessage, runGenerateSummary, summaryLoading],
  );

  const busy = summaryLoading || chatLoading;
  const thinkingLabel = chatLoading ? "Researching…" : "Thinking…";

  return (
    <>
      {/* Floating bubble */}
      <button
        type="button"
        aria-label={open ? "Close FSI assistant" : "Open FSI assistant"}
        onClick={() => onOpenChange(!open)}
        className={cn(
          "fixed z-[60] flex h-14 w-14 items-center justify-center rounded-full shadow-lg shadow-emerald-950/40 transition-all duration-300",
          "bg-gradient-to-br from-emerald-400 via-lime-400 to-emerald-500 text-zinc-950",
          "hover:scale-105 active:scale-95",
          open ? "bottom-6 right-[calc(min(420px,100vw)+1rem)] max-lg:bottom-24 max-lg:right-6" : "bottom-6 right-6",
        )}
      >
        {busy ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : open ? (
          <X className="h-6 w-6" />
        ) : (
          <Sparkles className="h-6 w-6" />
        )}
      </button>

      {/* Slide-out chat panel */}
      <div
        className={cn(
          "fixed inset-y-0 right-0 z-[55] flex w-[min(420px,100vw)] flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full pointer-events-none",
        )}
        aria-hidden={!open}
      >
        <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-lime-500 text-zinc-950">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-white">FSI Assistant</div>
            <div className="truncate text-xs text-zinc-500">
              {canvasNodeCount} nodes · {connectionCount} connections on canvas
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-xs text-zinc-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                {thinkingLabel}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-zinc-800 p-3">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={busy}
                onClick={() => void sendUserMessage(prompt)}
                className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] text-zinc-300 transition hover:border-emerald-700/60 hover:text-emerald-200 disabled:opacity-50"
              >
                {prompt.trimEnd().endsWith("about") ? "Research YouTube podcasts…" : prompt}
              </button>
            ))}
          </div>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void sendUserMessage(draft);
            }}
          >
            <textarea
              ref={inputRef}
              rows={2}
              value={draft}
              disabled={busy}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendUserMessage(draft);
                }
              }}
              placeholder="Ask about your canvas or YouTube podcasts…"
              className="min-h-[44px] flex-1 resize-none rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-emerald-600 focus:outline-none disabled:opacity-60"
            />
            <Button
              type="submit"
              size="icon"
              disabled={busy || !draft.trim()}
              className="h-10 w-10 shrink-0 rounded-xl bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}
