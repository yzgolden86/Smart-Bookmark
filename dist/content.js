const S="smart-bookmark::settings",M="smart-bookmark::floating-pos",K={zh:{placeholder:"搜索书签或命令…",sectionBookmarks:"书签",sectionActions:"命令",emptyBookmarks:"无匹配书签",sidepanel:"打开侧边栏",cleaner:"打开清理中心",copy:"复制当前 URL",qr:"生成二维码",hide:"隐藏悬浮球",copied:"已复制",kbdOpen:"打开",kbdNav:"移动"},en:{placeholder:"Search bookmarks or actions…",sectionBookmarks:"Bookmarks",sectionActions:"Actions",emptyBookmarks:"No matches",sidepanel:"Open side panel",cleaner:"Open cleaner",copy:"Copy current URL",qr:"Generate QR code",hide:"Hide floating ball",copied:"Copied",kbdOpen:"Open",kbdNav:"Navigate"}};function X(n){return n==="zh"||n==="en"?n:(navigator.language||"en").toLowerCase().startsWith("zh")?"zh":"en"}const x={search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',panel:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/></svg>',sparkles:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3v4M7 5h4M17 11v4M15 13h4"/><path d="M12 7l1.8 4.2L18 13l-4.2 1.8L12 19l-1.8-4.2L6 13l4.2-1.8z"/></svg>',copy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',qr:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3M21 14v3M14 21h3M21 21h.01"/></svg>',x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',bookmark:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>'};let c=null,w=null,q="en",b=!1;function _(){c||(c=document.createElement("div"),c.id="smart-bookmark-floating-root",c.style.all="initial",c.style.position="fixed",c.style.zIndex="2147483646",c.style.width="0",c.style.height="0",c.style.top="0",c.style.left="0",c.style.pointerEvents="none",document.documentElement.appendChild(c),w=c.attachShadow({mode:"open"}),V(w))}function V(n){const e=document.createElement("style");e.textContent=`
  :host { all: initial; }
  .wrap { pointer-events: auto; position: fixed; }

  .ball {
    width: 44px; height: 44px; border-radius: 22px;
    background: linear-gradient(135deg,#5e6ad2,#7c3aed);
    color: #fff;
    display: flex; align-items: center; justify-content: center;
    cursor: grab; user-select: none;
    box-shadow:
      0 0 0 1px rgba(255,255,255,.08),
      0 10px 30px rgba(94,106,210,.35);
    font-family: ui-sans-serif, system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
    font-size: 18px; font-weight: 700; letter-spacing: -.02em;
    transition: transform .15s ease, box-shadow .15s ease;
  }
  .ball:hover {
    transform: scale(1.06);
    box-shadow:
      0 0 0 1px rgba(255,255,255,.14),
      0 14px 36px rgba(94,106,210,.45);
  }
  .ball:active { cursor: grabbing; transform: scale(.97); }

  .panel {
    position: fixed;
    min-width: 440px; max-width: 520px;
    background: rgba(13,13,14,.96);
    color: #f4f4f5;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,.08);
    box-shadow:
      0 0 0 1px rgba(255,255,255,.02),
      0 24px 60px rgba(0,0,0,.5);
    backdrop-filter: blur(18px) saturate(140%);
    -webkit-backdrop-filter: blur(18px) saturate(140%);
    overflow: hidden;
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Inter", "PingFang SC", "Microsoft YaHei", sans-serif;
    font-size: 13px;
    letter-spacing: -0.005em;
  }

  .search {
    display: flex; align-items: center; gap: 10px;
    padding: 12px 14px;
    border-bottom: 1px solid rgba(255,255,255,.06);
  }
  .search .icon { flex: 0 0 auto; width: 16px; height: 16px; color: #a1a1aa; display: inline-flex; }
  .search .icon svg { width: 100%; height: 100%; }
  .input {
    flex: 1 1 auto; min-width: 0;
    background: transparent; border: 0; outline: 0;
    color: #f4f4f5; font-size: 14px;
    font-family: inherit; letter-spacing: inherit;
    padding: 2px 0;
  }
  .input::placeholder { color: #71717a; }

  .body {
    max-height: 380px; overflow-y: auto;
    padding: 4px 0 8px;
    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,.08) transparent;
  }
  .body::-webkit-scrollbar { width: 8px; }
  .body::-webkit-scrollbar-thumb { background: rgba(255,255,255,.08); border-radius: 8px; }

  .section-title {
    padding: 10px 14px 6px;
    font-size: 10.5px; font-weight: 600;
    text-transform: uppercase; letter-spacing: .08em;
    color: #71717a;
  }

  .row {
    display: flex; align-items: center; gap: 10px;
    padding: 7px 10px;
    margin: 0 6px;
    border-radius: 6px;
    cursor: pointer;
    color: #e4e4e7;
  }
  .row .icon {
    flex: 0 0 auto; width: 16px; height: 16px;
    color: #a1a1aa; display: inline-flex;
  }
  .row .icon img { width: 100%; height: 100%; border-radius: 3px; }
  .row .icon svg { width: 100%; height: 100%; }
  .row .label {
    flex: 1 1 auto; min-width: 0;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    font-size: 13px;
  }
  .row .meta {
    flex: 0 0 auto;
    font-size: 11px; color: #71717a;
    max-width: 180px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .row.is-active {
    background: rgba(255,255,255,.06);
    color: #fafafa;
  }
  .row.is-active .icon,
  .row.is-active .meta { color: #d4d4d8; }

  .empty {
    padding: 14px 16px;
    font-size: 12px; color: #71717a;
    text-align: center;
  }

  .footer {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 12px;
    border-top: 1px solid rgba(255,255,255,.06);
    font-size: 11px; color: #71717a;
  }
  .footer .group { display: inline-flex; align-items: center; gap: 6px; }
  .kbd {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 18px; height: 18px; padding: 0 5px;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
    font-size: 10.5px;
    background: rgba(255,255,255,.07);
    border: 1px solid rgba(255,255,255,.08);
    border-radius: 4px;
    color: #d4d4d8;
  }

  .toast {
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: rgba(13,13,14,.92); color: #fafafa;
    padding: 8px 14px; border-radius: 999px; font-size: 12px;
    pointer-events: none;
    border: 1px solid rgba(255,255,255,.08);
    backdrop-filter: blur(12px);
    box-shadow: 0 10px 30px rgba(0,0,0,.35);
  }
  `,n.appendChild(e)}async function Q(n){return new Promise(e=>{try{chrome.runtime.sendMessage({type:"bookmarks-search",query:n},a=>{e((a==null?void 0:a.items)??[])})}catch{e([])}})}async function J(){var n,e,a;try{const s=await((a=(e=(n=chrome.storage)==null?void 0:n.local)==null?void 0:e.get)==null?void 0:a.call(e,M));if(s!=null&&s[M])return s[M]}catch{}return{right:24,bottom:120}}async function Z(n){var e,a,s;try{await((s=(a=(e=chrome.storage)==null?void 0:e.local)==null?void 0:a.set)==null?void 0:s.call(a,{[M]:n}))}catch{}}let L=null,N=null,B=!1;function $(n){const e=document.createElement("span");return e.className="icon",e.innerHTML=n,e}async function ee(){if(B||(_(),!w))return;q=X((await j()).language);const n=K[q],e=document.createElement("div");e.className="wrap";const a=await J();e.style.right=`${a.right}px`,e.style.bottom=`${a.bottom}px`;const s=document.createElement("div");s.className="ball",s.textContent="S",s.title="Smart Bookmark";const p=document.createElement("div");p.className="panel",p.style.display="none";const v=document.createElement("div");v.className="search",v.appendChild($(x.search));const f=document.createElement("input");f.className="input",f.placeholder=n.placeholder,v.appendChild(f),p.appendChild(v);const m=document.createElement("div");m.className="body",p.appendChild(m);const k=document.createElement("div");k.className="footer";const R=document.createElement("div");R.className="group",R.innerHTML=`<span class="kbd">↵</span>&nbsp;${n.kbdOpen}`;const T=document.createElement("div");T.className="group",T.innerHTML=`<span class="kbd">↑</span><span class="kbd">↓</span>&nbsp;${n.kbdNav}`,k.appendChild(R),k.appendChild(T),p.appendChild(k);let g=[],u=0;const y=t=>{if(b=t??!b,p.style.display=b?"block":"none",b){const l=s.getBoundingClientRect(),i=p.offsetHeight||420,r=p.offsetWidth||460,o=Math.max(8,l.top-i-8),d=Math.max(8,Math.min(window.innerWidth-r-8,l.left-(r-l.width)));p.style.top=`${o}px`,p.style.left=`${d}px`,setTimeout(()=>{f.focus(),f.select()},30)}},U=[{kind:"action",label:n.sidepanel,iconSvg:x.panel,onRun:()=>{chrome.runtime.sendMessage({type:"open-sidepanel"}),y(!1)}},{kind:"action",label:n.cleaner,iconSvg:x.sparkles,onRun:()=>{chrome.runtime.sendMessage({type:"open-cleaner"}),y(!1)}},{kind:"action",label:n.copy,iconSvg:x.copy,onRun:async()=>{try{await navigator.clipboard.writeText(location.href)}catch{const t=document.createElement("textarea");t.value=location.href,document.body.appendChild(t),t.select(),document.execCommand("copy"),t.remove()}te(n.copied)}},{kind:"action",label:n.qr,iconSvg:x.qr,onRun:()=>{chrome.runtime.sendMessage({type:"open-qr",url:location.href}),y(!1)}},{kind:"action",label:n.hide,iconSvg:x.x,onRun:async()=>{const t=await j();await ne({...t,floatingBall:!1}),Y()}}],C=t=>{if(!g.length){u=0;return}u=Math.max(0,Math.min(g.length-1,t)),m.querySelectorAll(".row").forEach(r=>r.classList.remove("is-active"));const i=m.querySelector(`.row[data-idx="${u}"]`);if(i){i.classList.add("is-active");const r=m.getBoundingClientRect(),o=i.getBoundingClientRect();o.bottom>r.bottom?m.scrollTop+=o.bottom-r.bottom+4:o.top<r.top&&(m.scrollTop-=r.top-o.top+4)}},A=()=>{const t=g[u];t&&t.onRun()},H=t=>{const l=g.length;g.push(t);const i=document.createElement("div");if(i.className="row",i.setAttribute("data-idx",String(l)),t.iconImg){const o=document.createElement("span");o.className="icon";const d=document.createElement("img");d.src=t.iconImg,d.onerror=()=>{d.remove(),o.innerHTML=x.bookmark},o.appendChild(d),i.appendChild(o)}else t.iconSvg&&i.appendChild($(t.iconSvg));const r=document.createElement("span");if(r.className="label",r.textContent=t.label,i.appendChild(r),t.meta){const o=document.createElement("span");o.className="meta",o.textContent=t.meta,i.appendChild(o)}i.addEventListener("mouseenter",()=>C(l)),i.addEventListener("click",()=>{u=l,A()}),m.appendChild(i)},z=(t,l)=>{if(m.innerHTML="",g=[],t){const r=document.createElement("div");if(r.className="section-title",r.textContent=n.sectionBookmarks,m.appendChild(r),l.length)for(const o of l){let d="";try{d=new URL(o.url).hostname.replace(/^www\./,"")}catch{d=o.url}H({kind:"bookmark",label:o.title||d,meta:d,iconImg:`https://www.google.com/s2/favicons?domain=${d}&sz=32`,onRun:()=>{window.location.href=o.url}})}else{const o=document.createElement("div");o.className="empty",o.textContent=n.emptyBookmarks,m.appendChild(o)}}const i=document.createElement("div");i.className="section-title",i.textContent=n.sectionActions,m.appendChild(i);for(const r of U)H(r);C(0)};let I=null;f.addEventListener("input",()=>{const t=f.value.trim();if(I&&clearTimeout(I),!t){z("",[]);return}I=setTimeout(async()=>{const l=await Q(t);z(t,l)},120)}),f.addEventListener("keydown",t=>{t.key==="ArrowDown"?(t.preventDefault(),C(u+1>=g.length?0:u+1)):t.key==="ArrowUp"?(t.preventDefault(),C(u-1<0?g.length-1:u-1)):t.key==="Enter"?(t.preventDefault(),A()):t.key==="Escape"&&(t.preventDefault(),y(!1))}),z("",[]);let h=null;s.addEventListener("mousedown",t=>{h={x:t.clientX,y:t.clientY,rx:parseInt(e.style.right,10)||0,ry:parseInt(e.style.bottom,10)||0,moved:!1};const l=r=>{if(!h)return;const o=r.clientX-h.x,d=r.clientY-h.y;Math.abs(o)+Math.abs(d)>3&&(h.moved=!0);const W=Math.max(0,h.rx-o),G=Math.max(0,h.ry-d);e.style.right=`${W}px`,e.style.bottom=`${G}px`},i=async()=>{window.removeEventListener("mousemove",l),window.removeEventListener("mouseup",i),h&&(h.moved?await Z({right:parseInt(e.style.right,10)||0,bottom:parseInt(e.style.bottom,10)||0}):y()),h=null};window.addEventListener("mousemove",l),window.addEventListener("mouseup",i)}),e.appendChild(s),e.appendChild(p),w.appendChild(e),N=e,L=p,B=!0,document.addEventListener("click",D,!0)}function D(n){if(!b||!N)return;n.composedPath().includes(N)||(b=!1,L&&(L.style.display="none"))}function Y(){B&&(c&&c.remove(),c=null,w=null,L=null,N=null,B=!1,b=!1,document.removeEventListener("click",D,!0))}function te(n){if(!w)return;const e=document.createElement("div");e.className="toast",e.textContent=n,w.appendChild(e),setTimeout(()=>e.remove(),1600)}async function j(){var n,e,a;try{const s=await((a=(e=(n=chrome.storage)==null?void 0:n.local)==null?void 0:e.get)==null?void 0:a.call(e,S));return(s==null?void 0:s[S])??{}}catch{return{}}}async function ne(n){var e,a,s;try{await((s=(a=(e=chrome.storage)==null?void 0:e.local)==null?void 0:a.set)==null?void 0:s.call(a,{[S]:n}))}catch{}}async function F(){(await j()).floatingBall?ee().catch(console.warn):Y()}F();var O,E,P;(P=(E=(O=chrome.storage)==null?void 0:O.onChanged)==null?void 0:E.addListener)==null||P.call(E,(n,e)=>{e==="local"&&n[S]&&F()});
