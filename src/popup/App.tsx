import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  Wand2,
  PanelRight,
  Sparkles,
  Columns,
  HardDriveDownload,
  Plus,
  Search,
  Folder,
  Check,
  X,
  Loader2,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import type { BookmarkNode } from "@/types";
import { getTree, createFolder } from "@/lib/bookmarks";

export default function Popup() {
  const t = useT();
  const [adding, setAdding] = useState(false);

  const openNewtab = (hash = "") =>
    chrome.tabs.create({ url: chrome.runtime.getURL("newtab.html" + hash) });

  const openSidePanel = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.windowId) {
      await chrome.sidePanel?.open?.({ windowId: tab.windowId }).catch(() => {});
      window.close();
    }
  };

  const Item = ({
    icon,
    label,
    onClick,
    color,
  }: {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    color: string;
  }) => (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-accent"
    >
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br ${color} text-white shadow-sm`}
      >
        {icon}
      </div>
      <span className="text-sm">{label}</span>
    </button>
  );

  return (
    <div className="w-[300px] bg-background p-3 text-foreground">
      <div className="mb-3 flex items-center gap-2 px-1 text-sm font-semibold">
        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white">
          <Bookmark className="h-3.5 w-3.5" />
        </div>
        {t("app.title")}
      </div>
      <div className="space-y-0.5">
        {/* 「添加书签」放在最上面，默认拿当前 tab 的 title/url，最常用的 popup 操作。 */}
        <Item
          icon={<Plus className="h-4 w-4" />}
          color="from-rose-500 to-pink-500"
          label={t("popup.addBookmark")}
          onClick={() => setAdding(true)}
        />
        <Item
          icon={<Bookmark className="h-4 w-4" />}
          color="from-indigo-500 to-sky-500"
          label={t("popup.dashboard")}
          onClick={() => openNewtab()}
        />
        <Item
          icon={<Wand2 className="h-4 w-4" />}
          color="from-emerald-500 to-teal-500"
          label={t("popup.cleaner")}
          onClick={() => openNewtab("#tab=cleaner")}
        />
        <Item
          icon={<Columns className="h-4 w-4" />}
          color="from-fuchsia-500 to-rose-500"
          label={t("popup.compare")}
          onClick={() => openNewtab("#tab=compare")}
        />
        <Item
          icon={<Sparkles className="h-4 w-4" />}
          color="from-amber-500 to-orange-500"
          label={t("popup.ai")}
          onClick={() => openNewtab("#tab=ai")}
        />
        <Item
          icon={<HardDriveDownload className="h-4 w-4" />}
          color="from-slate-500 to-slate-700"
          label={t("popup.backup")}
          onClick={() => openNewtab("#tab=backup")}
        />
        <Item
          icon={<PanelRight className="h-4 w-4" />}
          color="from-blue-500 to-indigo-500"
          label={t("popup.sidepanel")}
          onClick={openSidePanel}
        />
      </div>
      <div className="mt-3 rounded-md bg-muted px-3 py-2 text-[11px] text-muted-foreground">
        {t("popup.shortcut")}
      </div>

      {adding && <AddBookmarkDialog onClose={() => setAdding(false)} />}
    </div>
  );
}

/* ----------------------------- 添加书签对话框 ----------------------------- */

interface FolderPickerRow {
  id: string;
  title: string;
  /** 完整层级路径，例如 "书签栏 / 工作 / 项目" */
  path: string;
  depth: number;
}

function buildFolderRows(tree: BookmarkNode[]): FolderPickerRow[] {
  const out: FolderPickerRow[] = [];
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
}

function AddBookmarkDialog({ onClose }: { onClose: () => void }) {
  const t = useT();

  /** 当前 tab 元数据（标题 / URL）作为初始值。 */
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [tree, setTree] = useState<BookmarkNode[]>([]);
  const [parentId, setParentId] = useState<string>("");
  const [folderQuery, setFolderQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // 1) 抓当前 tab
    chrome.tabs?.query({ active: true, currentWindow: true }, (tabs) => {
      const tb = tabs[0];
      if (tb) {
        setTitle(tb.title || "");
        setUrl(tb.url || "");
      }
    });
    // 2) 拉书签树，并把书签栏作为默认父文件夹
    getTree().then((tr) => {
      setTree(tr);
      // 优先选「书签栏」(id=1)；否则选第一个非根
      const fav = tr[0]?.children?.find((n) => !n.url);
      setParentId(fav?.id ?? "1");
    });
    // 3) 自动聚焦标题，方便直接修改
    setTimeout(() => titleRef.current?.select(), 50);
  }, []);

  const allRows = useMemo(() => buildFolderRows(tree), [tree]);
  const visibleRows = useMemo(() => {
    const q = folderQuery.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.path.toLowerCase().includes(q),
    );
  }, [allRows, folderQuery]);

  const selectedPath = allRows.find((r) => r.id === parentId)?.path ?? "";

  const save = async () => {
    if (!title.trim() || !url.trim()) {
      setErr("名称和 URL 不能为空");
      return;
    }
    if (!parentId) {
      setErr("请选择保存到的文件夹");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await chrome.bookmarks.create({
        parentId,
        title: title.trim(),
        url: url.trim(),
      });
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "保存失败");
    } finally {
      setSaving(false);
    }
  };

  /** 在当前选中文件夹下新建一个子文件夹，并立刻选中它。 */
  const addSubfolder = async () => {
    const name = window.prompt("新建文件夹名称", "新建文件夹");
    if (!name?.trim() || !parentId) return;
    const node = await createFolder(parentId, name.trim());
    if (node?.id) {
      const tr = await getTree();
      setTree(tr);
      setParentId(node.id);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-stretch bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="m-2 flex w-full flex-col overflow-hidden rounded-xl bg-popover shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-rose-500 to-pink-500 text-white">
              <Plus className="h-3.5 w-3.5" />
            </div>
            {t("popup.addBookmark")}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-accent"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 space-y-2.5 overflow-auto px-3 py-3 text-sm">
          <Field label="名称">
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </Field>
          <Field label="URL">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </Field>
          <Field
            label="保存到"
            extra={
              <button
                type="button"
                onClick={addSubfolder}
                className="text-[11px] text-primary hover:underline"
              >
                + 新建子文件夹
              </button>
            }
          >
            <div className="space-y-1.5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={folderQuery}
                  onChange={(e) => setFolderQuery(e.target.value)}
                  placeholder="搜索文件夹"
                  className="h-8 w-full rounded-md border bg-background pl-7 pr-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="max-h-48 overflow-auto rounded-md border bg-background scrollbar-thin">
                {visibleRows.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                    未找到匹配文件夹
                  </div>
                ) : (
                  <ul>
                    {visibleRows.map((r) => {
                      const active = r.id === parentId;
                      return (
                        <li key={r.id}>
                          <button
                            type="button"
                            onClick={() => setParentId(r.id)}
                            className={
                              "flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs transition " +
                              (active
                                ? "bg-primary/10 text-primary"
                                : "hover:bg-accent")
                            }
                            style={{ paddingLeft: 8 + r.depth * 12 }}
                            title={r.path}
                          >
                            <Folder className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{r.title}</span>
                            {active && <Check className="ml-auto h-3.5 w-3.5" />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              {selectedPath && (
                <div className="truncate text-[10.5px] text-muted-foreground">
                  当前选择：<span className="font-medium">{selectedPath}</span>
                </div>
              )}
            </div>
          </Field>
          {err && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              {err}
            </div>
          )}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t px-3 py-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            {t("common.save")}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({
  label,
  extra,
  children,
}: {
  label: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
        <span>{label}</span>
        {extra}
      </div>
      {children}
    </div>
  );
}
