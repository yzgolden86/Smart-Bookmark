/**
 * Favicon 双层缓存系统
 *
 * L1: 内存 Map（当前页面会话，瞬间命中）
 * L2: IndexedDB（持久化，跨标签页/重启命中）
 *
 * 缓存键：hostname（去除 www.）
 * 缓存值：data URL (base64)
 * 过期时间：30 天
 */

const DB_NAME = "smart-bookmark-favicon-cache";
const DB_VERSION = 1;
const STORE_NAME = "favicons";
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 天

interface CacheEntry {
  hostname: string;
  dataUrl: string;
  timestamp: number;
}

// L1: 内存缓存
const memoryCache = new Map<string, string>();

// IndexedDB 实例
let db: IDBDatabase | null = null;
let dbInitPromise: Promise<IDBDatabase> | null = null;

/**
 * 初始化 IndexedDB
 */
async function initDB(): Promise<IDBDatabase> {
  if (db) return db;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "hostname" });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
  });

  return dbInitPromise;
}

/**
 * 标准化 hostname（去除 www. 前缀）
 */
function normalizeHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * 从 L2 (IndexedDB) 读取缓存
 */
async function getFromDB(hostname: string): Promise<string | null> {
  try {
    const database = await initDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(hostname);

      request.onsuccess = () => {
        const entry = request.result as CacheEntry | undefined;
        if (!entry) {
          resolve(null);
          return;
        }

        // 检查是否过期
        const age = Date.now() - entry.timestamp;
        if (age > CACHE_TTL) {
          // 过期，异步删除
          deleteFromDB(hostname);
          resolve(null);
          return;
        }

        resolve(entry.dataUrl);
      };

      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn("[faviconCache] getFromDB failed:", err);
    return null;
  }
}

/**
 * 写入 L2 (IndexedDB)
 */
async function saveToDB(hostname: string, dataUrl: string): Promise<void> {
  try {
    const database = await initDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const entry: CacheEntry = {
        hostname,
        dataUrl,
        timestamp: Date.now(),
      };
      const request = store.put(entry);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn("[faviconCache] saveToDB failed:", err);
  }
}

/**
 * 从 L2 删除过期条目
 */
async function deleteFromDB(hostname: string): Promise<void> {
  try {
    const database = await initDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(hostname);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn("[faviconCache] deleteFromDB failed:", err);
  }
}

/**
 * 将图片 URL 转换为 data URL (base64)
 */
function imageToDataUrl(imgSrc: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas context not available"));
          return;
        }
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL("image/png");
        resolve(dataUrl);
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => reject(new Error("Image load failed"));
    img.src = imgSrc;
  });
}

/**
 * 获取 favicon（带缓存）
 *
 * @param url 网站 URL
 * @returns data URL 或 fallback URL
 */
export async function getCachedFavicon(url: string): Promise<string> {
  const hostname = normalizeHostname(url);

  // L1: 内存缓存命中
  if (memoryCache.has(hostname)) {
    return memoryCache.get(hostname)!;
  }

  // L2: IndexedDB 缓存命中
  const cached = await getFromDB(hostname);
  if (cached) {
    memoryCache.set(hostname, cached);
    return cached;
  }

  // 缓存未命中，返回原始 URL（由调用方处理 fallback）
  try {
    const u = new URL(url);
    return `${u.origin}/favicon.ico`;
  } catch {
    return "";
  }
}

/**
 * 缓存成功加载的 favicon
 *
 * @param url 网站 URL
 * @param imgSrc 成功加载的图片 src
 */
export async function cacheFavicon(url: string, imgSrc: string): Promise<void> {
  const hostname = normalizeHostname(url);

  try {
    // 转换为 data URL
    const dataUrl = await imageToDataUrl(imgSrc);

    // 写入 L1
    memoryCache.set(hostname, dataUrl);

    // 异步写入 L2
    saveToDB(hostname, dataUrl).catch((err) => {
      console.warn("[faviconCache] Failed to save to IndexedDB:", err);
    });
  } catch (err) {
    console.warn("[faviconCache] Failed to cache favicon:", err);
  }
}

/**
 * 清空所有缓存（用于调试或设置页面）
 */
export async function clearFaviconCache(): Promise<void> {
  // 清空内存缓存
  memoryCache.clear();

  // 清空 IndexedDB
  try {
    const database = await initDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn("[faviconCache] clearFaviconCache failed:", err);
  }
}

/**
 * 获取缓存统计信息（用于调试）
 */
export async function getCacheStats(): Promise<{ count: number; size: number }> {
  try {
    const database = await initDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const entries = request.result as CacheEntry[];
        const size = entries.reduce((sum, e) => sum + e.dataUrl.length, 0);
        resolve({ count: entries.length, size });
      };

      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn("[faviconCache] getCacheStats failed:", err);
    return { count: 0, size: 0 };
  }
}
