import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function faviconOf(url: string, _size = 32): string {
  try {
    const u = new URL(url);
    // 多重降级策略：
    // 1. 优先尝试站点根目录的 favicon.ico
    // 2. 降级到 Google favicon 服务
    // 3. 最后降级到 DuckDuckGo icon 服务
    // 使用 onerror 在前端实现降级，这里返回主策略
    return `${u.origin}/favicon.ico`;
  } catch {
    return "";
  }
}

// 为 <img> 提供降级处理的辅助函数
export function faviconFallback(
  img: HTMLImageElement,
  url: string,
  size = 32
) {
  const u = new URL(url);
  const fallbacks = [
    `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=${size}`,
    `https://icons.duckduckgo.com/ip3/${u.hostname}.ico`,
  ];
  let attempt = 0;
  img.onerror = () => {
    if (attempt < fallbacks.length) {
      img.src = fallbacks[attempt++];
    }
  };
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function formatDate(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function debounce<T extends (...args: any[]) => void>(fn: T, delay = 200) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    const keepQ = new URLSearchParams();
    for (const [k, v] of u.searchParams) {
      if (!/^utm_|^spm$|^fbclid$|^gclid$/i.test(k)) keepQ.set(k, v);
    }
    u.search = keepQ.toString() ? `?${keepQ.toString()}` : "";
    if (u.pathname.endsWith("/") && u.pathname !== "/") {
      u.pathname = u.pathname.replace(/\/+$/, "");
    }
    return u.toString().toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}
