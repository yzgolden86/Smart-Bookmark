export {};

const SETTINGS_KEY = "smart-bookmark::settings";
const STATE_KEY_POS = "smart-bookmark::floating-pos";

interface MiniSettings {
  floatingBall?: boolean;
  language?: "auto" | "zh" | "en";
  searchEngine?: string;
}

const STRINGS = {
  zh: {
    search: "搜索书签",
    sidepanel: "打开侧边栏",
    cleaner: "清理中心",
    copy: "复制当前 URL",
    qr: "生成二维码",
    hide: "隐藏悬浮球",
    copied: "已复制",
    placeholder: "搜索书签或本页…按回车打开",
  },
  en: {
    search: "Search bookmarks",
    sidepanel: "Open side panel",
    cleaner: "Cleaner",
    copy: "Copy current URL",
    qr: "Generate QR code",
    hide: "Hide floating ball",
    copied: "Copied",
    placeholder: "Search bookmarks or press Enter to search the web…",
  },
};

function pickLang(l?: string): "zh" | "en" {
  if (l === "zh" || l === "en") return l;
  const nav = (navigator.language || "en").toLowerCase();
  return nav.startsWith("zh") ? "zh" : "en";
}

let host: HTMLDivElement | null = null;
let root: ShadowRoot | null = null;
let langKey: "zh" | "en" = "en";
let isOpen = false;

function ensureHost() {
  if (host) return;
  host = document.createElement("div");
  host.id = "smart-bookmark-floating-root";
  host.style.all = "initial";
  host.style.position = "fixed";
  host.style.zIndex = "2147483646";
  host.style.width = "0";
  host.style.height = "0";
  host.style.top = "0";
  host.style.left = "0";
  host.style.pointerEvents = "none";
  document.documentElement.appendChild(host);
  root = host.attachShadow({ mode: "open" });
  injectStyles(root);
}

function injectStyles(r: ShadowRoot) {
  const style = document.createElement("style");
  style.textContent = `
  :host { all: initial; }
  .wrap { pointer-events: auto; position: fixed; }
  .ball {
    width: 44px; height: 44px; border-radius: 22px;
    background: linear-gradient(135deg,#3b82f6,#8b5cf6);
    color: #fff;
    display:flex; align-items:center; justify-content:center;
    cursor:grab; user-select:none;
    box-shadow: 0 6px 18px rgba(0,0,0,.25);
    font-family: system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;
    font-size: 20px; font-weight: 700; letter-spacing:-.02em;
    transition: transform .15s ease;
  }
  .ball:hover { transform: scale(1.05); }
  .ball:active { cursor: grabbing; }
  .panel {
    position: fixed;
    min-width: 300px; max-width: 360px;
    background: #ffffff; color: #111;
    border-radius: 14px;
    box-shadow: 0 20px 40px rgba(0,0,0,.2);
    border: 1px solid rgba(0,0,0,.08);
    overflow: hidden;
    font-family: system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;
    font-size: 13px;
  }
  @media (prefers-color-scheme: dark) {
    .panel { background: #0b1220; color: #eef2ff; border-color: rgba(255,255,255,.08); }
    .btn:hover { background: rgba(255,255,255,.06); }
    .input { background: #111827; color: #eef2ff; border-bottom: 1px solid rgba(255,255,255,.08); }
    .hit { border-bottom: 1px solid rgba(255,255,255,.06); }
    .muted { color: #9ca3af; }
  }
  .input {
    width: 100%; box-sizing: border-box;
    padding: 10px 12px; border: none; outline: none;
    background: #f9fafb; color: #111;
    border-bottom: 1px solid rgba(0,0,0,.06);
    font-size: 13px;
  }
  .rows { max-height: 260px; overflow-y: auto; }
  .hit {
    display:flex; gap:8px; padding: 8px 12px; cursor:pointer;
    border-bottom: 1px solid rgba(0,0,0,.04);
    align-items: center;
  }
  .hit:hover { background: rgba(0,0,0,.05); }
  .hit img { width:16px; height:16px; border-radius:3px; flex: 0 0 auto; }
  .hit .t { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .hit .u { font-size: 11px; color:#6b7280; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:120px; }
  .muted { color:#6b7280; padding: 10px 12px; font-size:12px; }
  .btns { display:flex; flex-wrap:wrap; gap: 4px; padding: 8px; border-top: 1px solid rgba(0,0,0,.06); }
  .btn {
    flex: 1 0 calc(50% - 4px);
    padding: 6px 8px; border-radius: 8px;
    background: transparent; cursor:pointer; color: inherit;
    border: 0; text-align:left;
    font-size: 12px;
  }
  .btn:hover { background: rgba(0,0,0,.06); }
  .toast {
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: rgba(15,23,42,.9); color:#fff;
    padding: 8px 14px; border-radius: 999px; font-size: 12px;
    pointer-events: none;
  }
  `;
  r.appendChild(style);
}

