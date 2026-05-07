import type { Settings } from "@/types";

const KEY = "smart-bookmark::settings";

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  accentPreset: "linear",
  themePreset: "default",
  rootFolderId: undefined,
  wallpaper: undefined,
  searchEngine: "google",
  aiProvider: "none",
  aiModel: "gpt-4o-mini",
  aiApiKey: "",
  aiBaseUrl: "",
  cardDensity: "comfy",
  language: "auto",
  floatingBall: false,
  floatingDisabledDomains: [],
  compareEngines: ["google", "bing", "duckduckgo"],
  customEngines: [],
  expandedFolders: [],
  pinnedFolderIds: [],
  githubToken: "",
  discoverDefaultRange: "weekly",
  discoverDefaultMode: "created",
  discoverDefaultLanguage: "",
  fontScale: 1,
  sidebarWidth: 280,
  bookmarkAnimation: true,
  wallpaperOpacity: 1,
  bookmarkOpenMode: "newtab",
  webdav: { url: "", username: "", password: "", folder: "/smart-bookmark/" },
  quickLinks: [
    { id: "1", title: "百度", url: "https://www.baidu.com" },
    { id: "2", title: "必应", url: "https://www.bing.com" },
    { id: "3", title: "知乎", url: "https://www.zhihu.com" },
    { id: "4", title: "微博", url: "https://weibo.com" },
    { id: "5", title: "哔哩哔哩", url: "https://www.bilibili.com" },
    { id: "6", title: "网易新闻", url: "https://news.163.com" },
    { id: "7", title: "豆瓣", url: "https://www.douban.com" },
    { id: "8", title: "腾讯新闻", url: "https://news.qq.com" },
  ],
  toolLinks: [
    {
      id: "1",
      title: "tokennav.cc",
      url: "https://tokennav.cc",
      tag: "Token 比价",
      description: "API 中转服务比价入口",
    },
    {
      id: "2",
      title: "aibijia.org",
      url: "https://aibijia.org",
      tag: "Token 比价",
      description: "API 中转比价参考",
    },
    {
      id: "3",
      title: "HelpAIO Transit",
      url: "https://www.helpaio.com/transit",
      tag: "AI 中转合集",
      description: "AI API 中转站合集",
    },
    {
      id: "4",
      title: "LDOH 公益站",
      url: "https://ldoh.105117.xyz/",
      tag: "公益站导航",
      description: "AI 公益站与免费体验资源",
    },
    {
      id: "5",
      title: "wallhaven.cc",
      url: "https://wallhaven.cc/",
      tag: "图片素材",
      description: "高质量壁纸和图片素材",
    },
    {
      id: "6",
      title: "greenvideo.cc",
      url: "https://greenvideo.cc",
      tag: "视频检索",
      description: "视频资源检索入口",
    },
    {
      id: "7",
      title: "seedhub.cc",
      url: "https://seedhub.cc",
      tag: "影视索引",
      description: "影视资源索引入口",
    },
    {
      id: "8",
      title: "flacdownloader.com",
      url: "https://flacdownloader.com",
      tag: "无损音乐",
      description: "FLAC 音乐资源检索",
    },
  ],
};

const hasChromeStorage = typeof chrome !== "undefined" && !!chrome.storage?.local;

export async function getSettings(): Promise<Settings> {
  if (!hasChromeStorage) {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  }
  const { [KEY]: saved } = await chrome.storage.local.get(KEY);
  return { ...DEFAULT_SETTINGS, ...(saved ?? {}) };
}

export async function setSettings(next: Partial<Settings>): Promise<Settings> {
  const prev = await getSettings();
  const merged: Settings = { ...prev, ...next };
  if (hasChromeStorage) {
    await chrome.storage.local.set({ [KEY]: merged });
  } else {
    localStorage.setItem(KEY, JSON.stringify(merged));
  }
  return merged;
}

export function onSettingsChange(handler: (s: Settings) => void): () => void {
  if (!hasChromeStorage) return () => {};
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === "local" && changes[KEY]) {
      handler({ ...DEFAULT_SETTINGS, ...(changes[KEY].newValue ?? {}) });
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
