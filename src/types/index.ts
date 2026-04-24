export type BookmarkNode = chrome.bookmarks.BookmarkTreeNode;

export interface FlatBookmark {
  id: string;
  parentId?: string;
  title: string;
  url: string;
  path: string;
  dateAdded?: number;
}

export interface FolderStat {
  id: string;
  title: string;
  path: string;
  count: number;
}

export type IssueKind = "invalid" | "duplicate" | "empty-folder" | "broken-url";

export interface CleanIssue {
  id: string;
  kind: IssueKind;
  title: string;
  detail: string;
  bookmark?: FlatBookmark;
  folderId?: string;
  group?: string;
}

export type SearchEngineId =
  | "google"
  | "bing"
  | "duckduckgo"
  | "baidu"
  | "github"
  | "stackoverflow"
  | "youtube"
  | "mdn";

export type Language = "auto" | "zh" | "en";

/** 主色/强调色（影响 primary、ring 等） */
export type AccentPreset =
  | "linear"
  | "indigo"
  | "blue"
  | "emerald"
  | "rose"
  | "amber"
  | "violet"
  | "cyan"
  | "orange";

/**
 * 设计主题预设（theme preset）。
 *
 * 叠加在 light/dark 模式之上，每个预设是一套协调的
 * 令牌（主色 / 圆角 / 字体 / 表面色）。与 {@link AccentPreset}
 * 并存：选择非 `default` 的 themePreset 时会覆盖 accentPreset
 * 的主色。详见 `src/lib/themePresets.ts`。
 */
export type ThemePreset =
  | "default"
  | "claude"
  | "linear"
  | "apple"
  | "stripe"
  | "ibm"
  | "meta"
  | "vercel"
  | "sunset"
  | "forest";

export interface CustomEngine {
  id: string;
  name: string;
  url: string;
  icon?: string;
}

export interface Settings {
  theme: "system" | "light" | "dark";
  accentPreset: AccentPreset;
  /** 设计主题预设。非 `default` 时会覆盖 accentPreset 的主色。 */
  themePreset: ThemePreset;
  rootFolderId?: string;
  wallpaper?: string;
  searchEngine: string;
  aiProvider: "openai" | "anthropic" | "none";
  aiModel: string;
  aiApiKey: string;
  aiBaseUrl: string;
  cardDensity: "comfy" | "compact";
  language: Language;
  floatingBall: boolean;
  /** 禁用悬浮球的域名列表（域名级禁用） */
  floatingDisabledDomains: string[];
  compareEngines: string[];
  customEngines: CustomEngine[];
  expandedFolders: string[];
  pinnedFolderIds: string[];
  /** GitHub Personal Access Token（用于 Discover 拉 trending 提高配额） */
  githubToken?: string;
  /** Discover 页默认时段 */
  discoverDefaultRange?: TrendingRange;
  /** Discover 页默认模式（created=新建仓库, hottest=近期活跃仓库） */
  discoverDefaultMode?: TrendingMode;
  /** Discover 页默认语言（空=全部） */
  discoverDefaultLanguage?: string;
}

export type TrendingRange = "daily" | "weekly" | "monthly" | "yearly";

/** 热门模式：created = 时间窗内新建的仓库；hottest = 时间窗内活跃的仓库 */
export type TrendingMode = "created" | "hottest";

export interface TrendingRepo {
  id: number;
  fullName: string;
  owner: string;
  name: string;
  description: string;
  language: string;
  stars: number;
  forks: number;
  url: string;
  avatar: string;
  topics: string[];
  createdAt: string;
  pushedAt: string;
  /** 平均每天新增 stars（= stars / 自创建以来的天数） */
  starsPerDay: number;
  /** 距上次本地快照以来的 star 变化量，仅当存在历史快照时存在 */
  starsDelta?: {
    stars: number;
    /** 距上次快照的毫秒数 */
    sinceMs: number;
  };
}

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
  /** 客户端消息时间戳（不发给 API） */
  at?: number;
}
