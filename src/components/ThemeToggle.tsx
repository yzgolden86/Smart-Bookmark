import { useEffect, useState } from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { getSettings, onSettingsChange, setSettings } from "@/lib/storage";
import type { Settings } from "@/types";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Settings["theme"]>("system");
  useEffect(() => {
    getSettings().then((s) => setTheme(s.theme));
    return onSettingsChange((s) => setTheme(s.theme));
  }, []);

  const cycle = async () => {
    const next: Settings["theme"] =
      theme === "system" ? "light" : theme === "light" ? "dark" : "system";
    await setSettings({ theme: next });
  };

  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  const label = theme === "light" ? "浅色" : theme === "dark" ? "深色" : "跟随系统";

  return (
    <button
      type="button"
      onClick={cycle}
      className="inline-flex h-8 items-center gap-1.5 rounded-full border bg-background/60 px-3 text-xs text-muted-foreground transition hover:bg-accent"
      title={`主题：${label}（点击切换）`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </button>
  );
}
