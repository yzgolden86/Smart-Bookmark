# Smart Bookmark

> 书签清理 + 新标签页看板 + AI 搜索 + 对比搜索 + 悬浮球 + 二维码 + 备份，一站式 Chrome / Edge 浏览器扩展。  
> 致敬 [LazyCat Bookmark Cleaner](https://github.com/Alanrk/LazyCat-Bookmark-Cleaner) 和 [TabMark](https://github.com/Alanrk/TabMark-Bookmark-New-Tab)。

> 🔱 **本仓库 fork 自 [xiaoniuge36/Smart-Bookmark](https://github.com/xiaoniuge36/Smart-Bookmark)**，
> 在原作者的基础上对新标签页书签看板做了较大幅度的体验增强（详见下方「本仓库的修改」一节）。
> 衷心感谢 [@xiaoniuge36](https://github.com/xiaoniuge36) 提供了如此完整的初始实现。

## 🆕 本仓库的修改（基于原版 0.2 之上）

新增 / 调整的能力主要集中在「新标签页 → 书签」页面，目标是把它做成一个**真正可日常用的书签主页**：

### 布局与可读性
- 顶栏 / 内容区最大宽度提升至 1760px，宽屏不再两侧大量留白
- 整页改为视口高度 + 内部分区滚动，**搜索框 sticky 时不再越过顶栏**
- 新增「书签导航宽度」**拖拽分隔条**：左右两栏中间细线可拖动调节，松手保存到设置；双击恢复默认
- 删除底部「Smart Bookmark · 本地优先 …」页脚文字
- 设置页拓宽到 max-w-5xl，Row 标签列加宽

### 书签视图
- 选中非底层文件夹时，右侧改为**按子文件夹分组展示**：每组卡片化呈现文件夹名 / 数量 / 部分书签预览，大屏每行 ≥5
- 书签卡片由「上下结构」改为「左图标 + 右标题 + URL 居中」，URL 行使用与正文同步缩放的 `text-meta`
- 「全部书签」默认每页 60 条；其余文件夹默认 30 条；分页 / 切换文件夹时**自动滚回顶部**
- 书签 / 文件夹**右键菜单**全量化：
  - 书签：在新标签页 / 新窗口 / 隐身窗口打开、展示二维码、编辑、复制、删除
  - 文件夹：根据层级动态显示「全部新标签页打开 (N) / 新窗口 / 隐身、添加文件夹、重命名、删除」
- 编辑书签弹窗支持改**标题 / URL / 所属文件夹**（带模糊搜索的文件夹树选择器）
- 新建文件夹后自动进入**内联重命名**

### 「常用」与搜索
- 顶部「常用」改为按访问频次（`chrome.topSites`）显示前 15 个，标题做了渐变美化
- 搜索为**全局检索**（不再受当前文件夹影响）
- 提交搜索（按钮 / Enter）一律调用当前搜索引擎，**不再"自动打开第一个匹配书签"**
- 搜索浮层重做：单滚动条 + 分段 sticky 标题 + 「查看全部 N 条匹配书签」「在浏览历史中查看更多」入口（后者跳转 `chrome://history/?q=…`）
- 删除搜索框下「匹配 N 个书签 · Enter 走搜索引擎」赘述文字
- 点击空白只关闭浮层、不清空查询；选中左侧文件夹 / 面包屑会一并清空查询并退出搜索焦点

### 动画 & 流畅性
- 入场动画从「逐卡延迟」改为**整页同步上浮（PPT「上浮（轻微）」效果）**，方向严格由下往上
- 动画曲线 `cubic-bezier(0.16, 1, 0.3, 1)`，仅 transform / opacity 触发 GPU 合成
- 主滚动容器 `contain: paint`、`scrollbar-gutter: stable`，悬浮 hover 过渡限定到 transform / shadow，避免 layout 抖动
- 设置页提供「书签动画」**总开关**与系统级 `prefers-reduced-motion` 适配

### 设置页新增项
- **字体大小**：4 档预设 + 滑块，作用于 `<html>` 字号 + 自定义 `--app-font-scale`，URL 等 px 文本一并缩放
- **书签动画**：开关
- **壁纸不透明度**：滑块；同时把壁纸图层抬到主层之上、降低主层遮罩，让壁纸真正"看得见"
- 旧的「侧栏宽度档位」选项移除，改为前述拖拽方式

### 性能 & 内部
- 一次遍历构建 `nodeMap / countMap / flat` 三件套（`buildIndex`），消除 `FolderTree` 渲染时的重复递归
- `chrome.bookmarks` 变化事件加 200ms debounce 重载
- 用 `useMemo / useCallback` 抽离热路径，分页变化时滚动平滑过渡

---

## 📝 近期更新日志

### 2026-05-05 · 第二轮优化（commit 244bb4a）

**AI 助手页面美化**
- 消息头像改为圆形徽章设计，用户头像使用 `User` 图标 + primary 渐变背景，AI 助手使用 `Sparkles` 图标 + claude-accent 渐变
- 用户名/助手名字号提升至 14px，字间距 0.4px，用户名使用渐变文字填充效果
- 消息气泡左侧加 3px 色条，用户消息淡 primary 背景，AI 消息白色半透明背景

**备份页面重构**
- 整体布局改为清晰的网格卡片式设计，每个功能区独立卡片 + 渐变标题
- 新增「备份范围」配置区：
  - 「同时备份扩展设置」开关：可选将 AI 配置、主题、语言等设置一并导出
  - 「包含敏感字段」开关（需先开启上一项）：可选导出 API Key、GitHub Token、WebDAV 用户名/密码/URL 等敏感信息
  - 默认仅备份书签树，敏感字段默认不导出
- 导入时自动检测备份文件是否包含设置，提示用户是否一并恢复

**扩展图标弹窗（Popup）新增功能**
- 新增「添加书签」按钮（置顶位置，最常用操作）
- 点击后弹出全屏对话框，自动填充当前标签页的标题和 URL
- 文件夹选择器支持模糊搜索（按名称或完整路径），显示层级缩进和完整路径预览
- 支持在当前选中文件夹下快速新建子文件夹
- 自动聚焦标题输入框并全选，方便快速修改后保存

---

### 2026-05-04 · 第一轮功能增强（commit 65dba38）

**书签看板（Dashboard）**
- 常用网站（Top Sites）右键菜单与书签菜单对齐：新标签页/新窗口/隐身窗口打开、生成二维码、复制链接
- 支持鼠标中键点击书签/常用网站直接在新标签页打开
- 新增设置项「书签打开方式」：可选「当前标签页」或「新标签页」（默认新标签页）
- 所有右键菜单项执行后自动关闭菜单（之前需要手动点击空白处）

**书签清理中心（Cleaner）**
- 性能优化：并发数从 8 提升至 16，超时时间从 6s 降至 4.5s
- 扫描完成后不再自动全选结果，改为手动勾选（避免误删）
- 使用基于游标的 worker 池替代 `Array.shift()`，减少数组操作开销

**对比搜索（Compare）**
- 新增「分屏多窗口」按钮：针对禁止 iframe 嵌入的搜索引擎（Google/Bing/百度等），一键在多个等宽弹窗中平铺打开
- 窗口自动计算位置和尺寸，横向排列，高度占满屏幕

**AI 助手（原「AI 搜索」）**
- 页面标题从「AI 搜索」改为「书签助手」
- 最大宽度从 1024px 拓宽至 1280px
- 功能定位从「仅回答书签相关问题」放宽为「通用 AI 助手 + 书签上下文」：
  - 可回答编程、写作、文档等任意问题
  - 当问题涉及书签时，自动注入书签快照供模型参考
- 对话记录使用 `sessionStorage` 持久化：切换 tab 保留，刷新页面/重开标签页清空
- 新增「注入 GitHub 热门」按钮：一键拉取 Discover 页的热门项目并注入对话上下文
- 新增「导出 Markdown」按钮：将完整对话导出为 `.md` 文件
- 新增「清空对话」按钮

**备份功能**
- 新增 WebDAV 远程备份支持：
  - 设置页配置 WebDAV 服务器地址、用户名、密码、远程文件夹路径
  - 备份页可一键上传备份到 WebDAV、列出远程备份列表、下载、删除
  - 支持连接测试，显示上传/下载进度

**搜索引擎**
- 新增 Yandex 搜索引擎

## ✨ 功能

### 🧹 书签清理中心
- 失效链接检测（可选，基于 HEAD/GET 探测）
- 重复书签检测（智能归一化 URL，忽略 utm_* / hash 等）
- 空文件夹检测
- 异常 URL 检测
- 扫描前预览、分组勾选、批量清理
- 书签画像（总数、Top 域名、近 30 天新增）

### 📑 新标签页看板
- 侧边栏文件夹列表，一键指定常用文件夹作为主页
- **🆕 拖拽排序** —— 在指定文件夹视图下按住卡片拖动，顺序会同步写回书签
- **🆕 卡片右键菜单** —— 复制链接 / 生成二维码
- 舒适 / 紧凑卡片密度
- 自定义壁纸（本地 URL 或远程链接）
- 暗黑模式（跟随系统 / 浅色 / 深色）
- 搜索：命中书签直接回车跳转，未命中自动跳搜索引擎

### 🔀 对比搜索（0.2 新增）
- 多搜索引擎并排呈现（Google / Bing / DuckDuckGo / 百度 / GitHub / Stack Overflow / YouTube / MDN 可多选）
- 支持 iframe 的引擎直接内嵌；禁 iframe 的引擎一键在新标签页打开
- "在全部引擎打开"一键分发到多 tab

### 💾 备份 / 导入导出（0.2 新增）
- 导出完整书签树为 **JSON**（Smart Bookmark 自有格式，可完整还原）
- 导出为 **Netscape HTML**（Chrome / Edge / Firefox / Safari 通吃）
- 从 JSON / Netscape HTML 导入到指定文件夹
- 导入仅新增，重复 URL 自动跳过，不会覆盖

### 🎈 网页内悬浮球（0.2 新增）
- 任意网页右下角悬浮按钮，可拖动调整位置（位置会持久化）
- 点击展开迷你面板：书签即时搜索、打开侧边栏、打开清理中心、复制当前 URL、生成二维码
- Shadow DOM 隔离样式，不会污染页面
- 一键关闭 / 设置页开关 / `Alt+Shift+F` 快捷键切换

### 🔳 二维码（0.2 新增）
- 卡片菜单、悬浮球、右键菜单均可生成二维码
- 支持浅色 / 深色自动适配
- 一键下载 PNG / 复制 URL

### 🌐 i18n（0.2 新增）
- 中文 / English 全 UI 覆盖，跟随系统自动切换
- 设置页手动切换，实时生效

### ✨ AI 助手
- 支持 OpenAI、Anthropic，API Key 只存本地
- 流式输出，支持停止

### 📌 侧边栏
- 任意网页按 **Alt+B** / **⌘+B** 打开
- 实时响应书签变更，搜索即时过滤

### 🖱️ 右键菜单 + 快捷键
- 选中文字 → 在 Smart Bookmark 中搜索
- 当前页面 → 复制 URL / 生成二维码
- 任意链接 → 复制链接 / 生成二维码
- 扩展图标右键 → 打开清理中心 / 侧边栏 / 切换悬浮球
- `Alt+Shift+C` → 一键打开清理中心
- `Alt+B` / `⌘+B` → 侧边栏
- `Alt+Shift+F` → 切换网页悬浮球

## 🛠️ 开发

```bash
npm install
npm run icons     # 从 icon.svg 生成四个 PNG
npm run dev       # Vite dev server（非扩展环境，仅用于 UI 调试）
npm run build     # 构建到 dist/（自动生成图标 + tsc + vite + postbuild）
npm run zip       # 构建并打包 dist.zip，可上传商店
```

### 直接安装（零构建，推荐）

仓库已附带最新的预构建产物 `dist/`，`git clone` 后**无需 npm install** 即可直接加载：

```bash
# 本 fork
git clone https://github.com/yzgolden86/Smart-Bookmark.git
# 或原始仓库
# git clone https://github.com/xiaoniuge36/Smart-Bookmark.git
```

1. Chrome / Edge 打开 `chrome://extensions` 或 `edge://extensions`
2. 开启「开发者模式」→ 点击「加载已解压的扩展程序」→ 选择克隆后的 `dist/` 目录
3. 打开新标签页即可看到 Smart Bookmark

### 本地开发 / 自行构建

```bash
npm install
npm run build    # 重新生成 dist/
npm run zip      # 打包 dist.zip（上传商店用）
```

> 注：`dist/` 会随代码更新一并提交，Pull 最新后重新加载扩展即可生效。

### 目录结构

```
smart-bookmark/
├── manifest.json            # MV3 manifest
├── public/icons/            # 图标源（SVG）与导出后的 PNG
├── scripts/
│   ├── icons.mjs            # sharp 批量导出 PNG
│   ├── postbuild.mjs        # 把 manifest & icons 拷贝到 dist/，HTML 上移到根
│   └── zip.mjs              # 打包 dist.zip
├── src/
│   ├── background/          # Service Worker（上下文菜单、快捷键、消息代理）
│   ├── content/             # 网页内悬浮球（Shadow DOM）
│   ├── newtab/              # 新标签页（看板 / 清理 / 对比 / AI / 备份 / 设置）
│   ├── sidepanel/           # 侧边栏
│   ├── popup/               # 工具栏弹窗
│   ├── components/ui/       # shadcn/ui 组件 + toast
│   ├── lib/                 # bookmarks / cleaner / ai / storage / theme
│   │                        # backup / i18n / qr / utils
│   ├── types/               # 共享类型
│   └── styles/              # Tailwind globals
└── vite.config.ts
```

## 🗺️ Roadmap

已完成 ✅（0.2）
- [x] 拖拽排序 / 文件夹内自定义顺序
- [x] 生成二维码 / 复制 URL 上下文菜单（网页内）
- [x] 对比搜索（多搜索引擎并排对比）
- [x] 悬浮球
- [x] 备份 / 导出 JSON / HTML
- [x] 英文 i18n

下一步候选
- [ ] OAuth 版 Google Bookmarks / Pocket / Raindrop 同步
- [ ] 书签标签（Tag）与智能分组
- [ ] 基于 AI 的书签自动分类 / 去重建议
- [ ] 浏览器历史可视化时间线
- [ ] 书签导出为 Markdown
- [ ] PWA 版本 / Firefox 适配

## 🔐 隐私

- 书签数据 100% 本地处理
- AI API Key 仅保存在 `chrome.storage.local`
- 失效链接检测会向对应域名发起 HEAD/GET 请求，可在扫描时选择关闭
- 悬浮球只在你开启时才会注入；注入时不发任何请求，搜索走本地书签
- 完整隐私政策：[PRIVACY.md](./PRIVACY.md) · [在线版](https://xiaoniuge36.github.io/Smart-Bookmark/privacy.html)

## 🏪 商店上架

商店上架文案与权限说明见 [`STORE_LISTING.md`](./STORE_LISTING.md)。

## 🙏 致谢

特别感谢原始仓库作者 **[@xiaoniuge36](https://github.com/xiaoniuge36)** 创建并持续维护
[xiaoniuge36/Smart-Bookmark](https://github.com/xiaoniuge36/Smart-Bookmark)。
本仓库是在其工作基础上派生出来的个人定制版本，所有底层架构（MV3 多入口 / 备份 / 清理 / AI / 悬浮球 / 对比搜索等）
均由原作者实现，本 fork 仅在新标签页书签看板上做了体验向的二次开发。

同时感谢真诚、友善、团结、专业的 Linuxdo 社区，让我学到那么多有关 ai 相关知识。

<p>
  <a href="https://linux.do">
    <img src="https://img.shields.io/badge/LinuxDo-community-1f6feb" alt="LinuxDo">
  </a>
</p>

- [LinuxDo](https://linux.do) 学 ai, 上 L 站!

## 📄 License

MIT
