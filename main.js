const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, shell, Notification, nativeTheme, net } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFile } = require('child_process');
const util = require('util');
const execFileP = util.promisify(execFile);

let mainWindow;
let fsWin = null;   // 当前全屏沉浸时钟窗口
let closingFsWin = null; // 正在退出全屏的窗口，避免短时间内创建重叠窗口
let pendingFullscreenDark = null; // 退出尚未结束时用户再次打开的请求
let tray;
let timerInterval;
let currentSeconds = 0;
let isRunning = false;
let isCompact = false;

// ── 托盘图标：三道水波纹（简洁 template image，macOS 深/浅色均可用）──
const TRAY_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
  <path d="M6 16 Q13 10 20 16 Q27 22 34 16 Q38 13 42 16" stroke="black" stroke-width="3"   stroke-linecap="round" fill="none"/>
  <path d="M6 24 Q13 18 20 24 Q27 30 34 24 Q38 21 42 24" stroke="black" stroke-width="2.5" stroke-linecap="round" fill="none"/>
  <path d="M6 32 Q13 26 20 32 Q27 38 34 32 Q38 29 42 32" stroke="black" stroke-width="2"   stroke-linecap="round" fill="none"/>
</svg>`;

function makeTrayIcon() {
  const b64 = Buffer.from(TRAY_ICON_SVG).toString('base64');
  const img = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${b64}`);
  img.setTemplateImage(true);   // macOS 自动适配深色/浅色菜单栏
  return img;
}

// 允许计时器结束等无手势场景自动播放音频
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// ── 单实例锁：防止多开导致托盘/窗口抢占 ──
const gotSingleLock = app.requestSingleInstanceLock();
if (!gotSingleLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // 沉浸时钟打开期间，二次启动不应把置顶小窗口带回全屏页面上方。
    if (fsWin && !fsWin.isDestroyed() && !fsWin._closing) {
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) mainWindow.hide();
      if (!fsWin.isVisible()) fsWin.show();
      fsWin.focus();
      return;
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();
    createTray();
  });
}

app.on('window-all-closed', () => {
  // macOS 保留托盘，不退出
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
  else mainWindow.show();
});

// ── 主窗口 ──
function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: 340,
    height: 500,
    x: width - 360,
    y: 60,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,       // 固定尺寸，禁止用户拖拽缩放
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,   // 隐藏到托盘后计时器不被 Chromium 节流
    },
  });

  mainWindow.loadFile('renderer/index.html');

  mainWindow.on('close', (e) => {
    e.preventDefault();
    mainWindow.hide();
  });
}

function restoreMainWindow(fromFullscreen) {
  if (fromFullscreen && fromFullscreen._mainWindowRestored) return;
  if (fromFullscreen) fromFullscreen._mainWindowRestored = true;
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    // 及时停止主渲染进程中的全屏状态推送定时器。
    mainWindow.webContents.send('fs-closed');
  }
}

