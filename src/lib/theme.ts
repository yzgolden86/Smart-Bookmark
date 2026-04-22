import type { Settings } from "@/types";
import { getSettings, onSettingsChange } from "@/lib/storage";

export function resolveTheme(mode: Settings["theme"]): "light" | "dark" {
  if (mode === "light" || mode === "dark") return mode;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(mode: Settings["theme"]) {
  const theme = resolveTheme(mode);
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.dataset.theme = theme;
}

export function applyAccent(preset: Settings["accentPreset"] | undefined) {
  document.documentElement.dataset.accent = preset ?? "indigo";
}

export async function initTheme() {
  const s = await getSettings();
  applyTheme(s.theme);
  applyAccent(s.accentPreset);
  onSettingsChange((next) => {
    applyTheme(next.theme);
    applyAccent(next.accentPreset ?? "indigo");
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", async () => {
    const cur = await getSettings();
    if (cur.theme === "system") applyTheme("system");
  });
}
