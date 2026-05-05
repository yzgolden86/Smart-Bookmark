/**
 * WebDAV 备份 / 恢复（最小可用实现）。
 *
 * 设计取舍：
 * - 不引第三方 SDK，直接用浏览器 fetch 的 PUT/GET/PROPFIND。
 *   坚果云、AList、Nextcloud、Synology WebDAV 都遵循 RFC 4918，能跑。
 * - 文件名用 `smart-bookmark-YYYYMMDDHHmm.json`（与本地导出同步），
 *   在远端按时间倒排展示，用户挑哪个还原都行。
 * - 鉴权用 Basic Auth：把 username:password base64 编码塞 Authorization 头。
 *   密码只存 chrome.storage.local，不会跨设备同步——比 cookie 安全。
 *
 * 注意：
 * - 浏览器扩展的 fetch 受 CORS 影响，但 Manifest V3 我们已经 host_permissions: <all_urls>，
 *   所以对任意域的 webdav 都能直接发请求。
 * - 服务端必须允许跨域 PROPFIND（Allow-Origin / Allow-Methods）。坚果云原生支持。
 */

import type { BackupFile, BackupNode } from "@/lib/backup";

export interface WebDAVConfig {
  url: string; // e.g. https://dav.jianguoyun.com/dav/
  username: string;
  password: string;
  /** 远端目录，建议以 / 结尾。默认 /smart-bookmark/ */
  folder?: string;
}

export interface WebDAVEntry {
  href: string; // 完整 url，可作 download 直接打开
  name: string; // 文件名
  size: number;
  modifiedAt: number; // ms
}

function authHeader(cfg: WebDAVConfig): string {
  return "Basic " + btoa(`${cfg.username}:${cfg.password}`);
}

/** 把用户配置里的 URL 与 folder 拼成可访问的远端目录。 */
function joinDir(cfg: WebDAVConfig): string {
  const base = cfg.url.replace(/\/$/, "");
  let folder = cfg.folder || "/smart-bookmark/";
  if (!folder.startsWith("/")) folder = "/" + folder;
  if (!folder.endsWith("/")) folder = folder + "/";
  return base + folder;
}

/** 拼成一个具体文件的 url。 */
function joinFile(cfg: WebDAVConfig, name: string): string {
  return joinDir(cfg) + encodeURIComponent(name);
}

/** 确保目标目录存在；不存在则 MKCOL 创建。重复创建会返回 405，吞掉即可。 */
async function ensureFolder(cfg: WebDAVConfig): Promise<void> {
  const dir = joinDir(cfg);
  // PROPFIND Depth 0 探测目录是否存在
  const probe = await fetch(dir, {
    method: "PROPFIND",
    headers: {
      Authorization: authHeader(cfg),
      Depth: "0",
    },
  }).catch(() => null);
  if (probe && (probe.status === 207 || probe.status === 200)) return;

  await fetch(dir, {
    method: "MKCOL",
    headers: { Authorization: authHeader(cfg) },
  }).catch(() => null);
}

/** 简单 ping：探测配置是否能连通且目录可写。 */
export async function testWebDAV(cfg: WebDAVConfig): Promise<{
  ok: boolean;
  message: string;
}> {
  if (!cfg.url || !cfg.username || !cfg.password) {
    return { ok: false, message: "请先填写 WebDAV URL / 账号 / 密码" };
  }
  try {
    await ensureFolder(cfg);
    const res = await fetch(joinDir(cfg), {
      method: "PROPFIND",
      headers: {
        Authorization: authHeader(cfg),
        Depth: "0",
      },
    });
    if (res.status === 207 || res.status === 200) {
      return { ok: true, message: "连接成功" };
    }
    if (res.status === 401) {
      return { ok: false, message: "鉴权失败：账号或密码不正确" };
    }
    return { ok: false, message: `HTTP ${res.status}` };
  } catch (err: any) {
    return { ok: false, message: err?.message ?? "网络错误" };
  }
}