// ── 全屏沉浸时钟 ──
function openFullscreen(dark = false) {
  if (fsWin && !fsWin.isDestroyed()) {
    if (fsWin._closing) {
      pendingFullscreenDark = dark;
      return;
    }
    fsWin.show();
    fsWin.focus();
    return;
  }
  // 快速连续点击时不要让退出中的窗口与新窗口重叠。
  if (closingFsWin && !closingFsWin.isDestroyed()) {
    pendingFullscreenDark = dark;
    return;
  }
  const disp = screen.getPrimaryDisplay();
  const fsBg = dark ? '#0C0A07' : '#F8F6F0';
  fsWin = new BrowserWindow({
    show: false,
    frame: false,                  // 无边框，内容铺满整屏
    fullscreen: true,
    simpleFullscreen: true,        // 简单全屏：铺满整屏并隐藏菜单栏与 Dock（无边框窗口标准全屏会被系统留顶部菜单栏黑条）
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    backgroundColor: fsBg,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  const win = fsWin;
  win._fsBg = fsBg;
  win.loadFile('renderer/fullscreen.html');
  win.once('ready-to-show', () => {
    if (win.isDestroyed() || win._closing) return;
    win.show();
    if (!win.isSimpleFullScreen()) {
      try { win.setSimpleFullScreen(true); } catch (e) {}
    }
    // 全屏窗口层级高于被置顶（floating）的主窗，确保独占屏幕
    try { win.setAlwaysOnTop(true, 'screen-saver'); } catch (e) {}
    win.moveTop();
    win.focus();
    // 简单全屏与主窗同处一个 Space，隐藏主窗让全屏页独占屏幕
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
  });
  win.webContents.on('did-finish-load', () => {
    if (!win._closing && fsWin === win && mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('fs-opened');
    }
  });
  win.on('closed', () => {
    if (fsWin === win) fsWin = null;
    if (closingFsWin === win) closingFsWin = null;
    restoreMainWindow(win);

    if (pendingFullscreenDark !== null) {
      const nextDark = pendingFullscreenDark;
      pendingFullscreenDark = null;
      openFullscreen(nextDark);
    }
  });
}

function closeFullscreen() {
  const win = fsWin;
  if (!win || win.isDestroyed() || win._closing) return;

  win._closing = true;
  fsWin = null; // 立刻停止 fs-state 向即将关闭的窗口发送消息
  closingFsWin = win;
  let cleanupTimer = null;
  const forceClose = () => {
    if (cleanupTimer !== null) {
      clearTimeout(cleanupTimer);
      cleanupTimer = null;
    }
    if (!win.isDestroyed()) win.destroy();
  };

  try {
    win.setAlwaysOnTop(false);
    // 先隐藏沉浸窗口，再恢复小窗口；可见的 UI 不必等待 macOS 全屏状态清理完成。
    win.hide();
    restoreMainWindow(win);

    if (win.isSimpleFullScreen() || win.isFullScreen()) {
      win.once('leave-full-screen', forceClose);
      cleanupTimer = setTimeout(forceClose, 800); // 隐藏后的后台兜底，不再阻塞界面恢复
      if (win.isSimpleFullScreen()) win.setSimpleFullScreen(false);
      else win.setFullScreen(false);
    } else {
      forceClose();
    }
  } catch (e) {
    forceClose();
    restoreMainWindow(win);
  }
}

ipcMain.on('fs-open',  (_, dark) => openFullscreen(!!dark));
ipcMain.on('fs-close', () => closeFullscreen());
ipcMain.on('fs-state', (_, data) => {
  if (!fsWin || fsWin.isDestroyed() || fsWin._closing) return;
  fsWin.webContents.send('fs-tick', data);
  // 主题切换时同步窗口背景，避免顶部原生标题栏条出现色差
  const bg = data.dark ? '#0C0A07' : '#F8F6F0';
  if (fsWin._fsBg !== bg) {
    fsWin._fsBg = bg;
    fsWin.setBackgroundColor(bg);
  }
});

// 全屏控制按钮只向主渲染进程发送指令，确保所有计时状态仍由唯一计时器维护。
ipcMain.on('fs-timer-control', (_, action) => {
  if (!['toggle', 'reset', 'skip'].includes(action)) return;
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send('fs-timer-command', action);
});

// ── 每日一句：一言 hitokoto（主进程走网络，避开 CSP/CORS；分类 d/e/f/j/k/l）──
ipcMain.handle('fetch-hitokoto', async () => {
  const url = 'https://v1.hitokoto.cn/?c=d&c=e&c=f&c=j&c=k&c=l';
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    try {
      const req = net.request(url);
      let body = '';
      const timer = setTimeout(() => { try { req.abort(); } catch (e) {} done(null); }, 6000);
      req.on('response', (res) => {
        res.on('data', (c) => { body += c.toString(); });
        res.on('end', () => {
          clearTimeout(timer);
          try { done(JSON.parse(body)); } catch (e) { done(null); }
        });
      });
      req.on('error', () => { clearTimeout(timer); done(null); });
      req.end();
    } catch (e) {
      done(null);
    }
  });
});

// ── 系统托盘 ──
function createTray() {
  tray = new Tray(makeTrayIcon());
  tray.setTitle(' ≈');
  tray.setToolTip('Chan zone');

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示窗口', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: 'separator' },
    { label: '退出', click: () => app.exit(0) },
  ]);
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ── IPC：接收渲染进程的计时器状态 ──
ipcMain.on('timer-tick', (_, { remaining, running, label }) => {
  if (!tray) return;
  if (running && remaining > 0) {
    const h = Math.floor(remaining / 3600);
    const m = String(Math.floor((remaining % 3600) / 60)).padStart(2, '0');
    const s = String(remaining % 60).padStart(2, '0');
    tray.setTitle(` ${h > 0 ? h + ':' : ''}${m}:${s}`);
  } else {
    tray.setTitle(' ≈');   // 空闲时显示水波纹符号，保持 tray item 可见
  }
});

