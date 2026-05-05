import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Cloud,
  CloudDownload,
  CloudUpload,
  Download,
  FileJson,
  HardDriveDownload,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import {
  buildBackup,
  collectExistingUrls,
  countBackupUrls,
  downloadHtmlBackup,
  downloadJsonBackup,
  importIntoFolder,
  parseNetscapeHtml,
  type BackupFile,
  type BackupNode,
} from "@/lib/backup";
import {
  deleteBackup,
  downloadBackup,
  listBackups,
  testWebDAV,
  uploadBackup,
  type WebDAVEntry,
} from "@/lib/webdav";
import { allFolders, getTree } from "@/lib/bookmarks";
import { getSettings, setSettings } from "@/lib/storage";
import type { FolderStat, Settings } from "@/types";
import { useT } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";

export default function BackupPage() {
  const t = useT();
  const [folders, setFolders] = useState<FolderStat[]>([]);
  const [parentId, setParentId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  /** WebDAV 相关 state，独立管理避免和本地备份逻辑混在一起。 */
  const [settings, setS] = useState<Settings | null>(null);
  const [davEntries, setDavEntries] = useState<WebDAVEntry[]>([]);
  const [davLoading, setDavLoading] = useState(false);
  const [davError, setDavError] = useState<string | null>(null);

  useEffect(() => {
    getTree().then((tr) => {
      const fs = allFolders(tr);
      setFolders(fs);
      setParentId(fs[0]?.id ?? "");
    });
    getSettings().then(setS);
  }, []);

  const updateSettings = async (patch: Partial<Settings>) => {
    const next = await setSettings(patch);
    setS(next);
  };

  const updateWebdav = (patch: Partial<NonNullable<Settings["webdav"]>>) => {
    updateSettings({
      webdav: { ...(settings?.webdav ?? {}), ...patch },
    });
  };

  const doExport = async (kind: "json" | "html") => {
    setBusy(true);
    try {
      const backup = await buildBackup();
      if (kind === "json") downloadJsonBackup(backup);
      else downloadHtmlBackup(backup);
      toast(t("backup.exported", String(countBackupUrls(backup.tree))), "success");
    } finally {
      setBusy(false);
    }
  };

  const doImport = async (file: File) => {
    if (!parentId) {
      toast("Pick a folder first", "error");
      return;
    }
    setBusy(true);
    try {
      const text = await file.text();
      let nodes: BackupNode[] = [];
      if (file.name.endsWith(".json")) {
        const j = JSON.parse(text) as BackupFile | BackupNode[];
        nodes = Array.isArray(j) ? j : j.tree;
      } else {
        nodes = parseNetscapeHtml(text);
      }
      const existing = await collectExistingUrls();
      const { added, skipped } = await importIntoFolder(parentId, nodes, existing);
      toast(t("backup.imported", String(added), String(skipped)), "success");
    } catch (err: any) {
      toast(err?.message ?? "Import failed", "error");
    } finally {
      setBusy(false);
    }
  };

  // ------------------------- WebDAV ------------------------- //

  const dav = settings?.webdav ?? {};

  const refreshDav = async () => {
    if (!settings) return;
    setDavLoading(true);
    setDavError(null);
    try {
      const list = await listBackups({
        url: dav.url ?? "",
        username: dav.username ?? "",
        password: dav.password ?? "",
        folder: dav.folder ?? "/smart-bookmark/",
      });
      setDavEntries(list);
    } catch (err: any) {
      setDavError(err?.message ?? "无法读取远端目录");
      setDavEntries([]);
    } finally {
      setDavLoading(false);
    }
  };

  const testConn = async () => {
    setDavLoading(true);
    setDavError(null);
    try {
      const r = await testWebDAV({
        url: dav.url ?? "",
        username: dav.username ?? "",
        password: dav.password ?? "",
        folder: dav.folder ?? "/smart-bookmark/",
      });
      if (r.ok) toast("WebDAV 连接成功", "success");
      else toast(r.message, "error");
    } finally {
      setDavLoading(false);
    }
  };

  const uploadNow = async () => {
    if (!dav.url || !dav.username || !dav.password) {
      toast("请先配置 WebDAV", "error");
      return;
    }
    setDavLoading(true);
    setDavError(null);
    try {
      const backup = await buildBackup();
      const name = await uploadBackup(
        {
          url: dav.url ?? "",
          username: dav.username ?? "",
          password: dav.password ?? "",
          folder: dav.folder ?? "/smart-bookmark/",
        },
        backup,
      );
      toast(`已上传 ${name}`, "success");
      await refreshDav();
    } catch (err: any) {
      setDavError(err?.message ?? "上传失败");
      toast(err?.message ?? "上传失败", "error");
    } finally {
      setDavLoading(false);
    }
  };

  const restoreFromDav = async (entry: WebDAVEntry) => {
    if (!parentId) {
      toast("先选导入到的文件夹", "error");
      return;
    }
    if (!confirm(`从 ${entry.name} 恢复并导入到所选文件夹？`)) return;
    setDavLoading(true);
    try {
      const backup = await downloadBackup(
        {
          url: dav.url ?? "",
          username: dav.username ?? "",
          password: dav.password ?? "",
          folder: dav.folder ?? "/smart-bookmark/",
        },
        entry.name,
      );
      const existing = await collectExistingUrls();
      const { added, skipped } = await importIntoFolder(
        parentId,
        backup.tree,
        existing,
      );
      toast(t("backup.imported", String(added), String(skipped)), "success");
    } catch (err: any) {
      toast(err?.message ?? "恢复失败", "error");
    } finally {
      setDavLoading(false);
    }
  };

  const deleteFromDav = async (entry: WebDAVEntry) => {
    if (!confirm(`删除远端备份 ${entry.name}？此操作不可撤销。`)) return;
    setDavLoading(true);
    try {
      await deleteBackup(
        {
          url: dav.url ?? "",
          username: dav.username ?? "",
          password: dav.password ?? "",
          folder: dav.folder ?? "/smart-bookmark/",
        },
        entry.name,
      );
      toast("已删除", "success");
      await refreshDav();
    } catch (err: any) {
      toast(err?.message ?? "删除失败", "error");
    } finally {
      setDavLoading(false);
    }
  };

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDriveDownload className="h-4 w-4 text-primary" />
            {t("backup.title")}
          </CardTitle>
          <CardDescription>
            导出本地备份到磁盘，或导入备份合并到指定文件夹（重复 URL 会自动跳过）。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="text-xs font-medium text-muted-foreground">
              本地导出
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                variant="outline"
                className="justify-start gap-2"
                onClick={() => doExport("json")}
                disabled={busy}
              >
                <FileJson className="h-4 w-4" />
                {t("backup.exportJson")}
              </Button>
              <Button
                variant="outline"
                className="justify-start gap-2"
                onClick={() => doExport("html")}
                disabled={busy}
              >
                <Download className="h-4 w-4" />
                {t("backup.exportHtml")}
              </Button>
            </div>
          </div>
          <div className="space-y-3">
            <div className="text-xs font-medium text-muted-foreground">
              本地导入
            </div>
            <div className="grid grid-cols-[120px_1fr] items-center gap-3">
              <span className="text-sm font-medium text-muted-foreground">
                {t("backup.importTo")}
              </span>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className="rounded-md border bg-background px-3 py-2 text-sm"
              >
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.path} ({f.count})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border bg-background px-4 py-2 text-sm hover:bg-accent">
                <Upload className="h-4 w-4" />
                {t("backup.importJson")}
                <input
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) doImport(f);
                    e.target.value = "";
                  }}
                />
              </label>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border bg-background px-4 py-2 text-sm hover:bg-accent">
                <Upload className="h-4 w-4" />
                {t("backup.importHtml")}
                <input
                  type="file"
                  accept=".html,.htm,text/html"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) doImport(f);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
              {t("backup.importNotice")}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-4 w-4 text-primary" />
            WebDAV 备份与恢复
          </CardTitle>
          <CardDescription>
            把 JSON 备份直接上传到任意 WebDAV 服务（坚果云 / Nextcloud / AList /
            Synology 等）。账号密码仅保存在浏览器本地。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="WebDAV URL">
              <Input
                value={dav.url ?? ""}
                onChange={(e) => updateWebdav({ url: e.target.value })}
                placeholder="https://dav.jianguoyun.com/dav/"
              />
            </Field>
            <Field label="远端目录">
              <Input
                value={dav.folder ?? "/smart-bookmark/"}
                onChange={(e) => updateWebdav({ folder: e.target.value })}
                placeholder="/smart-bookmark/"
              />
            </Field>
            <Field label="用户名">
              <Input
                value={dav.username ?? ""}
                onChange={(e) => updateWebdav({ username: e.target.value })}
                placeholder="your-account"
              />
            </Field>
            <Field label="密码 / 应用密码">
              <Input
                type="password"
                value={dav.password ?? ""}
                onChange={(e) => updateWebdav({ password: e.target.value })}
                placeholder="坚果云请使用「应用密码」"
              />
            </Field>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={testConn}
              disabled={davLoading}
            >
              {davLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              测试连接
            </Button>
            <Button
              size="sm"
              className="gap-2"
              onClick={uploadNow}
              disabled={davLoading}
            >
              <CloudUpload className="h-4 w-4" />
              立即备份
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={refreshDav}
              disabled={davLoading}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              刷新远端列表
            </Button>
          </div>

          {davError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              {davError}
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>远端备份列表（按修改时间倒序）</span>
              <span>共 {davEntries.length} 个</span>
            </div>
            <div className="overflow-hidden rounded-md border">
              {davEntries.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                  {davLoading
                    ? "正在加载…"
                    : "暂无备份。可点击「立即备份」上传一份，或先测试连接。"}
                </div>
              ) : (
                <ul className="divide-y">
                  {davEntries.map((e) => (
                    <li
                      key={e.href}
                      className="flex items-center gap-3 px-4 py-2 text-sm"
                    >
                      <FileJson className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{e.name}</div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {new Date(e.modifiedAt).toLocaleString()} ·{" "}
                          {(e.size / 1024).toFixed(1)} KB
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => restoreFromDav(e)}
                        disabled={davLoading}
                      >
                        <CloudDownload className="h-3.5 w-3.5" /> 恢复
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => deleteFromDav(e)}
                        disabled={davLoading}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              提示：恢复会把备份写入上方所选「导入到」文件夹，重复 URL 自动跳过；
              真正的覆盖式还原请手动删除现有书签后再恢复。
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
