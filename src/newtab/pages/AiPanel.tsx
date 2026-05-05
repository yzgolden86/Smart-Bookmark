import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { chat } from "@/lib/ai";
import { getBookmarkContextForAi } from "@/lib/aiBookmarkContext";
import type { AiMessage, Settings } from "@/types";
import { cn } from "@/lib/utils";
import {
  Send,
  Sparkles,
  Square,
  Flame,
  Loader2,
  Download,
  Eraser,
  User,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import { fetchTrending, trendingToMarkdown } from "@/lib/github";
import { toast } from "@/components/ui/toast";

/**
 * 通用助手 + 书签上下文：
 * - 默认像普通 AI 助手一样回答任意问题（编程、写作、文档）；
 * - 如果用户的问题确实和"我的书签"相关，会在 messages[0] 注入一份书签快照供模型引用。
 *
 * 之前版本里 system prompt 把模型框死成"只回答书签相关问题"，这次放开。
 */
const SYSTEM_PROMPT = [
  "You are Smart Bookmark Assistant — a helpful general-purpose AI that ALSO has access to a snapshot of the user's local Chrome bookmarks.",
  "Capabilities:",
  "- Answer any question the user asks: programming, docs, writing, math, daily questions, etc. — same quality as a normal AI assistant.",
  "- When the user's question relates to their bookmarks, ground the answer in the snapshot appended below under '---'.",
  "- Help with bookmark organization, dedup hints, related-site suggestions when explicitly asked.",
  "Style: be concise but useful, render code in fenced markdown blocks, reply in the user's language (Chinese ↔ English).",
  "Never fabricate bookmarks that don't appear in the snapshot when answering bookmark-specific questions.",
].join("\n");

/**
 * 会话保留策略（用户要求）：
 * - 切换 tab（dashboard / discover / cleaner / …）时保留对话；
 * - 刷新页面 / 重新打开新标签页 → 清空。
 *
 * sessionStorage 正好满足：仅在当前标签页生命周期内可用，刷新清空。
 */
const SESSION_KEY = "smart-bookmark::ai-session-v1";

function loadSession(): AiMessage[] | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AiMessage[];
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}
function saveSession(msgs: AiMessage[]) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(msgs));
  } catch {}
}
function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {}
}

