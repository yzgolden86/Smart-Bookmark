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

export interface CustomEngine {
  id: string;
  name: string;
  url: string;
  icon?: string;
}

export interface Settings {
  theme: "system" | "light" | "dark";
  accentPreset: AccentPreset;
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
  /** Discover 页默认语言（空=全部） */
  discoverDefaultLanguage?: string;
}

export type TrendingRange = "daily" | "weekly" | "monthly" | "yearly";

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
}

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
  /** 客户端消息时间戳（不发给 API） */
  at?: number;
}
