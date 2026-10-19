# Chan zone · 禅意专注计时器

> *需要的不多，想要的太多。*  
> — 圣严法师 · 108自在语

Chan zone 是一款以禅意美学为灵感的轻量专注工具。用简洁的计时界面、木鱼与引磬音效，以及每日一言，帮助你在开始工作前建立专注仪式。

> **当前平台：** macOS（项目构建配置面向 Apple Silicon / `arm64`）。Android 平板版本尚未实现，相关支持属于后续规划。

---

## 功能

### 专注与休息

- **番茄钟：** 专注、小憩、长休，按完成轮次自动切换。
- **正计时与倒计时：** 支持自由计时和自定义倒计时时长。
- **准确计时：** 使用时间戳计算经过时间，降低 `setInterval` 漂移、后台节流和系统休眠造成的误差。
- **托盘倒计时：** 在 macOS 托盘显示运行中的剩余时间；主窗口隐藏后仍可继续计时。
- **系统通知：** 计时结束时发送通知。

### 沉浸式界面

- **浮动小窗口：** 支持窗口置顶，尽量减少对主工作区的干扰。
- **极简模式：** 将窗口切换为更紧凑的尺寸。
- **全屏沉浸时钟：** 展示任务、计时进度、每日一言；点击中央数字可切换计时视图与当前时间。
- **翻页时钟：** 使用 CSS 3D 翻转动画显示时、分、秒。
- **深浅主题：** 支持黑夜与白昼外观。
- **快捷任务：** 可快速选择常见任务，也可编辑当前任务名称。

### 声音、语录与记录

- **木鱼与引磬：** 开始专注时播放木鱼音效，计时结束时播放引磬音效；设置页支持试听和关闭音效。
- **每日一言：** 从一言接口获取内容，并每 15 分钟尝试自动换新；小窗口与全屏共用同一份正文、作者和来源。
- **本地缓存与回退：** 保存当前每日一言缓存；网络不可用时保留现有内容，避免界面空白。
- **日历记录：** 可记录完成的专注时段，也可手动保存中途已用时间。优先尝试通过 AppleScript 写入 macOS 日历，失败时回退为 `.ics` 文件。

---

## 环境要求

- macOS
- Node.js（建议使用当前受支持的 LTS 版本）
- npm

如需构建 macOS 应用，建议安装 Xcode Command Line Tools，并确保本机的构建与代码签名环境可用。

## 开发运行

```bash
git clone https://github.com/Tree-rock/Chan-zone.git
cd Chan-zone
npm install
npm start
```

## 构建 macOS 应用

项目当前的 `electron-builder` 配置目标为 **macOS arm64 目录包**：

```bash
npm run build
```

默认产物位置：

```text
dist/mac-arm64/Chan zone.app
```

这会生成可在本机测试的 `.app` 目录包，不等于已完成面向公众发布的签名与公证流程。向其他用户分发前，请确认开发者签名、Apple 公证及相关系统权限提示。

当前 `package.json` 尚未配置专门的自动化测试脚本。提交代码前可以先运行基础检查：

```bash
node --check main.js
node --check preload.js
node --check renderer/renderer.js
node --check renderer/fullscreen.js
git diff --check
```

---

## 技术栈与结构

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
| 构建 | `electron-builder`，当前 target 为 macOS arm64 `dir` |

---

## Android 平板支持规划

Android 版本目前**尚未实现，也不能用当前 Electron 配置直接构建 APK**。后续可以评估使用 Capacitor 将原生 Web 界面接入 Android 工程，并逐项适配平台能力。

预期工作包括：

- 适配平板横屏、竖屏、触摸操作与沉浸式全屏。
- 将 Electron 的窗口管理、托盘、通知与 IPC 替换为 Android 对应实现。
- 验证应用切到后台、设备休眠后计时与 15 分钟每日一言轮换的行为。
- 评估常亮屏幕、系统通知、音效及 Android 日历集成。
- 建立 Android 构建配置并生成可安装 APK；发布应用商店时再生成 AAB。

在这些工作完成并经过真实设备测试之前，请将 Android 视为计划中的平台，而非现有功能。

---

## 设计原则

1. **仪式感优先：** 声音与计时共同构成开始专注的仪式。
2. **减法优先：** 不依赖账号、云端同步或复杂的效率统计。
3. **不打扰：** 小窗口、置顶与全屏模式适配不同专注场景。
4. **稳定优先：** 计时状态尽可能基于时间戳计算，并在网络请求失败时保留可用内容。

---

## 关于

Chan zone 最初是为阅读与慢学习场景探索的禅意计时工具。项目以朴素的视觉设计和轻量交互为目标，具体功能和支持平台以仓库当前代码为准。
