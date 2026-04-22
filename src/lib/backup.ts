import type { BookmarkNode } from "@/types";
import { flatten, getTree } from "@/lib/bookmarks";

export interface BackupNode {
  title: string;
  url?: string;
  dateAdded?: number;
  dateGroupModified?: number;
  children?: BackupNode[];
}

export interface BackupFile {
  app: "smart-bookmark";
  version: 1;
  exportedAt: number;
  tree: BackupNode[];
}

function toBackupNode(n: BookmarkNode): BackupNode {
  return {
    title: n.title || "",
    url: n.url,
    dateAdded: n.dateAdded,
    dateGroupModified: (n as any).dateGroupModified,
    children: n.children?.map(toBackupNode),
  };
}

export async function buildBackup(): Promise<BackupFile> {
  const tree = await getTree();
  const topLevel = tree[0]?.children ?? tree;
  return {
    app: "smart-bookmark",
    version: 1,
    exportedAt: Date.now(),
    tree: topLevel.map(toBackupNode),
  };
}

export function downloadJsonBackup(backup: BackupFile) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  triggerDownload(blob, `smart-bookmark-backup-${ymd()}.json`);
}

export function downloadHtmlBackup(backup: BackupFile) {
  const html = toNetscapeHtml(backup.tree);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  triggerDownload(blob, `smart-bookmark-backup-${ymd()}.html`);
}

function ymd(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export function countBackupUrls(nodes: BackupNode[]): number {
  let n = 0;
  const walk = (node: BackupNode) => {
    if (node.url) n++;
    node.children?.forEach(walk);
  };
  nodes.forEach(walk);
  return n;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function toNetscapeHtml(nodes: BackupNode[]): string {
  const lines: string[] = [];
  lines.push(
    "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
    "<!-- This is an automatically generated file by Smart Bookmark. -->",
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    "<TITLE>Bookmarks</TITLE>",
    "<H1>Bookmarks</H1>",
    "<DL><p>",
  );
  const writeNode = (n: BackupNode, indent: string) => {
    const add = n.dateAdded ? ` ADD_DATE="${Math.floor(n.dateAdded / 1000)}"` : "";
    if (n.url) {
      lines.push(
        `${indent}<DT><A HREF="${escHtml(n.url)}"${add}>${escHtml(n.title)}</A>`,
      );
    } else {
      const mod = n.dateGroupModified
        ? ` LAST_MODIFIED="${Math.floor(n.dateGroupModified / 1000)}"`
        : "";
      lines.push(`${indent}<DT><H3${add}${mod}>${escHtml(n.title)}</H3>`);
      lines.push(`${indent}<DL><p>`);
      for (const c of n.children ?? []) writeNode(c, indent + "    ");
      lines.push(`${indent}</DL><p>`);
    }
  };
  for (const n of nodes) writeNode(n, "    ");
  lines.push("</DL><p>");
  return lines.join("\n");
}

export function parseNetscapeHtml(html: string): BackupNode[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.querySelector("dl");
  if (!root) return [];
  const parseDl = (dl: Element): BackupNode[] => {
    const out: BackupNode[] = [];
    const kids = Array.from(dl.children);
    for (let i = 0; i < kids.length; i++) {
      const dt = kids[i];
      if (dt.tagName.toLowerCase() !== "dt") continue;
      const a = dt.querySelector(":scope > a");
      const h3 = dt.querySelector(":scope > h3");
      if (a) {
        const url = a.getAttribute("href") || "";
        const title = (a.textContent || "").trim();
        const add = a.getAttribute("add_date");
        out.push({
          title,
          url,
          dateAdded: add ? Number(add) * 1000 : undefined,
        });
      } else if (h3) {
        const title = (h3.textContent || "").trim();
        const childDl =
          (kids[i + 1] && kids[i + 1].tagName.toLowerCase() === "dl"
            ? kids[i + 1]
            : dt.querySelector(":scope > dl")) || null;
        out.push({
          title,
          children: childDl ? parseDl(childDl as Element) : [],
        });
      }
    }
    return out;
  };
  return parseDl(root);
}

export interface ImportResult {
  added: number;
  skipped: number;
}

export async function importIntoFolder(
  parentId: string,
  nodes: BackupNode[],
  existingUrls: Set<string>,
): Promise<ImportResult> {
  let added = 0;
  let skipped = 0;
  const hasApi = typeof chrome !== "undefined" && !!chrome.bookmarks;
  if (!hasApi) return { added, skipped };

  const createFolder = (title: string, parent: string) =>
    new Promise<string>((resolve, reject) => {
      chrome.bookmarks.create({ parentId: parent, title }, (n) => {
        if (chrome.runtime.lastError)
          reject(new Error(chrome.runtime.lastError.message));
        else resolve(n.id);
      });
    });
  const createLink = (title: string, url: string, parent: string) =>
    new Promise<void>((resolve, reject) => {
      chrome.bookmarks.create({ parentId: parent, title, url }, () => {
        if (chrome.runtime.lastError)
          reject(new Error(chrome.runtime.lastError.message));
        else resolve();
      });
    });

  const walk = async (items: BackupNode[], parent: string) => {
    for (const it of items) {
      if (it.url) {
        const key = normalize(it.url);
        if (existingUrls.has(key)) {
          skipped++;
          continue;
        }
        try {
          await createLink(it.title || it.url, it.url, parent);
          existingUrls.add(key);
          added++;
        } catch {
          skipped++;
        }
      } else {
        const id = await createFolder(it.title || "(untitled)", parent);
        await walk(it.children ?? [], id);
      }
    }
  };
  await walk(nodes, parentId);
  return { added, skipped };
}

function normalize(u: string) {
  try {
    const url = new URL(u);
    url.hash = "";
    return url.toString().toLowerCase();
  } catch {
    return u.toLowerCase();
  }
}

export async function collectExistingUrls(): Promise<Set<string>> {
  const tree = await getTree();
  const set = new Set<string>();
  for (const b of flatten(tree)) set.add(normalize(b.url));
  return set;
}
