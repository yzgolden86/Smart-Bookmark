import type { TrendingMode, TrendingRange, TrendingRepo } from "@/types";

const CACHE_KEY = "smart-bookmark::github-trending-cache";
const CACHE_TTL_MS = 60 * 60 * 1000;

/** 每个仓库的历史 star 快照，用于计算「自上次快照以来的 star 增量」 */
const SNAPSHOT_KEY = "smart-bookmark::github-repo-snapshots";
/** 仅当上次快照的年龄 ≥ 此阈值时才展示 delta（避免频繁刷新时显示无意义的 +0） */
const SNAPSHOT_MIN_AGE_MS = 30 * 60 * 1000;
/** 超过此年龄的快照会被重置，避免无限增长 */
const SNAPSHOT_PRUNE_MS = 30 * 24 * 60 * 60 * 1000;

interface CacheEntry {
  at: number;
  data: TrendingRepo[];
}
type CacheMap = Record<string, CacheEntry>;

interface RepoSnapshot {
  stars: number;
  at: number;
}
type SnapshotMap = Record<string, RepoSnapshot>;

const hasStorage =
  typeof chrome !== "undefined" && !!chrome.storage?.local;

async function readCache(): Promise<CacheMap> {
  if (!hasStorage) {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? (JSON.parse(raw) as CacheMap) : {};
    } catch {
      return {};
    }
  }
  const { [CACHE_KEY]: saved } = await chrome.storage.local.get(CACHE_KEY);
  return (saved as CacheMap) ?? {};
}

async function writeCache(next: CacheMap): Promise<void> {
  if (!hasStorage) {
    localStorage.setItem(CACHE_KEY, JSON.stringify(next));
    return;
  }
  await chrome.storage.local.set({ [CACHE_KEY]: next });
}

async function readSnapshots(): Promise<SnapshotMap> {
  if (!hasStorage) {
    try {
      const raw = localStorage.getItem(SNAPSHOT_KEY);
      return raw ? (JSON.parse(raw) as SnapshotMap) : {};
    } catch {
      return {};
    }
  }
  const { [SNAPSHOT_KEY]: saved } =
    await chrome.storage.local.get(SNAPSHOT_KEY);
  return (saved as SnapshotMap) ?? {};
}

async function writeSnapshots(next: SnapshotMap): Promise<void> {
  if (!hasStorage) {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(next));
    return;
  }
  await chrome.storage.local.set({ [SNAPSHOT_KEY]: next });
}

/** 时间窗内「新建仓库」的天数，用于 UI 与 Search API。 */
export function rangeToWindowDays(range: TrendingRange): number {
  return range === "daily"
    ? 1
    : range === "weekly"
      ? 7
      : range === "monthly"
        ? 30
        : 365;
}

/** 根据 range 返回 GitHub Search API 用的 created 起始日期（YYYY-MM-DD）。 */
export function rangeToSinceDate(range: TrendingRange, now = new Date()): string {
  const days = rangeToWindowDays(range);
  const d = new Date(now.getTime() - days * 24 * 3600_000);
  return d.toISOString().slice(0, 10);
}

export interface FetchTrendingOptions {
  range: TrendingRange;
  /** 热门模式：created=时间窗内新建，hottest=时间窗内活跃仓库；均按创建以来 star 均速排序 */
  mode?: TrendingMode;
  /** 为空即全部语言。使用 GitHub `language:xxx` 限定词。 */
  language?: string;
  /** 返回数量上限，默认 30，最大 100。 */
  limit?: number;
  /** GitHub Personal Access Token，可选，用于提高限额。 */
  token?: string;
  /** 是否强制刷新（跳过缓存）。 */
  force?: boolean;
  signal?: AbortSignal;
}

/**
 * 缓存 schema 版本前缀。当 TrendingRepo 结构变化时升版本，
 * 以自动无效化老版本的缓存条目。v3: 统一按 starsPerDay 排序。
 */
const CACHE_SCHEMA = "v3";

function buildCacheKey(o: FetchTrendingOptions): string {
  return `${CACHE_SCHEMA}::${o.mode ?? "created"}::${o.range}::${(o.language ?? "").toLowerCase()}::${o.limit ?? 30}`;
}

