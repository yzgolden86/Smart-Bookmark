import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  getTree,
  buildIndex,
  flatten,
  moveBookmark,
  removeBookmark,
  removeTree,
  updateBookmark,
  createFolder,
} from "@/lib/bookmarks";
import type { FolderCtxTarget } from "@/components/FolderTree";
import type { BookmarkNode, FlatBookmark, Settings } from "@/types";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn, hostnameOf } from "@/lib/utils";
import CachedFavicon from "@/components/CachedFavicon";
import {
  Search,
  ExternalLink,
  GripVertical,
  MoreHorizontal,
  Pin,
  Folder,
  History as HistoryIcon,
  ChevronRight,
  X,
  Clock,
  AppWindow,
  Shield,
  QrCode,
  Pencil,
  Copy,
  Trash2,
  Bookmark,
} from "lucide-react";
import { setSettings } from "@/lib/storage";
import { useT } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";
import QrDialog from "./QrDialog";
import FolderTree from "@/components/FolderTree";
import EngineSwitcher from "@/components/EngineSwitcher";
import { findEngine } from "@/lib/engines";

interface Props {
  settings: Settings;
  initialQuery?: string;
}

interface FolderBookmark extends FlatBookmark {
  index: number;
}

interface TopSite {
  url: string;
  title: string;
}

interface HistoryHit {
  url: string;
  title: string;
  source: "history" | "bookmark";
}