// ── IPC：计时结束系统通知（窗口隐藏时也能提醒）──
ipcMain.on('timer-ended', (_, { title, body }) => {
  try {
    const n = new Notification({
      title: title || '计时结束',
      body: body || '',
      silent: true,          // 提示音由渲染进程的引磬负责，避免叠加
    });
    n.on('click', () => {
      if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
    });
    n.show();
  } catch (err) {
    console.warn('通知失败:', err);
  }
  if (tray) tray.setTitle(' ≈');
});

// ── IPC：置顶切换 ──
let isPinned = true;   // 初始 alwaysOnTop: true
ipcMain.on('window-pin-toggle', () => {
  if (!mainWindow) return;
  isPinned = !isPinned;
  mainWindow.setAlwaysOnTop(isPinned, 'floating');
  mainWindow.webContents.send('window-pin-changed', isPinned);
});

// ── 黑夜/白昼：切换系统外观，让 vibrancy 材质跟随，消除圆角外白边 ──
ipcMain.on('set-theme', (_e, dark) => {
  nativeTheme.themeSource = dark ? 'dark' : 'light';
});

ipcMain.on('window-compact-toggle', () => {
  if (!mainWindow) return;
  isCompact = !isCompact;

  if (isCompact) {
    mainWindow.setSize(280, 360, true);   // 固定迷你尺寸
  } else {
    mainWindow.setSize(340, 500, true);   // 固定正常尺寸
  }

  mainWindow.webContents.send('window-compact-changed', isCompact);
});

