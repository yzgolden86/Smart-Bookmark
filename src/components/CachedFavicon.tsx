import { useCachedFavicon } from "@/hooks/useCachedFavicon";
import { cn } from "@/lib/utils";

interface CachedFaviconProps {
  url: string;
  size?: number;
  className?: string;
  alt?: string;
}

/**
 * 带 IndexedDB 缓存的 favicon 图片组件。
 *
 * 使用方式：
 * ```tsx
 * <CachedFavicon url={link.url} className="h-5 w-5 rounded" />
 * ```
 */
export default function CachedFavicon({
  url,
  size = 32,
  className,
  alt = "",
}: CachedFaviconProps) {
  const { src, onError, onLoad } = useCachedFavicon(url, size);

  if (!src) {
    // 初始 loading 时占位
    return <span className={cn("inline-block", className)} aria-hidden />;
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={onError}
      onLoad={onLoad}
    />
  );
}