export default function Dashboard({
  settings,
  initialQuery,
}: Props) {
  const t = useT();
  const [tree, setTree] = useState<BookmarkNode[]>([]);
  const [selected, setSelected] = useState<string>(
    settings.rootFolderId ?? "",
  );
  const [items, setItems] = useState<FolderBookmark[]>([]);
  const [subFolders, setSubFolders] = useState<BookmarkNode[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<
    Array<{ id: string; title: string }>
  >([]);
  const [query, setQuery] = useState(initialQuery ?? "");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<
    | { id: string; url: string; x: number; y: number; title: string; parentId?: string }
    | null
  >(null);
  const [folderCtxMenu, setFolderCtxMenu] = useState<
    | (FolderCtxTarget & { x: number; y: number })
    | null
  >(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<{
    id: string;
    title: string;
    url: string;
    parentId?: string;
  } | null>(null);
  const [topSites, setTopSites] = useState<TopSite[]>([]);
  const [historyHits, setHistoryHits] = useState<HistoryHit[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const [pageSize, setPageSize] = useState<number>(() => {
    const raw = localStorage.getItem("sb_pageSize");
    if (raw === "Infinity") return Infinity;
    const n = Number(raw);
    return [30, 60, 120, 240].includes(n) ? n : 60;
  });
  const [page, setPage] = useState<number>(1);
  const searchWrapRef = useRef<HTMLFormElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  /** 右侧主滚动容器；切换文件夹 / 翻页时把它滚回顶部，避免上一次的滚动位置被继承。 */
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const isMac = useMemo(
    () =>
      typeof navigator !== "undefined" &&
      /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent),
    [],
  );

  const expanded = useMemo(
    () => new Set(settings.expandedFolders ?? []),
    [settings.expandedFolders],
  );
  const pinnedIds = useMemo(
    () => new Set(settings.pinnedFolderIds ?? []),
    [settings.pinnedFolderIds],
  );

  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    const tr = await getTree();
    setTree(tr);
  }, []);

  useEffect(() => {
    reload();
    const debounced = () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = setTimeout(reload, 200);
    };
    chrome.bookmarks?.onChanged?.addListener(debounced);
    chrome.bookmarks?.onCreated?.addListener(debounced);
    chrome.bookmarks?.onRemoved?.addListener(debounced);
    chrome.bookmarks?.onMoved?.addListener(debounced);
    return () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      chrome.bookmarks?.onChanged?.removeListener(debounced);
      chrome.bookmarks?.onCreated?.removeListener(debounced);
      chrome.bookmarks?.onRemoved?.removeListener(debounced);
      chrome.bookmarks?.onMoved?.removeListener(debounced);
    };
  }, [reload]);

  /**
   * 「常用」按访问频次显示，直接用 chrome.topSites.get：
   * 这是 Chrome 内置维护的"最常访问站点"列表，比基于 history 自行打分更稳。
   */
  useEffect(() => {
    chrome.topSites?.get?.((sites) => {
      setTopSites(
        (sites || [])
          .slice(0, 15)
          .map((s) => ({ url: s.url, title: s.title })),
      );
    });
  }, []);

  const treeIndex = useMemo(() => buildIndex(tree), [tree]);

  useEffect(() => {
    if (!tree.length) return;
    if (selected) {
      const folder = treeIndex.nodeMap.get(selected);
      if (!folder || !!folder.url) {
        setItems([]);
        setSubFolders([]);
        setBreadcrumb([]);
        return;
      }
      const subs = (folder.children ?? []).filter((c: BookmarkNode) => !c.url);
      setSubFolders(subs);
      const all = flatten([folder], "");
      setItems(all.map((b: FlatBookmark, i: number) => ({ ...b, index: i })));
      setBreadcrumb(buildBreadcrumb(tree, folder.id));
    } else {
      setItems(treeIndex.flat.map((b: FlatBookmark, i: number) => ({ ...b, index: i })));
      setSubFolders([]);
      setBreadcrumb([]);
    }
  }, [tree, selected, treeIndex]);

  // query 非空 → 始终视为搜索状态（即使浮层关闭，右侧也是过滤结果）。
  const isSearching = !!query.trim();
  const showHero = !selected && !query.trim();
  const shouldShowGroups = !!selected && !isSearching && subFolders.length > 0;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !isSearching) return items;
    return treeIndex.flat.filter(
      (b: FlatBookmark) =>
        b.title.toLowerCase().includes(q) ||
        b.url.toLowerCase().includes(q) ||
        b.path.toLowerCase().includes(q),
    );
  }, [items, query, treeIndex, isSearching]);

  const pageCount = Math.max(
    1,
    pageSize === Infinity ? 1 : Math.ceil(filtered.length / pageSize),
  );

  useEffect(() => {
    setPage(1);
    // 切换文件夹 / 改变查询关键字时，让右侧内容容器滚回顶部。
    // 用 instant 而不是 smooth：刚换层级时若做平滑动画会和入场动画叠加显得卡顿。
    contentScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [selected, query, pageSize]);

  useEffect(() => {
    if (!selected && pageSize === 30) onChangePageSize(60);
  }, [selected, pageSize]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  // page 变化（用户点了下一页 / 跳转）时也滚回顶部。
  useEffect(() => {
    contentScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [page]);

  const pagedItems = useMemo(() => {
    if (shouldShowGroups) return [];
    if (pageSize === Infinity) return filtered;
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize, shouldShowGroups]);

  const groupedFolders = useMemo(() => {
    if (!shouldShowGroups) return [];
    return subFolders.map((folder) => ({
      id: folder.id,
      title: folder.title || "(未命名)",
      count: treeIndex.countMap.get(folder.id) ?? 0,
      // 大屏（2xl）每行 6 个，至少给 3 行预览，保证最大化≥5；其余视区由 CSS 自适应裁切。
      items: flatten([folder], "").slice(0, 18),
    }));
  }, [shouldShowGroups, subFolders, treeIndex]);

  const onChangePageSize = (n: number) => {
    setPageSize(n);
    localStorage.setItem(
      "sb_pageSize",
      n === Infinity ? "Infinity" : String(n),
    );
  };

  const onSelectFolder = async (id: string) => {
    setSearchFocused(false);
    setQuery("");
    setSelected(id);
    await setSettings({ rootFolderId: id || undefined });
  };

  const onToggleExpand = async (id: string) => {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    await setSettings({ expandedFolders: [...next] });
  };

  const onTogglePin = async (id: string) => {
    const next = new Set(pinnedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    await setSettings({ pinnedFolderIds: [...next] });
  };

  const onChangeEngine = async (id: string) => {
    await setSettings({ searchEngine: id });
  };

  const onSubmitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    // 用户期望：提交即网络搜索，不再"自动打开第一个书签"。
    // 书签命中已经显示在浮层中，需要打开请直接点对应条目。
    const engine = findEngine(settings, settings.searchEngine);
    if (engine) window.open(engine.url(q), "_blank");
  };

  const canReorder = !!selected && !query.trim() && items.length > 0;

  const onDragStart = (e: React.DragEvent, id: string) => {
    if (!canReorder) return;
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    document.body.style.cursor = "grabbing";
  };
  const onDragOver = (e: React.DragEvent, id: string) => {
    if (!canReorder || !dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOverId(id);
  };
  const onDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!canReorder || !dragId || dragId === targetId) {
      setDragId(null);
      setOverId(null);
      return;
    }
    const src = items.find((i) => i.id === dragId);
    const tgt = items.find((i) => i.id === targetId);
    if (!src || !tgt || src.parentId !== tgt.parentId) {
      setDragId(null);
      setOverId(null);
      return;
    }
    const siblingIds = items
      .filter((x) => x.parentId === tgt.parentId)
      .map((x) => x.id);
    const srcIdx = siblingIds.indexOf(dragId);
    const dstIdx = siblingIds.indexOf(targetId);
    const nextAll = [...items];
    const srcInAll = nextAll.findIndex((x) => x.id === dragId);
    const [moved] = nextAll.splice(srcInAll, 1);
    const dstInAll = nextAll.findIndex((x) => x.id === targetId);
    nextAll.splice(dstInAll, 0, moved);
    setItems(nextAll.map((x, i) => ({ ...x, index: i })));
    try {
      if (src.parentId) {
        await moveBookmark(dragId, src.parentId, dstIdx);
      }
    } catch (err) {
      console.warn("reorder failed", err, srcIdx, dstIdx);
      toast("排序失败", "error");
      reload();
    } finally {
      setDragId(null);
      setOverId(null);
    }
  };

  const closeCtx = useCallback(() => setCtxMenu(null), []);
  useEffect(() => {
    if (!ctxMenu) return;
    const fn = () => closeCtx();
    window.addEventListener("click", fn);
    window.addEventListener("resize", fn);
    return () => {
      window.removeEventListener("click", fn);
      window.removeEventListener("resize", fn);
    };
  }, [ctxMenu, closeCtx]);

  useEffect(() => {
    if (!folderCtxMenu) return;
    const fn = () => setFolderCtxMenu(null);
    window.addEventListener("click", fn);
    window.addEventListener("resize", fn);
    return () => {
      window.removeEventListener("click", fn);
      window.removeEventListener("resize", fn);
    };
  }, [folderCtxMenu]);

  useEffect(() => {
    if (!searchFocused) return;
    const q = query.trim();
    if (!q) {
      chrome.history?.search?.(
        { text: "", maxResults: 30, startTime: Date.now() - 7 * 86400e3 },
        (res) => {
          setHistoryHits(
            (res || [])
              .filter((x) => x.url)
              .slice(0, 30)
              .map((x) => ({
                url: x.url!,
                title: x.title || x.url!,
                source: "history" as const,
              })),
          );
        },
      );
      return;
    }
    chrome.history?.search?.(
      { text: q, maxResults: 50 },
      (res) => {
        setHistoryHits(
          (res || [])
            .filter((x) => x.url)
            .slice(0, 30)
            .map((x) => ({
              url: x.url!,
              title: x.title || x.url!,
              source: "history" as const,
            })),
        );
      },
    );
  }, [query, searchFocused]);

  useEffect(() => {
    if (!searchFocused) return;
    const close = (e: MouseEvent) => {
      if (!searchWrapRef.current) return;
      if (searchWrapRef.current.contains(e.target as Node)) return;
      // 点击搜索区域之外：仅关闭浮层，不清除查询；右侧依然按 query 过滤。
      setSearchFocused(false);
    };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [searchFocused]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isTyping =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (target?.isContentEditable ?? false);
      const meta = isMac ? e.metaKey : e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        setSearchFocused(true);
        return;
      }
      if (!isTyping && e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
        setSearchFocused(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMac]);

  const folderBookmarks = useCallback((folderId: string) => {
    const folder = treeIndex.nodeMap.get(folderId);
    if (!folder || folder.url) return [] as FlatBookmark[];
    return flatten([folder], "");
  }, [treeIndex]);

  const openFolderBookmarks = useCallback((folderId: string, mode: "tab" | "window" | "incognito") => {
    const urls = folderBookmarks(folderId).map((b) => b.url);
    if (!urls.length) return;
    if (mode === "tab") {
      for (const url of urls) window.open(url, "_blank");
      return;
    }
    chrome.windows?.create?.({ url: urls, incognito: mode === "incognito" });
  }, [folderBookmarks]);

  const addFolder = useCallback(async (parentId: string) => {
    const folder = await createFolder(parentId, "新建文件夹");
    if (folder?.id) {
      await setSettings({ expandedFolders: Array.from(new Set([...expanded, parentId])) });
      setEditingFolderId(folder.id);
      toast("已添加文件夹", "success");
    }
  }, [expanded]);

  const renameFolder = useCallback(async (id: string, title: string) => {
    const next = window.prompt("文件夹名称", title);
    if (!next?.trim() || next.trim() === title) return;
    await updateBookmark(id, next.trim());
    toast("已重命名", "success");
  }, []);

  const deleteFolder = useCallback(async (id: string) => {
    if (!window.confirm("确定删除该文件夹及其中所有书签吗？此操作不可撤销。")) return;
    await removeTree(id);
    toast("已删除文件夹", "success");
  }, []);

  const pinnedFolders = useMemo(() => {
    const ids = Array.from(pinnedIds);
    return ids
      .map((id) => treeIndex.nodeMap.get(id))
      .filter((n): n is BookmarkNode => !!n && !n.url);
  }, [pinnedIds, treeIndex]);

  /**
   * 统一打开链接的助手：
   * - 鼠标中键（button === 1，由 onAuxClick / onMouseDown 触发）→ 新标签页打开但保持当前页（与浏览器行为一致）；
   * - 左键（button === 0）：尊重设置 `bookmarkOpenMode`（默认 newtab）；按住 Ctrl/⌘/Shift 始终新标签页；
   * - 右键不在这里处理，由 onContextMenu 承担。
   *
   * 这样 <a target="_blank"> 与 settings.bookmarkOpenMode 之间的冲突就消除了。
   */
  const openBookmark = useCallback(
    (url: string, e?: React.MouseEvent) => {
      if (!url) return;
      const wantNewTab =
        !!e &&
        (e.button === 1 ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey);
      const mode = settings.bookmarkOpenMode ?? "newtab";
      if (wantNewTab || mode === "newtab") {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        window.location.href = url;
      }
    },
    [settings.bookmarkOpenMode],
  );

  /**
   * 统一拦截 onAuxClick：很多浏览器在 onAuxClick(button=1) 上才能稳定捕获中键。
   * 注意 React 的合成事件支持 onAuxClick；onMouseDown(button=1) 也会触发，
   * 但浏览器有时会同步打开"自动滚动模式"，所以 preventDefault。
   */
  const onBookmarkAuxClick = useCallback(
    (e: React.MouseEvent, url: string) => {
      if (e.button !== 1) return;
      e.preventDefault();
      window.open(url, "_blank", "noopener,noreferrer");
    },
    [],
  );
  const onBookmarkMouseDown = useCallback((e: React.MouseEvent) => {
    // 阻止中键触发自动滚动光标
    if (e.button === 1) e.preventDefault();
  }, []);

  const greeting = useGreeting();
  const animationOn = settings.bookmarkAnimation !== false;

  /**
   * 左侧导航栏宽度由「设置 → sidebarWidth」持久化，但日常通过分隔条拖拽即时调节。
   * 拖拽过程中只更新本地 state，松手时再写回 settings，避免每帧都触发 storage 写入。
   */
  const [sidebarWidth, setSidebarWidth] = useState<number>(
    settings.sidebarWidth ?? 280,
  );
  useEffect(() => {
    setSidebarWidth(settings.sidebarWidth ?? 280);
  }, [settings.sidebarWidth]);
  const draggingRef = useRef(false);

  /** 边界限制：220 ~ 520 px，且不超过视口的 60%，以免把右侧挤成无法显示。 */
  const clampSidebar = (w: number) => {
    const max = Math.min(520, Math.round(window.innerWidth * 0.6));
    return Math.max(220, Math.min(max, Math.round(w)));
  };

  const onSplitterMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const move = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      // 用相对位置（相对窗口左侧）计算新宽度——比起 dx 累加更稳，刷新页面尺寸后也仍然准确。
      setSidebarWidth(clampSidebar(ev.clientX - 24 /* 容器内边距近似补偿 */));
    };
    const up = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      // 拖拽结束才落库
      setSidebarWidth((w) => {
        const next = clampSidebar(w);
        setSettings({ sidebarWidth: next });
        return next;
      });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <div className="flex h-full min-h-0 gap-0 overflow-hidden">
      <aside
        className="flex min-h-0 shrink-0 flex-col gap-3"
        style={{ width: sidebarWidth }}
      >
        {pinnedFolders.length > 0 && (
          <Card className="p-2">
            <div className="mb-1 flex items-center gap-2 px-1 text-xs font-medium text-muted-foreground">
              <Pin className="h-3.5 w-3.5" /> 置顶
            </div>
            <div className="space-y-0.5 text-sm">
              {pinnedFolders.map((f) => (
                <button
                  key={f.id}
                  onClick={() => onSelectFolder(f.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-accent",
                    selected === f.id && "bg-accent",
                  )}
                >
                  <span className="h-2 w-2 rounded-full bg-gradient-to-br from-blue-500 to-fuchsia-500" />
                  <span className="flex-1 truncate">{f.title}</span>
                </button>
              ))}
            </div>
          </Card>
        )}
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden p-2">
          <div className="mb-1 px-1 text-xs font-medium text-muted-foreground">
            {t("dash.folders")}
          </div>
          <div className="scroll-area min-h-0 flex-1 overflow-auto pr-1 scrollbar-thin">
            <FolderTree
              tree={tree}
              selectedId={selected}
              expanded={expanded}
              pinnedIds={pinnedIds}
              countMap={treeIndex.countMap}
              onToggle={onToggleExpand}
              onSelect={(id) => onSelectFolder(id)}
              onTogglePin={onTogglePin}
              editingId={editingFolderId}
              onRename={(id, title) => {
                updateBookmark(id, title)
                  .then(() => toast("已重命名", "success"))
                  .catch(() => toast("重命名失败", "error"))
                  .finally(() => setEditingFolderId(null));
              }}
              onCancelEdit={() => setEditingFolderId(null)}
              onContextMenu={(folder, x, y) => setFolderCtxMenu({ ...folder, x, y })}
            />
          </div>
        </Card>
      </aside>

      <div
        role="separator"
        aria-label="拖动以调整书签导航宽度"
        title="拖动以调整书签导航宽度"
        onMouseDown={onSplitterMouseDown}
        onDoubleClick={() => {
          const next = clampSidebar(280);
          setSidebarWidth(next);
          setSettings({ sidebarWidth: next });
        }}
        className="group relative mx-2 flex w-1 shrink-0 cursor-col-resize items-center justify-center"
      >
        <span className="absolute inset-y-2 left-1/2 w-px -translate-x-1/2 rounded-full bg-border/70 transition group-hover:bg-primary/60" />
        <span className="absolute left-1/2 top-1/2 h-9 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-border/0 transition group-hover:bg-primary/40" />
      </div>

      <section className="flex min-w-0 flex-1 flex-col">
        {showHero && (
          <div className="mb-2 pt-4 text-center">
            <div className="text-2xl font-semibold tracking-tight text-foreground/90">
              {greeting} <span className="ml-1">👋</span>
            </div>
          </div>
        )}

        <form
          onSubmit={onSubmitSearch}
          className={cn(
            "sticky top-0 z-10 mx-auto w-full max-w-3xl pb-3",
            showHero ? "" : "max-w-none",
          )}
          ref={searchWrapRef}
        >
          <div
            className={cn(
              "group/search relative flex items-center gap-1.5 rounded-2xl border bg-card pl-1.5 pr-1.5 shadow-sm transition-all duration-200",
              "focus-within:border-primary/40 focus-within:shadow-md focus-within:ring-2 focus-within:ring-primary/20",
            )}
          >
            <EngineSwitcher
              settings={settings}
              value={settings.searchEngine}
              onChange={onChangeEngine}
            />
            <span
              aria-hidden
              className="h-5 w-px bg-border/80"
            />
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (e.target.value) setSearchFocused(true);
                }}
                onClick={() => setSearchFocused(true)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    if (query) {
                      setQuery("");
                    } else {
                      setSearchFocused(false);
                      searchInputRef.current?.blur();
                    }
                    return;
                  }
                  if (
                    e.key === "Enter" &&
                    (e.metaKey || e.ctrlKey) &&
                    query.trim()
                  ) {
                    e.preventDefault();
                    const qq = query.trim();
                    for (const id of settings.compareEngines) {
                      const eng = findEngine(settings, id);
                      if (eng) window.open(eng.url(qq), "_blank");
                    }
                    return;
                  }
                  if (!searchFocused) setSearchFocused(true);
                }}
                placeholder={t("dash.searchPlaceholder")}
                className="h-11 border-0 bg-transparent pl-8 pr-1 shadow-none focus-visible:ring-0"
              />
            </div>
            {query && (
              <button
                type="button"
                aria-label={t("dash.searchClear")}
                title={t("dash.searchClear")}
                onClick={() => {
                  setQuery("");
                  searchInputRef.current?.focus();
                }}
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            {!query && (
              <kbd
                aria-hidden
                className="pointer-events-none hidden select-none items-center gap-1 rounded-md border bg-muted/60 px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-muted-foreground shadow-sm sm:inline-flex"
              >
                <span className="text-[11px] leading-none">
                  {isMac ? "⌘" : "Ctrl"}
                </span>
                <span className="leading-none">K</span>
              </kbd>
            )}
            <Button
              type="submit"
              className="ml-1 h-9 w-9 rounded-xl p-0 sm:w-auto sm:px-4"
              variant="default"
              aria-label={t("common.search")}
              title={t("common.search")}
            >
              <Search className="h-4 w-4 sm:hidden" />
              <span className="hidden sm:inline">{t("common.search")}</span>
            </Button>
          </div>

          {searchFocused && (filtered.length > 0 || historyHits.length > 0) && (
            <div className="relative">
              <div className="absolute inset-x-0 top-2 z-30 mx-auto flex max-h-[60vh] max-w-2xl flex-col overflow-hidden rounded-2xl border bg-white shadow-2xl ring-1 ring-black/5 dark:bg-slate-900 dark:ring-white/10">
                {/* 单一滚动容器：书签、历史共用同一根滚动条，避免出现两段都受限的尴尬。 */}
                <div className="flex-1 overflow-y-auto scrollbar-thin">
                  {/* 书签命中段 */}
                  {query.trim() && filtered.length > 0 && (
                    <div className="flex flex-col">
                      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white/95 px-4 py-2 text-[11px] text-muted-foreground backdrop-blur dark:bg-slate-900/95">
                        <span>
                          <Bookmark className="mr-1 inline h-3 w-3" />
                          书签匹配（{filtered.length}）
                        </span>
                      </div>
                      {filtered.slice(0, 8).map((b) => (
                        <a
                          key={`bm-${b.id}`}
                          href={b.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 border-t bg-white px-4 py-2 text-sm transition hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800"
                        >
                          <CachedFavicon
                            url={b.url}
                            size={16}
                            className="h-4 w-4 rounded"
                          />
                          <span className="flex-1 truncate">{b.title}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {hostnameOf(b.url)}
                          </span>
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                            bookmark
                          </span>
                        </a>
                      ))}
                      {filtered.length > 8 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            // 关闭浮层，右侧已经按 query 过滤，显示完整结果。
                            e.stopPropagation();
                            setSearchFocused(false);
                          }}
                          className="flex items-center justify-center gap-1 border-t bg-white px-4 py-2 text-xs font-medium text-primary transition hover:bg-primary/5 dark:bg-slate-900 dark:hover:bg-primary/10"
                        >
                          查看全部 {filtered.length} 个匹配书签
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* 历史命中段 */}
                  {historyHits.length > 0 && (
                    <div className="flex flex-col">
                      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-t bg-white/95 px-4 py-2 text-[11px] text-muted-foreground backdrop-blur dark:bg-slate-900/95">
                        <span>
                          <HistoryIcon className="mr-1 inline h-3 w-3" />
                          {query.trim() ? "历史匹配" : "最近浏览"}
                        </span>
                      </div>
                      {historyHits.map((h) => (
                        <a
                          key={`hi-${h.url}`}
                          href={h.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 border-t bg-white px-4 py-2 text-sm transition hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800"
                        >
                          <CachedFavicon
                            url={h.url}
                            size={16}
                            className="h-4 w-4 rounded"
                          />
                          <span className="flex-1 truncate">{h.title}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {hostnameOf(h.url)}
                          </span>
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            history
                          </span>
                        </a>
                      ))}
                      {/*
                       * 「查看更多」入口：跳到浏览器自带 chrome://history?q=…，把当前搜索词带过去。
                       * chrome://* 普通 window.open 会被拦截，必须走 chrome.tabs.create。
                       */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const q = query.trim();
                          const url = q
                            ? `chrome://history/?q=${encodeURIComponent(q)}`
                            : "chrome://history/";
                          if (chrome.tabs?.create) {
                            chrome.tabs.create({ url });
                          } else {
                            window.open(url, "_blank");
                          }
                        }}
                        className="flex items-center justify-center gap-1 border-t bg-white px-4 py-2 text-xs font-medium text-primary transition hover:bg-primary/5 dark:bg-slate-900 dark:hover:bg-primary/10"
                      >
                        在浏览历史中查看更多
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </form>

        <div
          ref={contentScrollRef}
          className="scroll-area min-h-0 flex-1 space-y-5 overflow-auto pr-2 pt-2 scrollbar-thin"
        >
        {showHero && topSites.length > 0 && (
          <div>
            <div className="mb-2.5 flex items-center gap-2 px-0.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400/20 via-rose-400/15 to-fuchsia-500/20 text-amber-600 ring-1 ring-amber-400/30 dark:text-amber-300">
                <Clock className="h-3.5 w-3.5" />
              </span>
              <h2 className="bg-gradient-to-r from-foreground via-foreground to-foreground/70 bg-clip-text text-sm font-semibold tracking-tight text-transparent">
                常用
              </h2>
              <span className="text-meta text-muted-foreground">
                · 常去 {Math.min(topSites.length, 15)} 个
              </span>
            </div>
            <div
              className={cn(
                "grid gap-3",
                settings.cardDensity === "compact"
                  ? "grid-cols-3 sm:grid-cols-4 md:grid-cols-5"
                  : "grid-cols-2 sm:grid-cols-3 md:grid-cols-5",
              )}
            >
              {topSites.slice(0, 15).map((s) => (
                <button
                  key={s.url}
                  type="button"
                  onClick={(e) => openBookmark(s.url, e)}
                  onAuxClick={(e) => onBookmarkAuxClick(e, s.url)}
                  onMouseDown={onBookmarkMouseDown}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setCtxMenu({
                      id: `topsite:${s.url}`,
                      url: s.url,
                      title: s.title || hostnameOf(s.url),
                      x: e.clientX,
                      y: e.clientY,
                    });
                  }}
                  className="group flex items-center gap-3 rounded-2xl border border-border/40 bg-card/55 p-3 text-left backdrop-blur-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card/85 hover:shadow-[0_8px_24px_-12px_hsl(var(--primary)/0.25)] hover:ring-1 hover:ring-primary/20"
                  title={s.url}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background/80 ring-1 ring-border/60 transition group-hover:ring-primary/30 group-hover:shadow-sm">
                    <CachedFavicon
                      url={s.url}
                      size={32}
                      className="h-5 w-5"
                    />
                  </div>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground/90 transition group-hover:text-foreground">
                    {s.title || hostnameOf(s.url)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {!showHero && breadcrumb.length > 0 && (
          <nav className="flex items-center gap-1 text-sm text-muted-foreground">
            <button onClick={() => onSelectFolder("")} className="hover:text-foreground">
              全部书签
            </button>
            {breadcrumb.map((b) => (
              <span key={b.id} className="flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5" />
                <button
                  onClick={() => onSelectFolder(b.id)}
                  className="hover:text-foreground"
                >
                  {b.title}
                </button>
              </span>
            ))}
          </nav>
        )}

        {shouldShowGroups && (
          <div
            key={`groups-${selected}`}
            className={cn(
              "space-y-4",
              animationOn && "animate-page-rise",
            )}
          >
            {groupedFolders.map((group) => (
              <Card
                key={group.id}
                className="overflow-hidden border-border/60 bg-card/80"
              >
                <button
                  type="button"
                  onClick={() => onSelectFolder(group.id)}
                  className="flex w-full items-center justify-between gap-3 border-b bg-muted/25 px-4 py-3 text-left transition hover:bg-muted/45"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20 text-primary">
                      <Folder className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{group.title}</div>
                      <div className="text-[11px] text-muted-foreground">
                        共 {group.count} 个书签
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
                {group.items.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                    {group.items.map((b) => (
                      <BookmarkMiniCard
                        key={b.id}
                        bookmark={b}
                        onOpen={(e) => openBookmark(b.url, e)}
                        onAuxOpen={(e) => onBookmarkAuxClick(e, b.url)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setCtxMenu({
                            id: b.id,
                            url: b.url,
                            title: b.title,
                            parentId: b.parentId,
                            x: e.clientX,
                            y: e.clientY,
                          });
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="p-4 text-sm text-muted-foreground">该文件夹暂无书签</div>
                )}
                {group.count > group.items.length && (
                  <div className="border-t px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => onSelectFolder(group.id)}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      查看全部 {group.count} 个
                    </button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        {(showHero || (!subFolders.length && breadcrumb.length === 0)) &&
          !shouldShowGroups &&
          filtered.length > 0 && (
            <div className="flex flex-wrap items-end justify-between gap-2 border-b pb-1.5 pt-2">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20 text-primary">
                  <Folder className="h-3.5 w-3.5" />
                </div>
                <h2 className="text-sm font-semibold tracking-tight">
                  我的书签
                </h2>
                <span className="text-[11px] text-muted-foreground">
                  · 共 {filtered.length} 个
                  {query.trim() ? "（已过滤）" : ""}
                </span>
                {pageSize !== Infinity && filtered.length > pageSize && (
                  <span className="text-[11px] text-muted-foreground/70">
                    · 第 {(page - 1) * pageSize + 1}-
                    {Math.min(page * pageSize, filtered.length)} 条
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {canReorder && (
                  <span className="hidden items-center gap-1 text-[11px] text-muted-foreground sm:inline-flex">
                    <GripVertical className="h-3 w-3" />
                    {t("dash.dragHint")}
                  </span>
                )}
                <PageSizePicker value={pageSize} onChange={onChangePageSize} />
                {pageSize !== Infinity && pageCount > 1 && (
                  <Pager
                    page={page}
                    pageCount={pageCount}
                    onChange={setPage}
                  />
                )}
              </div>
            </div>
          )}

        {canReorder &&
          !(showHero || (!subFolders.length && breadcrumb.length === 0)) && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <GripVertical className="h-3.5 w-3.5" /> {t("dash.dragHint")}
            </div>
          )}

        <div
          key={`page-${selected || "all"}-${page}-${query.trim() || "_"}`}
          className={cn(
            "grid gap-3",
            settings.cardDensity === "compact"
              ? "grid-cols-3 sm:grid-cols-4 md:grid-cols-5"
              : "grid-cols-2 sm:grid-cols-3 md:grid-cols-5",
            animationOn && "animate-page-rise",
          )}
        >
          {pagedItems.map((b) => (
            <div
              key={b.id}
              draggable={canReorder}
              onDragStart={(e) => onDragStart(e, b.id)}
              onDragEnd={() => {
                document.body.style.cursor = "";
                setDragId(null);
                setOverId(null);
              }}
              onDragOver={(e) => onDragOver(e, b.id)}
              onDrop={(e) => onDrop(e, b.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setCtxMenu({
                  id: b.id,
                  url: b.url,
                  title: b.title,
                  parentId: b.parentId,
                  x: e.clientX,
                  y: e.clientY,
                });
              }}
              className={cn(
                "group relative rounded-2xl border border-border/60 bg-card p-3 text-left shadow-[0_1px_0_rgba(0,0,0,0.02)] transition-all duration-200 ease-out",
                "hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_8px_24px_-12px_hsl(var(--primary)/0.25)] hover:ring-1 hover:ring-primary/20",
                canReorder && "cursor-grab",
                dragId === b.id && "cursor-grabbing opacity-50",
                overId === b.id && dragId !== b.id && "ring-2 ring-primary/60",
              )}
              title={b.url}
            >
              <div
                role="link"
                tabIndex={0}
                onClick={(e) => openBookmark(b.url, e)}
                onAuxClick={(e) => onBookmarkAuxClick(e, b.url)}
                onMouseDown={onBookmarkMouseDown}
                onKeyDown={(e) => {
                  if (e.key === "Enter") openBookmark(b.url);
                }}
                className={cn(
                  "flex w-full cursor-pointer flex-col gap-2 px-2",
                  canReorder && "cursor-grab",
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 ring-1 ring-inset ring-black/5 transition-all duration-200 group-hover:ring-primary/30 group-hover:shadow-sm dark:from-slate-800 dark:to-slate-900 dark:ring-white/5">
                    <CachedFavicon
                      url={b.url}
                      size={32}
                      className="h-5 w-5"
                    />
                  </div>
                  <div className="min-w-0 flex-1 truncate text-sm font-medium">
                    {b.title}
                  </div>
                </div>
                <div className="text-meta w-full truncate text-center text-muted-foreground">
                  {hostnameOf(b.url)}
                </div>
              </div>
              <ExternalLink className="absolute right-2 top-2 h-3 w-3 text-muted-foreground opacity-0 transition group-hover:opacity-70" />
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setCtxMenu({
                    id: b.id,
                    url: b.url,
                    title: b.title,
                    x: e.clientX,
                    y: e.clientY,
                  });
                }}
                className="absolute bottom-2 right-2 rounded p-1 text-muted-foreground opacity-0 hover:bg-accent group-hover:opacity-100"
                aria-label="more"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
              {canReorder && (
                <GripVertical className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-60" />
              )}
            </div>
          ))}
          {!filtered.length && !subFolders.length && (
            <div className="col-span-full rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              {t("dash.empty")}
            </div>
          )}
        </div>

        {pageSize !== Infinity &&
          pageCount > 1 &&
          filtered.length > 0 &&
          (showHero || (!subFolders.length && breadcrumb.length === 0)) && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Pager page={page} pageCount={pageCount} onChange={setPage} />
              <span className="text-[11px] text-muted-foreground">
                共 {filtered.length} 条
              </span>
            </div>
          )}
        </div>
      </section>

      {folderCtxMenu && (
        <FolderCtxMenu
          {...folderCtxMenu}
          onOpenTabs={() => {
            openFolderBookmarks(folderCtxMenu.id, "tab");
            setFolderCtxMenu(null);
          }}
          onOpenWindow={() => {
            openFolderBookmarks(folderCtxMenu.id, "window");
            setFolderCtxMenu(null);
          }}
          onOpenIncognito={() => {
            openFolderBookmarks(folderCtxMenu.id, "incognito");
            setFolderCtxMenu(null);
          }}
          onAdd={() => {
            addFolder(folderCtxMenu.id).catch(() => toast("添加失败", "error"));
            setFolderCtxMenu(null);
          }}
          onRename={() => {
            renameFolder(folderCtxMenu.id, folderCtxMenu.title).catch(() => toast("重命名失败", "error"));
            setFolderCtxMenu(null);
          }}
          onDelete={() => {
            deleteFolder(folderCtxMenu.id).catch(() => toast("删除失败", "error"));
            setFolderCtxMenu(null);
          }}
        />
      )}

      {ctxMenu && (
        <BookmarkCtxMenu
          url={ctxMenu.url}
          x={ctxMenu.x}
          y={ctxMenu.y}
          showEditDelete={!ctxMenu.id.startsWith("topsite:")}
          onClose={() => setCtxMenu(null)}
          onQr={() => {
            setQrUrl(ctxMenu.url);
          }}
          onEdit={() => {
            setEditTarget({ id: ctxMenu.id, title: ctxMenu.title, url: ctxMenu.url, parentId: ctxMenu.parentId });
          }}
          onDelete={async () => {
            try {
              await removeBookmark(ctxMenu.id);
              toast("已删除", "success");
            } catch {
              toast("删除失败", "error");
            }
          }}
        />
      )}

      {editTarget && (
        <EditDialog
          id={editTarget.id}
          initTitle={editTarget.title}
          initUrl={editTarget.url}
          initParentId={editTarget.parentId}
          tree={tree}
          onSave={async (id, title, url, parentId) => {
            try {
              await updateBookmark(id, title, url);
              if (parentId && parentId !== editTarget.parentId) {
                await moveBookmark(id, parentId);
              }
              toast("已保存", "success");
            } catch {
              toast("保存失败", "error");
            }
            setEditTarget(null);
          }}
          onClose={() => setEditTarget(null)}
        />
      )}

      {qrUrl && <QrDialog url={qrUrl} onClose={() => setQrUrl(null)} />}
    </div>
  );
}

function buildBreadcrumb(
  tree: BookmarkNode[],
  id: string,
): Array<{ id: string; title: string }> {
  const path: Array<{ id: string; title: string }> = [];
  const walk = (nodes: BookmarkNode[], chain: Array<{ id: string; title: string }>): boolean => {
    for (const n of nodes) {
      if (!n.url) {
        const here = n.title
          ? [...chain, { id: n.id, title: n.title }]
          : chain;
        if (n.id === id) {
          path.push(...here);
          return true;
        }
        if (n.children && walk(n.children, here)) return true;
      }
    }
    return false;
  };
  walk(tree, []);
  return path;
}

function useGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "深夜好";
  if (h < 11) return "早上好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  if (h < 22) return "晚上好";
  return "夜深了";
}

function PageSizePicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const options: Array<{ v: number; label: string }> = [
    { v: 30, label: "30" },
    { v: 60, label: "60" },
    { v: 120, label: "120" },
    { v: 240, label: "240" },
    { v: Infinity, label: "全部" },
  ];
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);
  const current = options.find((o) => o.v === value)?.label ?? String(value);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-accent hover:text-foreground"
        title="每页条数"
      >
        每页 {current}
        <ChevronRight
          className={cn("h-3 w-3 transition-transform", open && "rotate-90")}
        />
      </button>
      {open && (
        <div
          className="absolute right-0 top-8 z-40 w-28 rounded-lg border bg-popover p-1 shadow-xl ring-1 ring-black/5 dark:ring-white/5"
          onClick={(e) => e.stopPropagation()}
        >
          {options.map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => {
                onChange(o.v);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition hover:bg-accent",
                value === o.v && "bg-accent font-medium",
              )}
            >
              <span>{o.label}</span>
              {value === o.v && (
                <span className="text-[10px] text-primary">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 生成现代风格分页的页码序列：[1, "...", 4, 5, 6, "...", 19]
 * 始终显示首末页，当前页±1 作为邻页，其余用 ellipsis 合并。
 */
function buildPageRange(
  current: number,
  total: number,
  neighbor = 1,
): Array<number | "ellipsis-l" | "ellipsis-r"> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const out: Array<number | "ellipsis-l" | "ellipsis-r"> = [];
  const left = Math.max(2, current - neighbor);
  const right = Math.min(total - 1, current + neighbor);
  out.push(1);
  if (left > 2) out.push("ellipsis-l");
  for (let i = left; i <= right; i++) out.push(i);
  if (right < total - 1) out.push("ellipsis-r");
  out.push(total);
  return out;
}

function Pager({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (p: number) => void;
}) {
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpValue, setJumpValue] = useState("");
  const jumpRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!jumpOpen) return;
    const close = (e: MouseEvent) => {
      if (!jumpRef.current) return;
      if (!jumpRef.current.contains(e.target as Node)) setJumpOpen(false);
    };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [jumpOpen]);

  const prev = () => onChange(Math.max(1, page - 1));
  const next = () => onChange(Math.min(pageCount, page + 1));
  const items = buildPageRange(page, pageCount);

  const doJump = () => {
    const n = Number(jumpValue);
    if (Number.isFinite(n) && n >= 1 && n <= pageCount) {
      onChange(Math.floor(n));
      setJumpOpen(false);
      setJumpValue("");
    }
  };

  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        disabled={page <= 1}
        onClick={prev}
        className="flex h-7 w-7 items-center justify-center rounded-md border bg-card text-muted-foreground transition hover:border-primary/30 hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-card disabled:hover:text-muted-foreground"
        aria-label="上一页"
      >
        <ChevronRight className="h-3.5 w-3.5 rotate-180" />
      </button>
      {items.map((it, idx) => {
        if (it === "ellipsis-l" || it === "ellipsis-r") {
          return (
            <div
              key={`${it}-${idx}`}
              ref={it === "ellipsis-r" ? jumpRef : undefined}
              className="relative"
            >
              <button
                type="button"
                onClick={() => {
                  setJumpOpen((v) => !v);
                  setJumpValue("");
                }}
                className="flex h-7 min-w-[28px] items-center justify-center rounded-md text-[12px] text-muted-foreground/80 transition hover:bg-accent hover:text-foreground"
                title="跳转页"
              >
                …
              </button>
              {jumpOpen && it === "ellipsis-r" && (
                <div
                  className="absolute left-1/2 top-9 z-40 -translate-x-1/2 rounded-lg border bg-popover p-2 shadow-xl ring-1 ring-black/5 dark:ring-white/5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      type="number"
                      min={1}
                      max={pageCount}
                      value={jumpValue}
                      onChange={(e) => setJumpValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") doJump();
                        else if (e.key === "Escape") setJumpOpen(false);
                      }}
                      placeholder={`1-${pageCount}`}
                      className="h-7 w-24 rounded-md border bg-background px-2 text-xs tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <button
                      type="button"
                      onClick={doJump}
                      className="h-7 rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground transition hover:opacity-90"
                    >
                      跳转
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        }
        const active = it === page;
        return (
          <button
            key={it}
            type="button"
            onClick={() => onChange(it)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-7 min-w-[28px] items-center justify-center rounded-md px-2 text-[12px] tabular-nums transition",
              active
                ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                : "border bg-card text-muted-foreground hover:border-primary/30 hover:bg-accent hover:text-foreground",
            )}
          >
            {it}
          </button>
        );
      })}
      <button
        type="button"
        disabled={page >= pageCount}
        onClick={next}
        className="flex h-7 w-7 items-center justify-center rounded-md border bg-card text-muted-foreground transition hover:border-primary/30 hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-card disabled:hover:text-muted-foreground"
        aria-label="下一页"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function FolderCtxMenu({
  depth,
  count,
  hasChildren,
  x,
  y,
  onOpenTabs,
  onOpenWindow,
  onOpenIncognito,
  onAdd,
  onRename,
  onDelete,
}: FolderCtxTarget & {
  x: number;
  y: number;
  onOpenTabs: () => void;
  onOpenWindow: () => void;
  onOpenIncognito: () => void;
  onAdd: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 8;
    setPos({
      left: Math.min(x, window.innerWidth - r.width - pad),
      top: Math.min(y, window.innerHeight - r.height - pad),
    });
  }, [x, y]);

  const canOpenAll = depth > 1 && !hasChildren && count > 0;
  const canRenameDelete = depth > 1;

  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      className="fixed z-[60] min-w-[240px] rounded-lg border bg-popover p-1 text-sm shadow-lg"
      style={{ left: pos.left, top: pos.top }}
    >
      {canOpenAll && (
        <>
          <CtxItem icon={<ExternalLink className="h-4 w-4" />} label={`新标签页打开全部（${count}）`} onClick={onOpenTabs} />
          <CtxItem icon={<AppWindow className="h-4 w-4" />} label={`新窗口打开全部（${count}）`} onClick={onOpenWindow} />
          <CtxItem icon={<Shield className="h-4 w-4" />} label={`隐身窗口打开全部（${count}）`} onClick={onOpenIncognito} />
          <div className="my-1 border-t border-border/60" />
        </>
      )}
      <CtxItem icon={<Folder className="h-4 w-4" />} label="添加文件夹" onClick={onAdd} />
      {canRenameDelete && (
        <>
          <CtxItem icon={<Pencil className="h-4 w-4" />} label="重命名" onClick={onRename} />
          <CtxItem icon={<Trash2 className="h-4 w-4" />} label="删除" onClick={onDelete} className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950" />
        </>
      )}
    </div>
  );
}

function BookmarkCtxMenu({
  url,
  x,
  y,
  onQr,
  onEdit,
  onDelete,
  onClose,
  showEditDelete = true,
}: {
  url: string;
  x: number;
  y: number;
  onQr: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /**
   * 关闭菜单的回调。每一项点击后都先关菜单再执行业务。
   * 这样无论用户选哪一项，浮层都会立刻消失，避免菜单残留。
   */
  onClose: () => void;
  /** 「编辑 / 删除」是否可用。常用栏的项不是真书签，应隐藏这两项。 */
  showEditDelete?: boolean;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 8;
    const left = Math.min(x, window.innerWidth - r.width - pad);
    const top = Math.min(y, window.innerHeight - r.height - pad);
    setPos({ left, top });
  }, [x, y]);

  /** 包装：先关菜单再执行业务，保证菜单立刻消失。 */
  const wrap = (fn: () => unknown) => () => {
    onClose();
    Promise.resolve().then(fn);
  };

  const openNewTab = () => window.open(url, "_blank");
  const openNewWindow = () => {
    try { chrome.windows?.create?.({ url }); } catch {}
  };
  const openIncognito = () => {
    try { chrome.windows?.create?.({ url, incognito: true }); } catch {}
  };
  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast(t("common.copied"), "success");
    } catch {}
  };

  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      className="fixed z-[60] min-w-[200px] rounded-lg border bg-popover p-1 text-sm shadow-lg"
      style={{ left: pos.left, top: pos.top }}
    >
      <CtxItem icon={<ExternalLink className="h-4 w-4" />} label="在新标签页打开" onClick={wrap(openNewTab)} />
      <CtxItem icon={<AppWindow className="h-4 w-4" />} label="在新窗口打开" onClick={wrap(openNewWindow)} />
      <CtxItem icon={<Shield className="h-4 w-4" />} label="在隐身窗口打开" onClick={wrap(openIncognito)} />
      <CtxItem icon={<QrCode className="h-4 w-4" />} label="展示二维码" onClick={wrap(onQr)} />
      <div className="my-1 border-t border-border/60" />
      {showEditDelete && (
        <CtxItem icon={<Pencil className="h-4 w-4" />} label="编辑" onClick={wrap(onEdit)} />
      )}
      <CtxItem icon={<Copy className="h-4 w-4" />} label="复制" onClick={wrap(copyUrl)} />
      {showEditDelete && (
        <CtxItem icon={<Trash2 className="h-4 w-4" />} label="删除" onClick={wrap(onDelete)} className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950" />
      )}
    </div>
  );
}

function CtxItem({
  icon,
  label,
  onClick,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      className={cn(
        "flex w-full items-center gap-2.5 rounded px-3 py-1.5 text-left transition hover:bg-accent",
        className,
      )}
      onClick={onClick}
    >
      <span className="text-muted-foreground">{icon}</span>
      {label}
    </button>
  );
}

function BookmarkMiniCard({
  bookmark,
  onContextMenu,
  onOpen,
  onAuxOpen,
}: {
  bookmark: FlatBookmark;
  onContextMenu?: (e: React.MouseEvent) => void;
  /** 左键点击：交由父级根据 settings.bookmarkOpenMode 决定。 */
  onOpen: (e: React.MouseEvent) => void;
  /** 中键点击：始终新标签页。 */
  onAuxOpen: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onAuxClick={onAuxOpen}
      onMouseDown={(e) => {
        if (e.button === 1) e.preventDefault();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(e as unknown as React.MouseEvent);
      }}
      onContextMenu={onContextMenu}
      className="group flex min-w-0 cursor-pointer flex-col gap-1.5 rounded-xl border border-border/50 bg-background/70 p-3 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-primary/30 hover:bg-background hover:shadow-[0_8px_20px_-14px_hsl(var(--primary)/0.3)]"
      title={bookmark.url}
    >
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/60 ring-1 ring-border/60">
          <CachedFavicon
            url={bookmark.url}
            size={24}
            className="h-4 w-4"
          />
        </div>
        <div className="min-w-0 flex-1 truncate text-sm font-medium">
          {bookmark.title}
        </div>
      </div>
      <div className="text-meta w-full truncate text-center text-muted-foreground">
        {hostnameOf(bookmark.url)}
      </div>
    </div>
  );
}

function FolderPicker({
  tree,
  selectedId,
  onSelect,
}: {
  tree: BookmarkNode[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const [folderQuery, setFolderQuery] = useState("");
  const rows = useMemo(() => {
    const out: Array<{ id: string; title: string; path: string; depth: number }> = [];
    const walk = (nodes: BookmarkNode[], depth: number, path: string) => {
      for (const n of nodes) {
        if (n.url) continue;
        const title = n.title || "(未命名)";
        const nextPath = n.id === "0" ? path : path ? `${path} / ${title}` : title;
        if (n.id !== "0") out.push({ id: n.id, title, path: nextPath, depth });
        walk(n.children ?? [], n.id === "0" ? depth : depth + 1, nextPath);
      }
    };
    walk(tree, 0, "");
    return out;
  }, [tree]);

  const visibleRows = useMemo(() => {
    const q = folderQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (f) =>
        f.title.toLowerCase().includes(q) ||
        f.path.toLowerCase().includes(q),
    );
  }, [rows, folderQuery]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={folderQuery}
          onChange={(e) => setFolderQuery(e.target.value)}
          placeholder="搜索文件夹"
          className="h-8 w-full rounded-md border bg-background pl-8 pr-2 text-xs outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>
      <div className="max-h-48 space-y-0.5 overflow-auto pr-1 scrollbar-thin">
        {visibleRows.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onSelect(f.id)}
            className={cn(
              "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition hover:bg-accent",
              selectedId === f.id && "bg-primary/10 font-medium text-primary",
            )}
            style={{ paddingLeft: 8 + f.depth * 14 }}
            title={f.path}
          >
            <Folder className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{f.title}</span>
          </button>
        ))}
        {!visibleRows.length && (
          <div className="px-2 py-6 text-center text-xs text-muted-foreground">
            未找到匹配文件夹
          </div>
        )}
      </div>
    </div>
  );
}

function EditDialog({
  id,
  initTitle,
  initUrl,
  initParentId,
  tree,
  onSave,
  onClose,
}: {
  id: string;
  initTitle: string;
  initUrl: string;
  initParentId?: string;
  tree: BookmarkNode[];
  onSave: (id: string, title: string, url: string, parentId?: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [title, setTitle] = useState(initTitle);
  const [url, setUrl] = useState(initUrl);
  const [parentId, setParentId] = useState(initParentId);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [onClose]);

  const handleSave = () => {
    if (!title.trim() || !url.trim()) return;
    onSave(id, title.trim(), url.trim(), parentId);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div
        ref={ref}
        className="w-full max-w-md rounded-2xl border bg-popover p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-base font-semibold">编辑书签</h3>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          名称
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mb-3 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          autoFocus
        />
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          URL
        </label>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="mb-3 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          文件夹
        </label>
        <div className="mb-4 max-h-56 overflow-auto rounded-md border bg-background p-1 scrollbar-thin">
          <FolderPicker tree={tree} selectedId={parentId} onSelect={setParentId} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button size="sm" onClick={handleSave}>
            {t("common.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
