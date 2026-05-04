import { useCallback, useEffect, useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Bookmark,
  Sparkles,
  Wand2,
  Settings2,
  Columns,
  HardDriveDownload,
  Flame,
} from "lucide-react";
import Dashboard from "./pages/Dashboard";
import Cleaner from "./pages/Cleaner";
import AiPanel from "./pages/AiPanel";
import SettingsPage from "./pages/Settings";
import Compare from "./pages/Compare";
import BackupPage from "./pages/Backup";
import Discover from "./pages/Discover";
import QrDialog from "./pages/QrDialog";
import { getSettings, onSettingsChange } from "@/lib/storage";
import type { Settings } from "@/types";
import { useT } from "@/lib/i18n";
import { ToastHost } from "@/components/ui/toast";
import ThemeToggle from "@/components/ThemeToggle";
import ThemeSwitcher from "@/components/ThemeSwitcher";

type TabId =
  | "dashboard"
  | "discover"
  | "cleaner"
  | "ai"
  | "compare"
  | "backup"
  | "settings";

function readHashTab(): TabId {
  const h = window.location.hash.slice(1);
  const params = new URLSearchParams(h);
  const t = params.get("tab");
  if (
    t === "cleaner" ||
    t === "ai" ||
    t === "settings" ||
    t === "compare" ||
    t === "backup" ||
    t === "discover"
  )
    return t;
  return "dashboard";
}

function readHashParam(key: string): string {
  const params = new URLSearchParams(window.location.hash.slice(1));
  return params.get(key) ?? "";
}

