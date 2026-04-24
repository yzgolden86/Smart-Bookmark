import {
  Star,
  GitFork,
  ExternalLink,
  Bookmark,
  Copy,
  TrendingUp,
} from "lucide-react";
import type { TrendingRepo } from "@/types";
import { cn } from "@/lib/utils";
import { langColor } from "@/lib/github";
import { useT } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";

interface Props {
  repo: TrendingRepo;
  compact?: boolean;
  bookmarkFolderId?: string;
  /** 在 trending 列表中的排名（1-based），传入后展示徽章。 */
  rank?: number;
}

function formatK(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/**
 * 格式化「每天 star」数字。保证同一列视觉一致：
 * - < 10：保留 1 位小数（给小值一些精度）
 * - 10 ~ 9999：纯整数（不加 k，避免和其他整数并列时格式跳动）
 * - ≥ 10000：k 缩写
 */
function formatVelocity(n: number | undefined | null): string {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return "0";
  if (n < 10) return n.toFixed(1);
  if (n < 10000) return String(Math.round(n));
  if (n < 100000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000)}k`;
}

/** 把「距上次快照的毫秒数」格式化为 m/h/d/mo 短写。 */
function formatShortDuration(ms: number): string {
  const min = ms / 60_000;
  if (min < 60) return `${Math.max(1, Math.round(min))}m`;
  const hr = min / 60;
  if (hr < 24) return `${Math.round(hr)}h`;
  const day = hr / 24;
  if (day < 30) return `${Math.round(day)}d`;
  return `${Math.round(day / 30)}mo`;
}

/** 排名徽章样式：前 3 名金/银/铜渐变填充，其余为中性脑色 */
function rankChipClass(rank: number): string {
  if (rank === 1)
    return "bg-gradient-to-br from-amber-300 via-amber-400 to-amber-500 text-white ring-amber-500/40 shadow-amber-500/30";
  if (rank === 2)
    return "bg-gradient-to-br from-slate-200 via-slate-300 to-slate-400 text-slate-800 ring-slate-400/40 shadow-slate-400/30";
  if (rank === 3)
    return "bg-gradient-to-br from-orange-300 via-orange-400 to-orange-500 text-white ring-orange-500/40 shadow-orange-500/30";
  return "bg-muted text-muted-foreground ring-border";
}

export default function RepoCard({ repo, compact, bookmarkFolderId, rank }: Props) {
  const t = useT();
  const color = langColor(repo.language);

  const onAdd = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (!chrome?.bookmarks?.create) {
        toast("浏览器不支持 bookmarks API", "error");
        return;
      }
      await new Promise<void>((resolve, reject) => {
        chrome.bookmarks.create(
          {
            parentId: bookmarkFolderId,
            title: repo.fullName,
            url: repo.url,
          },
          (n) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (!n) {
              reject(new Error("create returned null"));
            } else {
              resolve();
            }
          },
        );
      });
      toast(t("discover.addedBookmark"), "success");
    } catch (err) {
      toast(
        t("discover.addBookmark") + ": " + ((err as Error)?.message ?? ""),
        "error",
      );
    }
  };

  const onCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(repo.url);
      toast(t("common.copied"), "success");
    } catch {
      toast("Copy failed", "error");
    }
  };

  return (
    <a
      href={repo.url}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border bg-card p-4 shadow-sm transition-all duration-200 ease-out",
        "hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md",
        compact && "p-3",
      )}
      style={
        {
          borderLeft: `3px solid ${color}`,
        } as React.CSSProperties
      }
      title={repo.description || repo.fullName}
    >
      <div className="flex items-start gap-3">
        {rank != null && (
          <div
            className={cn(
              "mt-0.5 inline-flex h-8 min-w-[28px] flex-shrink-0 items-center justify-center rounded-md px-1.5 text-[11px] font-bold tabular-nums ring-1 shadow-sm",
              rankChipClass(rank),
            )}
            title={t("discover.rank.hint", String(rank))}
            aria-label={t("discover.rank.hint", String(rank))}
          >
            {rank <= 99 ? `#${rank}` : rank}
          </div>
        )}
        <img
          src={repo.avatar}
          alt=""
          className="mt-0.5 h-8 w-8 flex-shrink-0 rounded-md ring-1 ring-border"
          loading="lazy"
        />
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-[15px] font-semibold tracking-tight"
            title={repo.fullName}
          >
            <span className="text-muted-foreground">{repo.owner}</span>
            <span className="mx-1 text-muted-foreground/60">/</span>
            <span className="text-primary">{repo.name}</span>
          </div>
          {repo.description && !compact && (
            <div
              className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground"
            >
              {repo.description}
            </div>
          )}
        </div>
      </div>

      <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-0.5 rounded-md bg-card/80 opacity-0 shadow-sm ring-1 ring-border/50 backdrop-blur transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100">
        <button
          type="button"
          onClick={onAdd}
          title={t("discover.addBookmark")}
          aria-label={t("discover.addBookmark")}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          <Bookmark className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onCopy}
          title={t("discover.copy")}
          aria-label={t("discover.copy")}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <span
          title={t("discover.open")}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-muted-foreground">
        <span
          className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 font-semibold text-primary ring-1 ring-primary/20"
          title={t("discover.velocity.hint")}
          aria-label={t("discover.velocity.hint")}
        >
          <TrendingUp className="h-3 w-3" />
          {t("discover.velocity", formatVelocity(repo.starsPerDay))}
        </span>
        {repo.starsDelta && repo.starsDelta.stars > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 font-semibold text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400"
            title={t(
              "discover.gained.hint",
              String(repo.starsDelta.stars),
              formatShortDuration(repo.starsDelta.sinceMs),
            )}
          >
            +{formatK(repo.starsDelta.stars)}
            <Star className="h-2.5 w-2.5 fill-current" />
            <span className="text-[10px] font-medium opacity-80">
              {formatShortDuration(repo.starsDelta.sinceMs)}
            </span>
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <Star className="h-3 w-3" /> {formatK(repo.stars)}
        </span>
        <span className="inline-flex items-center gap-1">
          <GitFork className="h-3 w-3" /> {formatK(repo.forks)}
        </span>
        {repo.language && (
          <span className="inline-flex items-center gap-1">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: color }}
            />
            {repo.language}
          </span>
        )}
        {repo.topics?.slice(0, 2).map((t) => (
          <span
            key={t}
            className="rounded-full bg-muted/70 px-1.5 py-px text-[10px] text-muted-foreground/80"
          >
            {t}
          </span>
        ))}
      </div>
    </a>
  );
}