// ── 转义 AppleScript 字符串字面量中的反斜杠与双引号 ──
function escAS(t) {
  return String(t).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// ── 日历写入辅助：标识同一会话，跨 AppleScript 与 .ics 路径去重 ──
function buildCalendarScript({ title, start, end, calName, desc, sessionMarker }) {
  const parts = (d) => [
    d.getFullYear(), d.getMonth() + 1, d.getDate(),
    d.getHours(), d.getMinutes(), d.getSeconds(),
  ];
  const s = parts(start), e = parts(end);
  return `
on makeDate(y, mo, d, h, mi, s)
  set dt to current date
  set day of dt to 1
  set year of dt to y
  set month of dt to mo
  set day of dt to d
  set hours of dt to h
  set minutes of dt to mi
  set seconds of dt to s
  return dt
end makeDate
tell application "Calendar"
  set sd to my makeDate(${s[0]}, ${s[1]}, ${s[2]}, ${s[3]}, ${s[4]}, ${s[5]})
  set ed to my makeDate(${e[0]}, ${e[1]}, ${e[2]}, ${e[3]}, ${e[4]}, ${e[5]})
  set calName to "${escAS(calName)}"
  if not (exists calendar calName) then
    error "CHANZONE_CALENDAR_NOT_FOUND: " & calName number 1001
  end if
  set targetCal to calendar calName
  set sessionMarker to "${escAS(sessionMarker)}"
  tell targetCal
    set matchingEvents to (every event whose description contains sessionMarker)
    if (count of matchingEvents) > 0 then return "already-exists"
    make new event with properties {summary:"${escAS(title)}", start date:sd, end date:ed, description:"${escAS(desc)} · ${escAS(sessionMarker)}"}
    return "created"
  end tell
end tell`.trim();
}

function buildCalendarProbeScript({ calName, sessionMarker }) {
  return `
tell application "Calendar"
  set calName to "${escAS(calName)}"
  if not (exists calendar calName) then
    error "CHANZONE_CALENDAR_NOT_FOUND: " & calName number 1001
  end if
  set targetCal to calendar calName
  set sessionMarker to "${escAS(sessionMarker)}"
  tell targetCal
    set matchingEvents to (every event whose description contains sessionMarker)
    if (count of matchingEvents) > 0 then return "exists"
  end tell
  return "missing"
end tell`.trim();
}

function isMissingCalendarError(err) {
  return `${err?.stderr || ''}\n${err?.message || ''}`.includes('CHANZONE_CALENDAR_NOT_FOUND:');
}

function isAppleEventsPermissionError(err) {
  return /not authorized to send apple events|not permitted to send apple events|-1743/i
    .test(`${err?.stderr || ''}\n${err?.message || ''}`);
}

function escapeICSText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

const calendarWriteCache = new Map();

async function writeCalendarEvent({ title, startISO, endISO, calName, desc, sessionId }) {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const targetCal = calName || '日历';
  const eventDesc = desc || '由 Chan zone 记录';
  const writeIdentity = sessionId || JSON.stringify({ title, startISO, endISO, calName: targetCal, desc: eventDesc });
  const identityHash = crypto.createHash('sha256').update(String(writeIdentity)).digest('hex');
  const sessionMarker = `ChanZoneSession:${identityHash}`;
  const uid = `chanzone-${identityHash}@local`;

  // 1) 优先静默写入。AppleScript 在创建前也会检查 session marker，避免重试重复创建。
  try {
    const script = buildCalendarScript({
      title, start, end, calName: targetCal, desc: eventDesc, sessionMarker,
    });
    await execFileP('osascript', ['-e', script], { timeout: 60000 });
    return { ok: true, mode: 'silent' };
  } catch (err) {
    if (isMissingCalendarError(err)) {
      return { ok: false, error: `找不到名为“${targetCal}”的日历，请在设置中选择现有日历。` };
    }
    console.warn('静默写入日历失败，正在确认事件是否已创建：', err.message);
  }

  // AppleScript 可能在事件已创建后才报告错误。先按稳定 marker 查询；无法确认时不冒险弹出重复导入。
  let fallbackSafe = false;
  try {
    const probe = await execFileP('osascript', ['-e', buildCalendarProbeScript({
      calName: targetCal, sessionMarker,
    })], { timeout: 60000 });
    const status = String(probe.stdout || '').trim();
    if (status === 'exists') return { ok: true, mode: 'silent' };
    if (status === 'missing') fallbackSafe = true;
    else return { ok: false, error: '无法确认日历写入结果；为避免重复事件，未打开导入文件。' };
  } catch (probeErr) {
    if (isMissingCalendarError(probeErr)) {
      return { ok: false, error: `找不到名为“${targetCal}”的日历，请在设置中选择现有日历。` };
    }
    // 被系统明确拒绝 Apple Events 时，脚本未能创建事件，可安全提供手动导入。
    if (isAppleEventsPermissionError(probeErr)) fallbackSafe = true;
    else return { ok: false, error: '无法确认日历写入是否完成；为避免重复事件，未打开导入文件。' };
  }
  if (!fallbackSafe) return { ok: false, error: '日历写入状态不明确，已阻止可能产生重复事件的导入。' };

  // 2) 仅在确认事件不存在或系统明确拒绝 Apple Events 时回退 .ics。
  try {
    const fmtICS = (d) => {
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}` +
             `T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    };
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'CALSCALE:GREGORIAN',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${fmtICS(new Date())}`,
      `DTSTART:${fmtICS(start)}`,
      `DTEND:${fmtICS(end)}`,
      `SUMMARY:${escapeICSText(title)}`,
      `DESCRIPTION:${escapeICSText(`${eventDesc} · ${sessionMarker}`)}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const tmpPath = path.join(app.getPath('temp'), `chanzone-${identityHash}.ics`);
    fs.writeFileSync(tmpPath, ics, 'utf8');
    const openError = await shell.openPath(tmpPath);
    if (openError) return { ok: false, error: `无法打开日历导入文件：${openError}` };
    return { ok: true, mode: 'ics' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── IPC：日历写入按会话幂等；并发请求共享同一个进行中的 Promise ──
ipcMain.handle('add-to-calendar', async (_, payload = {}) => {
  const { sessionId, title, startISO, endISO, calName, desc } = payload;
  const fallbackIdentity = JSON.stringify({ title, startISO, endISO, calName, desc });
  const cacheKey = sessionId ? `session:${sessionId}` : `payload:${fallbackIdentity}`;
  if (calendarWriteCache.has(cacheKey)) return calendarWriteCache.get(cacheKey);

  const request = writeCalendarEvent({ title, startISO, endISO, calName, desc, sessionId })
    .catch(err => ({ ok: false, error: err?.message || String(err) }));
  calendarWriteCache.set(cacheKey, request);
  const result = await request;
  // 失败允许用户重试；成功与 .ics 待确认结果则缓存，防止反复点击弹出多个导入窗口。
  if (!result?.ok && calendarWriteCache.get(cacheKey) === request) calendarWriteCache.delete(cacheKey);
  return result;
});
// ── IPC：窗口控制 ──
ipcMain.on('window-close',    () => mainWindow.hide());
ipcMain.on('window-minimize', () => mainWindow.minimize());