export default function App() {
  const t = useT();
  const [tab, setTab] = useState<TabId>(readHashTab);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [initialQuery] = useState(() => readHashParam("q"));
  const [qr, setQr] = useState<string>(() => readHashParam("qr"));

  /** 切换 Tab 并同步到 hash，避免只改 state 导致地址栏与「查看全部」和 Hash 不同步。 */
  const setTabWithHash = useCallback((id: TabId) => {
    setTab(id);
    const p = new URLSearchParams(window.location.hash.slice(1));
    p.set("tab", id);
    const s = p.toString();
    const next = s ? "#" + s : "#";
    if (window.location.hash !== next) {
      window.location.hash = next;
    }
  }, []);

  useEffect(() => {
    getSettings().then(setSettings);
    const off = onSettingsChange(setSettings);
    const onHash = () => {
      setTab(readHashTab());
      setQr(readHashParam("qr"));
    };
    window.addEventListener("hashchange", onHash);
    return () => {
      off();
      window.removeEventListener("hashchange", onHash);
    };
  }, []);

  const bg = useMemo(() => {
    if (!settings?.wallpaper) return undefined;
    const opacity = Math.max(
      0.05,
      Math.min(1, settings.wallpaperOpacity ?? 1),
    );
    return {
      backgroundImage: `url(${settings.wallpaper})`,
      opacity,
    } as React.CSSProperties;
  }, [settings?.wallpaper, settings?.wallpaperOpacity]);

  /** 把字体缩放映射到 root 字号上，影响所有 rem 单位与 text-* 类。 */
  useEffect(() => {
    const scale = Math.max(0.8, Math.min(1.4, settings?.fontScale ?? 1));
    document.documentElement.style.setProperty(
      "--app-font-scale",
      String(scale),
    );
    document.documentElement.style.fontSize = `${16 * scale}px`;
    return () => {
      document.documentElement.style.fontSize = "";
    };
  }, [settings?.fontScale]);

  if (!settings) return null;

  /**
   * 壁纸开启时刻意降低主层遮罩，让壁纸更显著：
   * - 没有壁纸时：保持 bg-background/85 + backdrop-blur-sm，视觉一致；
   * - 有壁纸时：主层透明度降到 30%、移除背景模糊；卡片/header 等需要的局部
   *   仍保留各自的半透明 + blur 以保证可读性。
   */
  const hasWallpaper = !!settings.wallpaper;
  const wrapperBgClass = hasWallpaper
    ? "bg-background/30"
    : "bg-background/85 backdrop-blur-sm";
  const headerBgClass = hasWallpaper
    ? "bg-background/55 backdrop-blur-md"
    : "bg-background/75 backdrop-blur";

  return (
    <div className="relative h-screen overflow-hidden">
      {bg && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-300"
          style={bg}
        />
      )}
      <div className={`relative flex h-screen flex-col ${wrapperBgClass}`}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-indigo-500/8 via-fuchsia-500/5 to-transparent" />
        <header className={`sticky top-0 z-30 shrink-0 border-b ${headerBgClass}`}>
          <div className="mx-auto flex max-w-[1760px] items-center gap-4 px-6 py-3">
            <div className="flex shrink-0 items-center gap-2 whitespace-nowrap font-semibold">
              <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-md shadow-indigo-500/20">
                <Bookmark className="h-4 w-4" />
              </div>
              <span className="tracking-tight">{t("app.title")}</span>
            </div>
            <div className="min-w-0 flex-1" />
            <ThemeSwitcher />
            <ThemeToggle />
            <Tabs value={tab} onValueChange={(v) => setTabWithHash(v as TabId)}>
              <TabsList className="h-9 gap-0.5 bg-transparent p-0">
                {(
                  [
                    ["dashboard", Bookmark, t("tabs.dashboard")],
                    ["discover", Flame, t("tabs.discover")],
                    ["cleaner", Wand2, t("tabs.cleaner")],
                    ["compare", Columns, t("tabs.compare")],
                    ["ai", Sparkles, t("tabs.ai")],
                    ["backup", HardDriveDownload, t("tabs.backup")],
                    ["settings", Settings2, t("tabs.settings")],
                  ] as const
                ).map(([id, Icon, label]) => (
                  <TabsTrigger
                    key={id}
                    value={id}
                    className="relative h-8 gap-1.5 rounded-md px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none after:pointer-events-none after:absolute after:inset-x-2.5 after:-bottom-[7px] after:h-[2px] after:rounded-full after:bg-primary after:opacity-0 data-[state=active]:after:opacity-100"
                  >
                    <Icon className="h-3.5 w-3.5" strokeWidth={1.8} /> {label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </header>

        {/*
         * 主内容区固定占用剩余空间；除 Dashboard 外的页面在内部自行滚动，
         * 这样年度进度条可以贴着视口底，新搜索框 sticky 也只会贴在主区域顶部、
         * 永远不会跑到顶栏之上。
         */}
        <main
          className={
            "mx-auto w-full max-w-[1760px] flex-1 overflow-hidden px-6 " +
            (tab === "dashboard"
              ? "py-4"
              : "overflow-y-auto py-6 scrollbar-thin")
          }
        >
          {tab === "dashboard" && (
            <Dashboard settings={settings} initialQuery={initialQuery} />
          )}
          {tab === "discover" && <Discover settings={settings} />}
          {tab === "cleaner" && <Cleaner />}
          {tab === "compare" && <Compare settings={settings} />}
          {tab === "ai" && <AiPanel settings={settings} />}
          {tab === "backup" && <BackupPage />}
          {tab === "settings" && <SettingsPage />}
        </main>

        <YearProgress />
      </div>

      {qr && (
        <QrDialog
          url={qr}
          onClose={() => {
            setQr("");
            const params = new URLSearchParams(window.location.hash.slice(1));
            params.delete("qr");
            const s = params.toString();
            window.history.replaceState(null, "", s ? "#" + s : "#");
          }}
        />
      )}

      <ToastHost />
    </div>
  );
}

function YearProgress() {
  const now = new Date();
  const year = now.getFullYear();
  const start = new Date(year, 0, 1).getTime();
  const end = new Date(year + 1, 0, 1).getTime();
  const pct = ((now.getTime() - start) / (end - start)) * 100;
  const cells = 20;
  const done = Math.round((pct / 100) * cells);
  return (
    <div className="mx-auto flex max-w-md shrink-0 items-center justify-center gap-2 py-3 text-[11px] text-muted-foreground">
      <span>{year} 年过去</span>
      <div className="flex gap-1">
        {Array.from({ length: cells }).map((_, i) => (
          <span
            key={i}
            className={
              "h-2 w-2 rounded-sm " +
              (i < done
                ? "bg-gradient-to-br from-indigo-500 to-fuchsia-500"
                : "bg-muted")
            }
          />
        ))}
      </div>
      <span>{pct.toFixed(1)}%</span>
    </div>
  );
}