/** 兼容旧版缓存：若缺少 starsPerDay，从 stars + createdAt 现算补上。 */
function rehydrateRepo(r: TrendingRepo): TrendingRepo {
  if (typeof r.starsPerDay === "number" && Number.isFinite(r.starsPerDay)) {
    return r;
  }
  const createdMs = r.createdAt ? Date.parse(r.createdAt) : NaN;
  const ageDays = Number.isFinite(createdMs)
    ? Math.max(1, (Date.now() - createdMs) / 86_400_000)
    : 1;
  return { ...r, starsPerDay: (r.stars ?? 0) / ageDays };
}

export async function fetchTrending(
  opts: FetchTrendingOptions,
): Promise<TrendingRepo[]> {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  const key = buildCacheKey({ ...opts, limit });

  if (!opts.force) {
    const cache = await readCache();
    const hit = cache[key];
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return hit.data.map(rehydrateRepo);
    }
  }

  const since = rangeToSinceDate(opts.range);
  const mode = opts.mode ?? "created";
  const candidateLimit = Math.min(100, Math.max(limit, 50, limit * 5));
  const qs: string[] = [];
  if (mode === "created") {
    // 时间窗内新建的仓库，先用总 star 拉候选，再按创建以来 star 均速重排。
    qs.push(`created:>${since}`, "stars:>5");
  } else {
    // 时间窗内有推送的仓库（活跃仓库），先拉高 star 候选，再按创建以来 star 均速重排。
    qs.push(`pushed:>${since}`, "stars:>50");
  }
  if (opts.language?.trim()) {
    qs.push(`language:${encodeQueryToken(opts.language.trim())}`);
  }
  const url = new URL("https://api.github.com/search/repositories");
  url.searchParams.set("q", qs.join(" "));
  url.searchParams.set("sort", "stars");
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", String(candidateLimit));

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  const res = await fetch(url.toString(), { headers, signal: opts.signal });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const snippet = text.slice(0, 200);
    if (res.status === 403 && /rate limit/i.test(text)) {
      throw new Error(
        `GitHub 限流（未认证 60/h，已用尽）。到设置里填 Personal Access Token 可提升到 5000/h。`,
      );
    }
    throw new Error(`GitHub ${res.status}: ${snippet}`);
  }
  const json = (await res.json()) as { items?: RawGithubRepo[] };
  let data: TrendingRepo[] = (json.items ?? []).map(normalizeRepo);

  // 统一用卡片展示的速度指标排序，避免「排名第一但 ★/天 很低」的口径错位。
  data.sort(compareByStarsPerDay);
  data = data.slice(0, limit);

  await applyDeltaFromSnapshots(data);

  const cache = await readCache();
  cache[key] = { at: Date.now(), data };
  await writeCache(cache);

  return data;
}

function compareByStarsPerDay(a: TrendingRepo, b: TrendingRepo): number {
  const byVelocity = (b.starsPerDay ?? 0) - (a.starsPerDay ?? 0);
  if (byVelocity !== 0) return byVelocity;
  return b.stars - a.stars;
}

/**
 * 读取上一轮快照 → 为每个仓库计算 star 增量 → 更新并写回快照。
 * 仅对年龄 ≥ SNAPSHOT_MIN_AGE_MS 的快照显示 delta，避免刚刷新又刷新导致的 +0。
 */
async function applyDeltaFromSnapshots(list: TrendingRepo[]): Promise<void> {
  const snapshots = await readSnapshots();
  const now = Date.now();
  const next: SnapshotMap = { ...snapshots };

  for (const repo of list) {
    const key = String(repo.id);
    const prev = snapshots[key];
    if (prev && now - prev.at >= SNAPSHOT_MIN_AGE_MS) {
      const delta = repo.stars - prev.stars;
      if (delta > 0) {
        repo.starsDelta = { stars: delta, sinceMs: now - prev.at };
      }
    }
    next[key] = { stars: repo.stars, at: now };
  }

  // 清理长期未出现的快照，避免 storage 无限膨胀
  for (const k of Object.keys(next)) {
    if (now - next[k].at > SNAPSHOT_PRUNE_MS) delete next[k];
  }

  await writeSnapshots(next);
}

