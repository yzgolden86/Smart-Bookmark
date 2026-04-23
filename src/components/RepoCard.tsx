import { Star, GitFork, ExternalLink, Bookmark, Copy } from "lucide-react";
import type { TrendingRepo } from "@/types";
import { cn } from "@/lib/utils";
import { langColor } from "@/lib/github";
import { useT } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";

interface Props {
  repo: TrendingRepo;
  compact?: boolean;
  bookmarkFolderId?: string;
}

function formatK(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export default function RepoCard({ repo, compact, bookmarkFolderId }: Props) {
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

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
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
