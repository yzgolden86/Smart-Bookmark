import { useEffect, useRef, useState } from "react";
import {
  getCachedFavicon,
  cacheFavicon,
} from "@/lib/faviconCache";

interface UseCachedFaviconResult {
  /** 当前要喂给 <img src> 的 URL（cache 命中时为 data URL，否则为远程 URL） */
  src: string;
  /** 是否命中缓存（data URL） */
  cached: boolean;
  /** <img> onError 触发降级（Google → DuckDuckGo → 隐藏） */
  onError: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  /** <img> onLoad 触发：成功后异步把当前 src 转 base64 入库 */
  onLoad: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}

/**
 * 带 IndexedDB 缓存的 favicon hook。
 *
 * 使用方式：
 * ```tsx
 * const { src, onError, onLoad } = useCachedFavicon(link.url, 32);
 * <img src={src} onError={onError} onLoad={onLoad} />
 * ```
 *
 * 流程：
 * 1. 渲染时先查 L1 内存缓存 → L2 IndexedDB
 * 2. 命中：直接返回 data URL，零网络请求
 * 3. 未命中：返回 `${origin}/favicon.ico`，img onLoad 后转 base64 入库
 * 4. 加载失败：依次降级到 Google s2 → DuckDuckGo → 隐藏
 */
export function useCachedFavicon(
  url: string,
  size = 32,
): UseCachedFaviconResult {
  const [src, setSrc] = useState<string>("");
  const [cached, setCached] = useState(false);
  // 记录当前 fallback 进度：0=origin/favicon.ico, 1=google, 2=ddg, 3=隐藏
  const attemptRef = useRef(0);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    attemptRef.current = 0;

    (async () => {
      const result = await getCachedFavicon(url);
      if (cancelled) return;

      // 如果是 data URL，说明命中缓存
      const isCached = result.startsWith("data:");
      setSrc(result);
      setCached(isCached);
    })();

    return () => {
      cancelled = true;
    };
  }, [url]);

  const onError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    if (cached) {
      // 缓存的 data URL 都加载失败说明缓存已坏，隐藏即可
      e.currentTarget.style.visibility = "hidden";
      return;
    }

    try {
      const u = new URL(url);
      const fallbacks = [
        `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=${size}`,
        `https://icons.duckduckgo.com/ip3/${u.hostname}.ico`,
      ];

      if (attemptRef.current < fallbacks.length) {
        const next = fallbacks[attemptRef.current++];
        e.currentTarget.src = next;
      } else {
        e.currentTarget.style.visibility = "hidden";
      }
    } catch {
      e.currentTarget.style.visibility = "hidden";
    }
  };

  const onLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    // 命中缓存的不再重复入库
    if (cached) return;
    // 异常情况：宽高为 0（实际上加载失败）
    const img = e.currentTarget;
    if (img.naturalWidth === 0 || img.naturalHeight === 0) return;

    // 异步入库，不阻塞渲染
    cacheFavicon(url, img.src).catch(() => {});
  };

  return { src, cached, onError, onLoad };
}