/** 上传一个 backup 文件（PUT 覆盖；同名直接覆盖）。 */
export async function uploadBackup(
  cfg: WebDAVConfig,
  backup: BackupFile,
  filename?: string,
): Promise<string> {
  await ensureFolder(cfg);
  const name = filename ?? defaultBackupFilename();
  const url = joinFile(cfg, name);
  const body = JSON.stringify(backup, null, 2);
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: authHeader(cfg),
      "Content-Type": "application/json; charset=utf-8",
    },
    body,
  });
  if (!(res.status === 200 || res.status === 201 || res.status === 204)) {
    throw new Error(`上传失败：HTTP ${res.status}`);
  }
  return name;
}

/** 列出远端目录下的所有 .json 备份。返回时间倒序。 */
export async function listBackups(
  cfg: WebDAVConfig,
): Promise<WebDAVEntry[]> {
  await ensureFolder(cfg);
  const dir = joinDir(cfg);
  const res = await fetch(dir, {
    method: "PROPFIND",
    headers: {
      Authorization: authHeader(cfg),
      Depth: "1",
    },
  });
  if (!(res.status === 207 || res.status === 200)) {
    throw new Error(`列目录失败：HTTP ${res.status}`);
  }
  const xml = await res.text();
  return parseDavList(xml, dir).filter((e) =>
    e.name.toLowerCase().endsWith(".json"),
  );
}

/** 下载一个备份文件并解析成 BackupFile。 */
export async function downloadBackup(
  cfg: WebDAVConfig,
  name: string,
): Promise<BackupFile> {
  const url = joinFile(cfg, name);
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: authHeader(cfg) },
  });
  if (!res.ok) throw new Error(`下载失败：HTTP ${res.status}`);
  const text = await res.text();
  const parsed = JSON.parse(text) as BackupFile | BackupNode[];
  return Array.isArray(parsed)
    ? {
        app: "smart-bookmark",
        version: 1,
        exportedAt: Date.now(),
        tree: parsed,
      }
    : parsed;
}

export async function deleteBackup(
  cfg: WebDAVConfig,
  name: string,
): Promise<void> {
  const url = joinFile(cfg, name);
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: authHeader(cfg) },
  });
  if (!(res.status === 204 || res.status === 200)) {
    throw new Error(`删除失败：HTTP ${res.status}`);
  }
}

function defaultBackupFilename(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `smart-bookmark-${d.getFullYear()}${p(d.getMonth() + 1)}${p(
    d.getDate(),
  )}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}

/**
 * 极简 PROPFIND XML 解析：只关心 <D:response> 下的 href / name / size / lastmodified。
 * 不依赖 XML 解析器以节省 bundle；用 DOMParser 解析更稳。
 */
function parseDavList(xml: string, dir: string): WebDAVEntry[] {
  const out: WebDAVEntry[] = [];
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const responses = Array.from(doc.getElementsByTagNameNS("*", "response"));
  for (const r of responses) {
    const hrefEl = r.getElementsByTagNameNS("*", "href")[0];
    const href = hrefEl?.textContent || "";
    if (!href) continue;
    // 跳过目录自身
    if (decodeURIComponent(href).endsWith("/")) continue;
    const lastModEl = r.getElementsByTagNameNS("*", "getlastmodified")[0];
    const sizeEl = r.getElementsByTagNameNS("*", "getcontentlength")[0];
    const name = decodeURIComponent(href.split("/").pop() || "");
    out.push({
      href: href.startsWith("http") ? href : new URL(href, dir).toString(),
      name,
      size: sizeEl ? Number(sizeEl.textContent) || 0 : 0,
      modifiedAt: lastModEl
        ? Date.parse(lastModEl.textContent || "") || Date.now()
        : Date.now(),
    });
  }
  return out.sort((a, b) => b.modifiedAt - a.modifiedAt);
}
