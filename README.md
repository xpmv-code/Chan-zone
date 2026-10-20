# Chan zone · 禅意专注计时器（个人 Fork）

> *需要的不多，想要的太多。*  
> — 圣严法师 · 108自在语

Chan zone 是一款以禅意美学为灵感的轻量专注工具。本仓库是基于原项目进行的个人二次开发，重点增强了全屏沉浸时钟、计时模式、每日一言同步和 macOS 使用体验。

- **本 Fork：** [xpmv-code/Chan-zone](https://github.com/xpmv-code/Chan-zone)
- **原始仓库（上游）：** [Tree-rock/Chan-zone](https://github.com/Tree-rock/Chan-zone)
- **下载 macOS 版本：** [GitHub Releases](https://github.com/xpmv-code/Chan-zone/releases/latest)

本仓库保留原项目的设计方向与核心体验，并在此基础上独立迭代。新增内容、构建方式及发布包以本仓库为准。

---

## 与原仓库的主要差异

以下是本 Fork 相比上游原始项目的重点新增或扩展内容：

### 1. 独立的全屏沉浸时钟

- 新增独立全屏页面，显示当前任务、计时、进度环和每日一言。
- 新增全屏右侧竖向计时控制，可直接开始/暂停、重置或跳过当前阶段，不遮挡每日一言。
- 点击中央数字可在计时视图与系统当前时间之间切换。
- 新增翻页时钟（Split-flap）动画，以 CSS 3D 翻转显示时、分、秒。
- 支持 `Esc` 或点击空白退出全屏，并优化退出时恢复小窗口的流程。

### 2. 更丰富的计时模式与状态处理

- 在番茄钟专注、小憩、长休之外，扩展正计时与自由倒计时模式。
- 使用时间戳计算计时经过时间，降低定时器漂移与后台节流带来的偏差。
- 增加单实例保护，减少重复启动造成的窗口和托盘冲突。
- 完善主题、窗口置顶、极简窗口等设置与状态同步。

### 3. 每日一言更新与跨界面同步

- 从一言接口获取每日一言，默认每 **15 分钟**尝试更新一次。
- 小窗口与全屏共用同一份正文、作者及来源，不再各自维护不同的显示内容。
- 使用本地缓存；接口请求失败时保留现有内容，避免页面空白。

### 4. macOS 集成与稳定性改进

- 增加计时结束的系统通知。
- 完善日历记录流程：尝试通过 AppleScript 写入 macOS 日历，失败时回退为 `.ics` 文件。
- 优化全屏窗口的退出与生命周期管理，减少退出后无效的状态推送。

> 上述为本 Fork 的主要开发差异，并非声称原项目没有所有相关底层代码。请通过本仓库提交历史及与 [上游仓库](https://github.com/Tree-rock/Chan-zone) 的比较查看具体变更。

---

## 功能概览

- **番茄钟：** 专注、小憩、长休，按完成轮次自动切换。
- **正计时与自由倒计时：** 适用于不固定时长的专注任务。
- **浮动小窗口：** 支持置顶和极简模式，尽量减少对主工作区的干扰。
- **全屏沉浸模式：** 任务显示、进度环、计时视图、翻页时钟，以及右侧开始/暂停、重置和跳过按钮。
- **主题：** 黑夜与白昼外观。
- **声音：** 开始时播放木鱼音效，结束时播放引磬音效；设置页可试听及关闭。
- **每日一言：** 15 分钟轮换，并同步小窗口与全屏的来源信息。
- **日历记录：** 支持完成后记录和手动保存已用时段。

---

## 下载与安装

打开 [GitHub Releases](https://github.com/xpmv-code/Chan-zone/releases/latest)，下载最新版本中适合你的 Apple Silicon Mac 的 `.dmg` 或 `.zip` 文件。

- `.dmg`：打开后按提示将应用拖入应用程序文件夹（如提供该窗口）。
- `.zip`：解压后将 `Chan zone.app` 移动到应用程序文件夹。
- 当前发布目标为 **macOS arm64（Apple Silicon）**，例如 M 系列 Mac；暂未配置 Intel `x64` 构建。
- **v1.1.1 发布说明：** 本版新增全屏右侧竖向计时控制按钮。构建使用本机可用的 Apple Development 证书签名，未完成 Apple 公证；这不是面向公众分发的 Developer ID Application 签名配置。macOS 可能显示安全提示或阻止打开。正式公开分发前，建议在配置好 Developer ID Application 证书与公证凭证的环境中重新构建。下载时请同时核对 Release 提供的 SHA-256 校验值。

---

## 从源码运行

环境要求：macOS、Node.js 和 npm。

```bash
git clone https://github.com/xpmv-code/Chan-zone.git
cd Chan-zone
npm install
npm start
```

### 本地构建 macOS 发布包

```bash
npm install
npm run build
```

构建成功后，产物输出到 `dist/`，包含本仓库配置的 arm64 `.dmg` 与 `.zip` 分发包。构建可能使用本机可用的签名身份，但不代表已完成 Apple 公证；请查看构建日志与 Release 说明。

### 基础检查

```bash
node --check main.js
node --check preload.js
node --check renderer/renderer.js
node --check renderer/fullscreen.js
git diff --check
```

项目目前没有配置独立的自动化测试套件，发版前仍需在实际 macOS 环境中手动检查计时、音效、日历和全屏行为。

---

## 技术栈与项目结构

| 部分 | 技术 / 文件 |
|---|---|
| 桌面运行时 | Electron 32 |
| 前端界面 | 原生 HTML、CSS、JavaScript，无前端框架 |
| 主进程 | `main.js`：窗口、托盘、通知、网络请求和日历写入 |
| 安全桥接 | `preload.js`：通过受控 IPC 连接主进程与渲染进程 |
| 主界面 | `renderer/index.html`、`renderer/renderer.js`、`renderer/styles.css` |
| 全屏界面 | `renderer/fullscreen.html`、`renderer/fullscreen.js`、`renderer/fullscreen.css` |
| 音频 | `HTMLAudioElement` |
| 日历 | AppleScript 写入；失败时生成 `.ics` 文件 |
| 构建 | `electron-builder`，macOS arm64 `.dmg` / `.zip` |

---

## 上游与二次开发说明

- 原项目：**[Tree-rock/Chan-zone](https://github.com/Tree-rock/Chan-zone)**。
- 当前仓库：**[xpmv-code/Chan-zone](https://github.com/xpmv-code/Chan-zone)**，为个人 Fork。
- `origin` 指向个人 Fork，`upstream` 指向原始仓库。开发提交请推送到自己的 `origin`；需要同步原项目时，再从 `upstream` 获取更新并检查差异。
- 本 Fork 的 Releases 仅代表该 Fork 的构建产物与版本，不代表上游项目官方发布。

---

## 设计原则

1. **仪式感优先：** 声音与计时共同构成开始专注的仪式。
2. **减法优先：** 不依赖账号、云端同步或复杂的效率统计。
3. **不打扰：** 小窗口、置顶与全屏模式适配不同专注场景。
4. **稳定优先：** 尽可能使用时间戳计时，并在网络请求失败时保留可用内容。

---

## 致谢

感谢 [Tree-rock/Chan-zone](https://github.com/Tree-rock/Chan-zone) 原项目提供的基础实现与设计方向。本仓库是在原项目基础上的独立二次开发。请查阅原仓库了解上游项目，查阅本仓库 Releases 获取 Fork 版本。