function formatMsgTime(
  at: number | undefined,
  language: Settings["language"],
) {
  if (at == null) return "";
  const locale =
    language === "zh" ? "zh-CN" : language === "en" ? "en-US" : undefined;
  return new Date(at).toLocaleString(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AiPanel({ settings }: { settings: Settings }) {
  const t = useT();
  const [messages, setMessages] = useState<AiMessage[]>(() => {
    const saved = loadSession();
    if (saved && saved.length) return saved;
    return [{ role: "system", content: SYSTEM_PROMPT }];
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [injectingTrending, setInjectingTrending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 任何对话变更都立刻写回 sessionStorage，方便切换 tab 后回来看到完整记录。
  useEffect(() => {
    saveSession(messages);
  }, [messages]);

  // 新消息到达时滚动到底部。
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const injectTrending = async () => {
    setInjectingTrending(true);
    try {
      const data = await fetchTrending({
        range: settings.discoverDefaultRange ?? "weekly",
        mode: settings.discoverDefaultMode ?? "created",
        language: settings.discoverDefaultLanguage || undefined,
        limit: 20,
        token: settings.githubToken || undefined,
      });
      const md = trendingToMarkdown(data, {
        range: settings.discoverDefaultRange ?? "weekly",
        mode: settings.discoverDefaultMode ?? "created",
        language: settings.discoverDefaultLanguage,
      });
      const now = Date.now();
      setMessages((prev) => [
        ...prev,
        {
          role: "user",
          content: `下面是我从 GitHub 拉到的热门项目，请基于它回答接下来的问题，或给出概览。\n\n${md}`,
          at: now,
        },
      ]);
      toast(t("discover.injectedAi", String(data.length)), "success");
    } catch (err) {
      toast(
        t("discover.error") + ": " + ((err as Error)?.message ?? ""),
        "error",
      );
    } finally {
      setInjectingTrending(false);
    }
  };

  const visible = messages.filter((m) => m.role !== "system");
  const modelLine =
    settings.aiProvider === "none"
      ? t("ai.disabled")
      : `${settings.aiProvider} · ${settings.aiModel}`;

  const send = async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text) return;
    if (settings.aiProvider === "none" || !settings.aiApiKey) {
      alert(t("ai.needKey"));
      return;
    }
    const bookmarkCtx = await getBookmarkContextForAi();
    const convo = messages.filter((m) => m.role !== "system");
    const forApi: AiMessage[] = [
      {
        role: "system",
        content: `${SYSTEM_PROMPT}\n\n---\n${bookmarkCtx}`,
      },
      ...convo,
      { role: "user", content: text },
    ];
    const now = Date.now();
    setMessages([
      ...messages,
      { role: "user", content: text, at: now },
      { role: "assistant", content: "", at: now },
    ]);

    setInput("");
    setLoading(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      let acc = "";
      await chat({
        settings,
        messages: forApi,
        signal: ctrl.signal,
        onDelta: (d) => {
          acc += d;
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            copy[copy.length - 1] = {
              role: "assistant",
              content: acc,
              at: last?.at ?? now,
            };
            return copy;
          });
        },
      });
    } catch (err: any) {
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        copy[copy.length - 1] = {
          role: "assistant",
          content: `⚠️ ${err?.message ?? "请求失败"}`,
          at: last?.at,
        };
        return copy;
      });
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const stop = () => abortRef.current?.abort();

  const exportMarkdown = () => {
    if (!visible.length) {
      toast("当前对话为空", "info");
      return;
    }
    const lines: string[] = [];
    lines.push(`# 书签助手对话记录`);
    lines.push("");
    lines.push(`> 导出于 ${new Date().toLocaleString()}`);
    if (settings.aiProvider !== "none") {
      lines.push(`> 模型：${settings.aiProvider} · ${settings.aiModel}`);
    }
    lines.push("");
    for (const m of visible) {
      const who = m.role === "user" ? "🧑 你" : "🤖 AI助手";
      const at = m.at ? ` · ${new Date(m.at).toLocaleString()}` : "";
      lines.push(`## ${who}${at}`);
      lines.push("");
      lines.push(m.content || "");
      lines.push("");
    }
    const blob = new Blob([lines.join("\n")], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `smart-bookmark-chat-${new Date()
      .toISOString()
      .slice(0, 16)
      .replace(/[:T]/g, "")}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast("已导出 Markdown", "success");
  };

  const clearChat = () => {
    if (!visible.length) return;
    if (!confirm(t("ai.confirmClear"))) return;
    abortRef.current?.abort();
    setMessages([{ role: "system", content: SYSTEM_PROMPT }]);
    clearSession();
  };

  const isAiLive = settings.aiProvider !== "none";

  return (
    <div className="mx-auto flex h-full w-full max-w-[1280px] flex-col">
      <header className="mb-3 flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2.5 font-serif text-[1.1rem] tracking-tight">
          <Sparkles
            className="h-4 w-4"
            style={{ color: "hsl(var(--claude-accent))" }}
            strokeWidth={1.8}
          />
          <span className="font-semibold">{t("ai.title")}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={injectTrending}
            disabled={injectingTrending}
            className="gap-1.5 text-xs"
            title={t("discover.injectAi")}
          >
            {injectingTrending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Flame className="h-3.5 w-3.5 text-rose-500" />
            )}
            {t("discover.injectAi")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportMarkdown}
            disabled={!visible.length}
            className="gap-1.5 text-xs"
            title={t("ai.export")}
          >
            <Download className="h-3.5 w-3.5" />
            {t("ai.export")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={clearChat}
            disabled={!visible.length}
            className="gap-1.5 text-xs"
            title={t("ai.clear")}
          >
            <Eraser className="h-3.5 w-3.5" />
            {t("ai.clear")}
          </Button>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[10.5px]",
              isAiLive ? "bg-background/60" : "bg-muted/60 text-muted-foreground",
            )}
            style={
              isAiLive ? { color: "hsl(var(--claude-ink-muted))" } : undefined
            }
            title={isAiLive ? modelLine : t("ai.disabled")}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                isAiLive
                  ? "bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.15)]"
                  : "bg-muted-foreground/40",
              )}
              aria-hidden
            />
            {modelLine}
          </span>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-3 overflow-hidden">
        <div
          ref={scrollRef}
          className="scrollbar-thin flex-1 space-y-8 overflow-auto rounded-lg px-6 py-6"
          style={{
            backgroundColor: "hsl(var(--claude-canvas))",
          }}
        >
          {!visible.length && (
            <div className="flex flex-col items-center gap-5 px-4 py-6 text-center">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-full"
                style={{
                  backgroundColor: "hsl(var(--claude-accent) / 0.12)",
                  color: "hsl(var(--claude-accent))",
                }}
              >
                <Sparkles className="h-6 w-6" strokeWidth={1.6} />
              </div>
              <div className="max-w-md space-y-2">
                <h3 className="font-serif text-lg font-semibold tracking-tight">
                  {t("ai.emptyHeading")}
                </h3>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: "hsl(var(--claude-ink-muted))" }}
                >
                  {t("ai.emptyDesc")}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 pt-1">
                {[
                  t("ai.suggestOrganize"),
                  t("ai.suggestFindDups"),
                  t("ai.suggestRecommend"),
                  t("ai.suggestSummary"),
                ].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-full border px-3 py-1.5 font-serif text-[12.5px] transition hover:bg-background/70"
                    style={{
                      borderColor: "hsl(var(--claude-rule))",
                      color: "hsl(var(--claude-ink-muted))",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {visible.map((m, i) => {
            const isUser = m.role === "user";
            const rail = isUser
              ? "hsl(var(--primary))"
              : "hsl(var(--claude-accent))";
            const isLastAssistant =
              !isUser && i === visible.length - 1 && loading;
            return (
              <article
                key={m.at != null ? `${m.at}-${m.role}-${i}` : i}
                className="flex gap-3"
              >
                {/* 圆形头像徽章：用户用 primary 色 + User 图标，AI 用 claude-accent + Sparkles。 */}
                <div
                  className="relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-2"
                  style={{
                    background: isUser
                      ? "linear-gradient(135deg, hsl(var(--primary) / 0.18), hsl(var(--primary) / 0.06))"
                      : "linear-gradient(135deg, hsl(var(--claude-accent) / 0.22), hsl(var(--claude-accent) / 0.06))",
                    color: rail,
                    // @ts-ignore
                    "--tw-ring-color": isUser
                      ? "hsl(var(--primary) / 0.25)"
                      : "hsl(var(--claude-accent) / 0.25)",
                  }}
                >
                  {isUser ? (
                    <User className="h-4 w-4" strokeWidth={1.8} />
                  ) : (
                    <Sparkles className="h-4 w-4" strokeWidth={1.8} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <header
                    className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]"
                    style={{ color: "hsl(var(--claude-ink-muted))" }}
                  >
                    {/*
                     * 「用户 / AI助手」字样换成更精致的排版：
                     * - 字号略大 (14px)、字间距 0.4px、深一档颜色让它从时间戳里突出；
                     * - 用户名用渐变填充字，AI 助手保持品牌色。
                     */}
                    <span
                      className="text-[14px] font-semibold tracking-[0.4px]"
                      style={
                        isUser
                          ? {
                              backgroundImage:
                                "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.7))",
                              WebkitBackgroundClip: "text",
                              WebkitTextFillColor: "transparent",
                              backgroundClip: "text",
                              color: "transparent",
                            }
                          : { color: rail }
                      }
                    >
                      {isUser ? t("ai.userLabel") : t("ai.assistantLabel")}
                    </span>
                    {m.at != null && (
                      <time
                        dateTime={new Date(m.at).toISOString()}
                        className="font-mono"
                      >
                        {formatMsgTime(m.at, settings.language)}
                      </time>
                    )}
                    {!isUser && settings.aiProvider !== "none" && (
                      <span className="rounded-md bg-background/60 px-1.5 py-0 font-mono text-[10px]">
                        {modelLine}
                      </span>
                    )}
                  </header>
                  <div
                    className={cn(
                      "rounded-2xl px-4 py-3 whitespace-pre-wrap text-[14px] leading-[1.7] text-foreground/90 shadow-sm",
                    )}
                    style={{
                      backgroundColor: isUser
                        ? "hsl(var(--primary) / 0.08)"
                        : "hsl(0 0% 100% / 0.55)",
                      borderLeft: `3px solid ${rail}`,
                    }}
                  >
                    {m.content}
                    {/* 还没有内容、且当前在 loading：显式提示「AI 正在思考…」 + 动效，比单个省略号更明显 */}
                    {!m.content && isLastAssistant && (
                      <span
                        className="inline-flex items-center gap-2 rounded-full bg-background/70 px-2.5 py-1 text-[12px]"
                        style={{ color: "hsl(var(--claude-ink-muted))" }}
                      >
                        <Loader2
                          className="h-3.5 w-3.5 animate-spin"
                          style={{ color: "hsl(var(--claude-accent))" }}
                        />
                        {t("ai.thinking")}
                      </span>
                    )}
                    {/* 已经在流式输出过程中：在文本末尾追加一个跳动的小光标 */}
                    {m.content && isLastAssistant && (
                      <span
                        className="ml-0.5 inline-block h-[14px] w-[2px] animate-pulse align-middle"
                        style={{ backgroundColor: "hsl(var(--claude-accent))" }}
                        aria-hidden
                      />
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("ai.placeholder")}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={loading}
          />
          {loading ? (
            <Button variant="outline" onClick={stop} className="gap-2">
              <Square className="h-4 w-4" /> {t("cleaner.stop")}
            </Button>
          ) : (
            <Button onClick={() => send()} className="gap-2">
              <Send className="h-4 w-4" /> {t("ai.send")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