interface SimpleBookmark {
  id: string;
  title: string;
  url: string;
}

async function searchBookmarks(q: string): Promise<SimpleBookmark[]> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        { type: "bookmarks-search", query: q },
        (res) => {
          resolve(res?.items ?? []);
        },
      );
    } catch {
      resolve([]);
    }
  });
}

interface Pos {
  right: number;
  bottom: number;
}

async function loadPos(): Promise<Pos> {
  try {
    const saved = await chrome.storage?.local?.get?.(STATE_KEY_POS);
    if (saved?.[STATE_KEY_POS]) return saved[STATE_KEY_POS] as Pos;
  } catch {}
  return { right: 24, bottom: 120 };
}

async function savePos(p: Pos) {
  try {
    await chrome.storage?.local?.set?.({ [STATE_KEY_POS]: p });
  } catch {}
}

let panelEl: HTMLDivElement | null = null;
let wrapEl: HTMLDivElement | null = null;
let mounted = false;

async function mount() {
  if (mounted) return;
  ensureHost();
  if (!root) return;

  langKey = pickLang((await loadSettings()).language);
  const S = STRINGS[langKey];

  const wrap = document.createElement("div");
  wrap.className = "wrap";
  const pos = await loadPos();
  wrap.style.right = `${pos.right}px`;
  wrap.style.bottom = `${pos.bottom}px`;

  const ball = document.createElement("div");
  ball.className = "ball";
  ball.textContent = "S";
  ball.title = "Smart Bookmark";

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.style.display = "none";

  const input = document.createElement("input");
  input.className = "input";
  input.placeholder = S.placeholder;
  panel.appendChild(input);

  const rows = document.createElement("div");
  rows.className = "rows";
  panel.appendChild(rows);

  const btns = document.createElement("div");
  btns.className = "btns";
  const mkBtn = (label: string, handler: () => void) => {
    const b = document.createElement("button");
    b.className = "btn";
    b.textContent = label;
    b.addEventListener("click", handler);
    return b;
  };

  btns.appendChild(
    mkBtn(S.sidepanel, () => {
      chrome.runtime.sendMessage({ type: "open-sidepanel" });
      togglePanel(false);
    }),
  );
  btns.appendChild(
    mkBtn(S.cleaner, () => {
      chrome.runtime.sendMessage({ type: "open-cleaner" });
      togglePanel(false);
    }),
  );
  btns.appendChild(
    mkBtn(S.copy, async () => {
      try {
        await navigator.clipboard.writeText(location.href);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = location.href;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      flash(S.copied);
    }),
  );
  btns.appendChild(
    mkBtn(S.qr, () => {
      chrome.runtime.sendMessage({ type: "open-qr", url: location.href });
      togglePanel(false);
    }),
  );
  btns.appendChild(
    mkBtn(S.hide, async () => {
      const s = await loadSettings();
      await saveSettings({ ...s, floatingBall: false });
      unmount();
    }),
  );
  panel.appendChild(btns);

  let inputTimer: any = null;
  const renderRows = (q: string) => {
    rows.innerHTML = "";
    if (!q) return;
    searchBookmarks(q).then((items) => {
      if (!items.length) {
        const d = document.createElement("div");
        d.className = "muted";
        d.textContent = langKey === "zh" ? "无匹配书签" : "No matches";
        rows.appendChild(d);
        return;
      }
      for (const it of items) {
        const row = document.createElement("div");
        row.className = "hit";
        let host = "";
        try {
          host = new URL(it.url).hostname.replace(/^www\./, "");
        } catch {
          host = it.url;
        }
        const img = document.createElement("img");
        img.src = `https://www.google.com/s2/favicons?domain=${host}&sz=32`;
        img.onerror = () => img.remove();
        const t = document.createElement("div");
        t.className = "t";
        t.textContent = it.title;
        const u = document.createElement("div");
        u.className = "u";
        u.textContent = host;
        row.appendChild(img);
        row.appendChild(t);
        row.appendChild(u);
        row.addEventListener("click", () => {
          window.location.href = it.url;
        });
        rows.appendChild(row);
      }
    });
  };

  input.addEventListener("input", () => {
    const q = input.value.trim();
    if (inputTimer) clearTimeout(inputTimer);
    inputTimer = setTimeout(() => renderRows(q), 120);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const q = input.value.trim();
      if (!q) return;
      const first = rows.querySelector(".hit") as HTMLDivElement | null;
      if (first) {
        first.click();
        return;
      }
      chrome.runtime.sendMessage({ type: "search-bookmarks", query: q });
      togglePanel(false);
    } else if (e.key === "Escape") {
      togglePanel(false);
    }
  });

  const togglePanel = (force?: boolean) => {
    isOpen = force ?? !isOpen;
    panel.style.display = isOpen ? "block" : "none";
    if (isOpen) {
      const rect = ball.getBoundingClientRect();
      const panelHeight = panel.offsetHeight || 360;
      const panelWidth = panel.offsetWidth || 320;
      const top = Math.max(8, rect.top - panelHeight - 8);
      const left = Math.max(
        8,
        Math.min(
          window.innerWidth - panelWidth - 8,
          rect.left - (panelWidth - rect.width),
        ),
      );
      panel.style.top = `${top}px`;
      panel.style.left = `${left}px`;
      setTimeout(() => input.focus(), 30);
    }
  };

  let dragStart: {
    x: number;
    y: number;
    rx: number;
    ry: number;
    moved: boolean;
  } | null = null;

  ball.addEventListener("mousedown", (e) => {
    dragStart = {
      x: e.clientX,
      y: e.clientY,
      rx: parseInt(wrap.style.right, 10) || 0,
      ry: parseInt(wrap.style.bottom, 10) || 0,
      moved: false,
    };
    const onMove = (ev: MouseEvent) => {
      if (!dragStart) return;
      const dx = ev.clientX - dragStart.x;
      const dy = ev.clientY - dragStart.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) dragStart.moved = true;
      const right = Math.max(0, dragStart.rx - dx);
      const bottom = Math.max(0, dragStart.ry - dy);
      wrap.style.right = `${right}px`;
      wrap.style.bottom = `${bottom}px`;
    };
    const onUp = async () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (dragStart) {
        if (dragStart.moved) {
          await savePos({
            right: parseInt(wrap.style.right, 10) || 0,
            bottom: parseInt(wrap.style.bottom, 10) || 0,
          });
        } else {
          togglePanel();
        }
      }
      dragStart = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });

  wrap.appendChild(ball);
  wrap.appendChild(panel);
  root.appendChild(wrap);

  wrapEl = wrap;
  panelEl = panel;
  mounted = true;

  document.addEventListener("click", onGlobalClick, true);
}

