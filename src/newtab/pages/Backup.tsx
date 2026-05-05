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
import { Switch } from "@/components/ui/switch";
import {
  Cloud,
  CloudDownload,
  CloudUpload,
  Download,
  FileJson,
  HardDriveDownload,
  Loader2,
  Lock,
  RefreshCw,
  Settings as SettingsIcon,
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

  /** 备份选项：是否含设置 / 是否含敏感字段。默认都关。 */
  const [includeSettings, setIncludeSettings] = useState(false);
  const [includeSensitive, setIncludeSensitive] = useState(false);

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
      const backup = await buildBackup({
        includeSettings,
        includeSensitive: includeSettings && includeSensitive,
      });
      if (kind === "json") downloadJsonBackup(backup);
      else downloadHtmlBackup(backup);
      toast(
        t("backup.exported", String(countBackupUrls(backup.tree))),
        "success",
      );
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
      let importedSettings: Partial<Settings> | undefined;
      if (file.name.endsWith(".json")) {
        const j = JSON.parse(text) as BackupFile | BackupNode[];
        nodes = Array.isArray(j) ? j : j.tree;
        importedSettings =
          !Array.isArray(j) && j.settings ? j.settings : undefined;
      } else {
        nodes = parseNetscapeHtml(text);
      }
      const existing = await collectExistingUrls();
      const { added, skipped } = await importIntoFolder(
        parentId,
        nodes,
        existing,
      );
      let extraMsg = "";
      // 如果备份文件里带了 settings 且用户当前确实勾选了「含设置」，提供一键应用：
      if (importedSettings && includeSettings) {
        if (confirm("备份文件包含扩展设置，是否一并应用到本机？")) {
          await setSettings(importedSettings);
          extraMsg = "（设置已恢复）";
        }
      }
      toast(
        t("backup.imported", String(added), String(skipped)) + extraMsg,
        "success",
      );
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
      const backup = await buildBackup({
        includeSettings,
        includeSensitive: includeSettings && includeSensitive,
      });
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
      let extra = "";
      if (backup.settings && includeSettings) {
        if (confirm("远端备份包含扩展设置，是否一并应用到本机?")) {
          await setSettings(backup.settings);
          extra = "（设置已恢复）";
        }
      }
      toast(
        t("backup.imported", String(added), String(skipped)) + extra,
        "success",
      );
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

  // 备份选项展示串
  const includeBadge = includeSettings
    ? includeSensitive
      ? "书签 + 设置（含敏感）"
      : "书签 + 设置"
    : "仅书签";

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-5">
      <Card className="overflow-hidden">
        <CardHeader className="bg-gradient-to-br from-indigo-500/10 via-fuchsia-500/5 to-transparent">
          <CardTitle className="flex items-center gap-2">
            <HardDriveDownload className="h-5 w-5 text-primary" />
            {t("backup.title")}
          </CardTitle>
          <CardDescription>
            把书签导出到本地或远程 WebDAV，导入时会与现有书签做合并（重复 URL 自动跳过）。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          {/* 备份范围选项卡：让用户在导出前显式勾选哪些数据要进备份。 */}
          <div className="rounded-xl border bg-muted/30 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <SettingsIcon className="h-4 w-4 text-primary" />
              备份范围
              <span className="ml-auto rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                {includeBadge}
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-start gap-3 rounded-lg border bg-background/60 p-3 transition hover:border-primary/30">
                <Switch
                  checked={includeSettings}
                  onCheckedChange={(v) => {
                    setIncludeSettings(v);
                    if (!v) setIncludeSensitive(false);
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">同时备份扩展设置</div>
                  <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                    主题、字体、搜索引擎、卡片密度、文件夹置顶等显示偏好。
                  </div>
                </div>
              </label>
              <label
                className={
                  "flex items-start gap-3 rounded-lg border p-3 transition " +
                  (includeSettings
                    ? "bg-background/60 hover:border-primary/30"
                    : "cursor-not-allowed bg-muted/40 opacity-60")
                }
              >
                <Switch
                  checked={includeSensitive}
                  disabled={!includeSettings}
                  onCheckedChange={setIncludeSensitive}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Lock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    包含敏感字段
                  </div>
                  <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                    AI API Key、AI Base URL、GitHub Token、WebDAV URL/账号/密码。默认<b>不</b>含。
                  </div>
                </div>
              </label>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="本地导出" icon={<Download className="h-4 w-4" />}>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  variant="outline"
                  className="h-12 justify-start gap-2"
                  onClick={() => doExport("json")}
                  disabled={busy}
                >
                  <FileJson className="h-4 w-4 text-primary" />
                  <div className="flex min-w-0 flex-col items-start leading-tight">
                    <span className="text-sm">{t("backup.exportJson")}</span>
                    <span className="text-[10.5px] text-muted-foreground">
                      Smart Bookmark 自有格式，可完整还原
                    </span>
                  </div>
                </Button>
                <Button
                  variant="outline"
                  className="h-12 justify-start gap-2"
                  onClick={() => doExport("html")}
                  disabled={busy}
                >
                  <Download className="h-4 w-4 text-primary" />
                  <div className="flex min-w-0 flex-col items-start leading-tight">
                    <span className="text-sm">{t("backup.exportHtml")}</span>
                    <span className="text-[10.5px] text-muted-foreground">
                      Netscape 标准，所有浏览器通用
                    </span>
                  </div>
                </Button>
              </div>
            </Section>

            <Section title="本地导入" icon={<Upload className="h-4 w-4" />}>
              <div className="grid grid-cols-[120px_1fr] items-center gap-3">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("backup.importTo")}
                </span>
                <select
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                  className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.path} ({f.count})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <ImportLabel
                  label={t("backup.importJson")}
                  accept=".json,application/json"
                  onPick={doImport}
                />
                <ImportLabel
                  label={t("backup.importHtml")}
                  accept=".html,.htm,text/html"
                  onPick={doImport}
                />
              </div>
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
                {t("backup.importNotice")}
              </div>
            </Section>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="bg-gradient-to-br from-sky-500/10 via-cyan-500/5 to-transparent">
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-primary" />
            WebDAV 备份与恢复
          </CardTitle>
          <CardDescription>
            上传 JSON 备份到任意 WebDAV 服务（坚果云 / Nextcloud / AList / Synology
            等）。账号密码仅保存在浏览器本地。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
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

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-xl border bg-card/40 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground/80">
        <span className="text-primary">{icon}</span>
        {title}
      </div>
      {children}
    </div>
  );
}

function ImportLabel({
  label,
  accept,
  onPick,
}: {
  label: string;
  accept: string;
  onPick: (f: File) => void;
}) {
  return (
    <label className="group flex h-12 cursor-pointer items-center justify-center gap-2 rounded-md border bg-background px-4 text-sm transition hover:border-primary/30 hover:bg-accent">
      <Upload className="h-4 w-4 text-primary" />
      {label}
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
    </label>
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