export async function clearTrendingCache(): Promise<void> {
  if (!hasStorage) {
    localStorage.removeItem(CACHE_KEY);
    return;
  }
  await chrome.storage.local.remove(CACHE_KEY);
}

/** 把 trending 列表渲染成适合塞进 AI prompt 的 Markdown 摘要。 */
export function trendingToMarkdown(
  list: TrendingRepo[],
  meta: { range: TrendingRange; language?: string; mode?: TrendingMode },
): string {
  const rangeLabel = {
    daily: "今日",
    weekly: "本周",
    monthly: "本月",
    yearly: "本年",
  }[meta.range];
  const modeLabel =
    (meta.mode ?? "created") === "hottest" ? "最热门" : "新建";
  const header = `# GitHub ${rangeLabel}${modeLabel}仓库${
    meta.language ? `（${meta.language}）` : ""
  } — 共 ${list.length} 条`;
  const body = list
    .map((r, i) => {
      const desc = r.description ? ` — ${r.description}` : "";
      const lang = r.language ? ` [${r.language}]` : "";
      return `${i + 1}. **${r.fullName}** (★${r.stars})${lang}${desc}\n   ${r.url}`;
    })
    .join("\n");
  return `${header}\n\n${body}`;
}

function encodeQueryToken(s: string): string {
  if (/\s/.test(s)) return `"${s}"`;
  return s;
}

interface RawGithubRepo {
  id: number;
  full_name: string;
  name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  html_url: string;
  created_at: string;
  pushed_at: string;
  topics?: string[];
  owner: { login: string; avatar_url: string };
}

function normalizeRepo(raw: RawGithubRepo): TrendingRepo {
  const stars = raw.stargazers_count ?? 0;
  const createdMs = raw.created_at ? Date.parse(raw.created_at) : NaN;
  const ageDays = Number.isFinite(createdMs)
    ? Math.max(1, (Date.now() - createdMs) / 86_400_000)
    : 1;
  const starsPerDay = stars / ageDays;
  return {
    id: raw.id,
    fullName: raw.full_name,
    owner: raw.owner.login,
    name: raw.name,
    description: raw.description ?? "",
    language: raw.language ?? "",
    stars,
    forks: raw.forks_count ?? 0,
    url: raw.html_url,
    avatar: raw.owner.avatar_url,
    topics: raw.topics ?? [],
    createdAt: raw.created_at,
    pushedAt: raw.pushed_at,
    starsPerDay,
  };
}

/** 常用语言颜色（与 GitHub 官方 linguist 大致对齐，留作 UI 左色边等） */
export const LANG_COLORS: Record<string, string> = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  Python: "#3572A5",
  Go: "#00ADD8",
  Rust: "#dea584",
  Java: "#b07219",
  Kotlin: "#A97BFF",
  Swift: "#F05138",
  "C++": "#f34b7d",
  C: "#555555",
  "C#": "#178600",
  Ruby: "#701516",
  PHP: "#4F5D95",
  Shell: "#89e051",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Vue: "#41b883",
  Svelte: "#ff3e00",
  Dart: "#00B4AB",
  Lua: "#000080",
  Zig: "#ec915c",
  Scala: "#c22d40",
  Haskell: "#5e5086",
  Elixir: "#6e4a7e",
  Solidity: "#AA6746",
};

export function langColor(lang: string): string {
  return LANG_COLORS[lang] || "#8a8f98";
}

/** 提供给 Discover UI 的常用语言下拉选项。 */
export const COMMON_LANGUAGES: string[] = [
  "JavaScript",
  "TypeScript",
  "Python",
  "Go",
  "Rust",
  "Java",
  "Kotlin",
  "Swift",
  "C++",
  "C",
  "C#",
  "Ruby",
  "PHP",
  "Shell",
  "HTML",
  "CSS",
  "Vue",
  "Svelte",
  "Dart",
  "Lua",
  "Zig",
];