function onGlobalClick(e: MouseEvent) {
  if (!isOpen || !wrapEl) return;
  const path = e.composedPath();
  if (!path.includes(wrapEl)) {
    isOpen = false;
    if (panelEl) panelEl.style.display = "none";
  }
}

function unmount() {
  if (!mounted) return;
  if (host) host.remove();
  host = null;
  root = null;
  panelEl = null;
  wrapEl = null;
  mounted = false;
  isOpen = false;
  document.removeEventListener("click", onGlobalClick, true);
}

function flash(text: string) {
  if (!root) return;
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = text;
  root.appendChild(t);
  setTimeout(() => t.remove(), 1600);
}

async function loadSettings(): Promise<MiniSettings> {
  try {
    const s = await chrome.storage?.local?.get?.(SETTINGS_KEY);
    return s?.[SETTINGS_KEY] ?? {};
  } catch {
    return {};
  }
}

async function saveSettings(next: MiniSettings) {
  try {
    await chrome.storage?.local?.set?.({ [SETTINGS_KEY]: next });
  } catch {}
}

async function apply() {
  const s = await loadSettings();
  if (s.floatingBall) {
    mount().catch(console.warn);
  } else {
    unmount();
  }
}

apply();

chrome.storage?.onChanged?.addListener?.((changes, area) => {
  if (area !== "local") return;
  if (changes[SETTINGS_KEY]) {
    apply();
  }
});
