import { Newspaper } from "lucide-react";
import TrendingPanel from "@/components/TrendingPanel";
import QuickLinks from "@/components/QuickLinks";
import NewsNowFrame from "@/components/NewsNowFrame";
import ToolLinks from "@/components/ToolLinks";
import type { Settings } from "@/types";
import { useT } from "@/lib/i18n";
import { setSettings } from "@/lib/storage";

interface Props {
  settings: Settings;
}

export default function Discover({ settings }: Props) {
  const t = useT();

  const handleQuickLinksChange = async (links: Array<{ id: string; title: string; url: string }>) => {
    await setSettings({ quickLinks: links });
  };

  const handleToolLinksChange = async (links: Array<{ id: string; title: string; url: string; tag: string; description: string }>) => {
    await setSettings({ toolLinks: links });
  };

  return (
    <div className="space-y-4">
      {/* 页面标题 */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 text-white shadow-md shadow-blue-500/20">
          <Newspaper className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {t("discover.title")}
          </h1>
          {t("discover.subtitle") && (
            <p className="text-sm text-muted-foreground">
              {t("discover.subtitle")}
            </p>
          )}
        </div>
      </div>

      {/* 快捷书签 */}
      <QuickLinks
        links={settings.quickLinks ?? []}
        onChange={handleQuickLinksChange}
      />

      {/* NewsNow + 信息差工具 (3:1 比例) */}
      <div className="grid gap-4 2xl:grid-cols-[3fr_1fr]">
        <NewsNowFrame />
        <ToolLinks
          links={settings.toolLinks ?? []}
          onChange={handleToolLinksChange}
        />
      </div>

      {/* GitHub Trending (5列网格 + 限高滚动) */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {t("discover.githubTrending")}
        </h2>
        <TrendingPanel
          settings={settings}
          limit={30}
          maxHeight="600px"
        />
      </div>
    </div>
  );
}
