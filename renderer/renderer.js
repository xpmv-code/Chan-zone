'use strict';

// ── Quotes ──────────────────────────────────────────────────────────────────
const FOCUS_QUOTES = [
  '需要的不多，想要的太多。',
  '尽心尽力第一，不争你我多少。',
  '慈悲没有敌人，智慧不起烦恼。',
  '心量要大，自我要小。',
  '要能放下，才能提起。提放自如，是自在人。',
  '平常心就是最自在、最愉快的心。',
  '踏实地走一步路，胜过说一百句空洞的漂亮语。',
  '面对它、接受它、处理它、放下它。',
  '过去已成虚幻，未来尚是梦想，把握现在最重要。',
  '智慧，不是知识，不是经验，不是思辩，而是超越自我中心的态度。',
  '无论忙碌与否，内心保持安定、祥和、清明，就是修禅。',
  '自在的人生，并不是没有挫折，而是在挫折中仍能保持身心平稳。',
  '只要心安，就有平安。',
  '病不一定苦，穷不一定苦，心苦才是真正的苦。',
  '把不如意的事当成有意思的体验，就会有不同的收获。',
];
const REST_QUOTES = [
  '布施的人有福，行善的人快乐。',
  '身心常放松，逢人面带笑。',
  '感谢给我们机会，顺境逆境皆是恩人。',
  '忙人时间最多，勤劳健康最好。',
  '奉献既是修行，安心既是成就。',
  '好人不寂寞，善人最快乐。',
  '内和外和，因和缘和，平平安安真自在。',
];

// ── Config ───────────────────────────────────────────────────────────────────
const cfg = {
  focusMins:   25,
  shortMins:   5,
  longMins:    15,
  countdownMins: 10,
  calEnable:   true,
  calName:     '日历',
  soundEnable: true,
};

// ── State ────────────────────────────────────────────────────────────────────
let mode = 'focus';
let totalSecs, remaining;
let elapsed = 0;          // 正计时已流逝秒数
let running = false;
let timerId = null;
let session = 1;
let completedSessions = 0;
let sessionStart = null;

// 时间戳计时（抗 setInterval 漂移 / 后台节流 / 系统休眠）
let segStartTs = 0;       // 当前运行段起点（Date.now()，ms）
let frozenElapsed = 0;    // 正计时：暂停前已累计的秒数
let segRemaining = 0;     // 倒计时：本段开始时的剩余秒数
let lastDisplaySec = 0;   // 上次刷新显示的秒数（用于检测后台/休眠后的大跳变）
let lastTrayText = '';    // 托盘标题去重（250ms tick 下避免重复 setTitle）

const CIRC_ENSO = 2 * Math.PI * 97;   // r=97 禅圆周长（逆时针进度环）

// ── 音频：直接用 HTMLAudioElement，无需管理 AudioContext 状态 ─────────────────
function playSound(filePath, volume = 1.0) {
  try {
    const a = new Audio(filePath);
    a.volume = volume;
    a.play().catch(e => console.warn('播放失败:', filePath, e));
    return a;
  } catch (e) {
    console.warn('音频错误:', e);
    return null;
  }
}

// ── DOM ──────────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const ring          = $('enso-progress');
const timeEl        = $('time-display');
const sessionEl     = $('session-label');
const quoteEl       = $('quote');
const quoteAuthorEl = $('quote-author');
const appEl         = $('app');
const playBtn       = $('btn-play');
const compactBtn    = $('btn-compact');
const pinBtn        = $('btn-pin');
const durInput      = $('dur-input');
const durRow        = $('duration-row');
const settingsPanel = $('settings-panel');
const toastEl       = $('toast');
const saveBtnEl     = $('btn-save-now');
const skipBtn       = $('btn-skip');
const dotsEl        = $('dots');

// Settings
const sFocus    = $('s-focus');
const sShort    = $('s-short');
const sLong     = $('s-long');
const sCountdown = $('s-countdown');
const sCalEn    = $('s-cal-enable');
const sCalName  = $('s-cal-name');
const sSoundEn  = $('s-sound-enable');
const calDot   = $('cal-dot');
const calText  = $('cal-status-text');

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (s) =>
  `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;

// 支持小时显示（正计时 / 长倒计时超过 1 小时）
const fmtT = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
    : `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
};

let quoteTransitionTimer = null;
function showQuote() {
  if (!dailyQuote) return;
  quoteEl.classList.remove('visible');
  clearTimeout(quoteTransitionTimer);
  quoteTransitionTimer = setTimeout(() => {
    quoteEl.textContent = dailyQuote.text;
    quoteAuthorEl.textContent = dailyQuote.author;
    quoteEl.classList.add('visible');
    quoteTransitionTimer = null;
    sendFsState();
  }, 380);
}

function modeDuration(m) {
  return {
    focus:     cfg.focusMins,
    short:     cfg.shortMins,
    long:      cfg.longMins,
    countdown: cfg.countdownMins,
  }[m] * 60;
}

// ── Toast ────────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = '') {
  toastEl.textContent = msg;
  toastEl.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3400);
}

// ── Save-mid-session button visibility ───────────────────────────────────────
function updateSaveBtn() {
  const show = !running && sessionStart !== null &&
    (mode === 'stopwatch' ? elapsed > 0 : remaining < totalSecs);
  saveBtnEl.style.display = show ? 'flex' : 'none';
}

// ── Display ──────────────────────────────────────────────────────────────────
function updateRing() {
  let ratio;   // 环上应显示的弧长比例（0=空，1=满）
  if (mode === 'stopwatch') {
    ratio = (elapsed % 3600) / 3600;      // 正计时：每 60 分钟从空到满走一圈
  } else {
    ratio = remaining / totalSecs;        // 倒计时：满圈开始，随时间逆时针减少至空
  }
  ring.style.strokeDashoffset = CIRC_ENSO * (1 - ratio);
}

function updateDots() {
  const n = completedSessions % 4;
  for (let i = 0; i < 4; i++) {
    const d = $('d' + i);
    d.className = 'dot';
    if      (i < n)  d.classList.add('done');
    else if (i === n) d.classList.add('current');
  }
}

function updateDisplay() {
  timeEl.textContent = fmtT(mode === 'stopwatch' ? elapsed : remaining);
  updateRing();
  const labels = {
    focus:     (n) => `第 ${n} 轮`,
    short:     ()  => '小憩中',
    long:      ()  => '深度休息',
    stopwatch: ()  => '正计时',
    countdown: ()  => '自由倒计时',
  };
  sessionEl.textContent = labels[mode](session);
  updateDots();
  sendFsState();
}

// ── 向全屏沉浸窗口广播当前显示状态（主窗口不计时也持续发送）──
function sendFsState() {
  const api = window.electronAPI;
  if (!api || !api.sendFsState) return;
  const sec = mode === 'stopwatch' ? elapsed : remaining;
  let ratio = mode === 'stopwatch'
    ? (elapsed % 3600) / 3600
    : (totalSecs ? remaining / totalSecs : 1);
  ratio = Math.max(0, Math.min(1, ratio));
  const modeLabel = {
    focus:     () => `第 ${session} 轮`,
    short:     () => '小憩中',
    long:      () => '深度休息',
    stopwatch: () => '正计时',
    countdown: () => '自由倒计时',
  }[mode]();
  api.sendFsState({
    timeText: fmtT(sec),
    running,
    mode,
    modeLabel,
    task: $('task-input').value.trim() || '专注工作',
    ratio,
    dark: appEl.classList.contains('dark'),
    quoteText: dailyQuote ? dailyQuote.text : '',
    quoteAuthor: dailyQuote ? dailyQuote.author : '',
  });
}

// ── 每日一句：小窗口与全屏共用同一份文本、来源和缓存 ──
const DAILY_QUOTE_REFRESH_MS = 15 * 60 * 1000;
let dailyQuote = fallbackQuote();
let dailyQuoteLoading = false;
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function fallbackQuote() {
  const pool = FOCUS_QUOTES.concat(REST_QUOTES);
  return {
    date: todayKey(),
    text: pool[Math.floor(Math.random() * pool.length)],
    author: '— 圣严法师 · 108自在语',
  };
}
function formatHitokotoAuthor(d) {
  const who = (d.from_who || '').trim();
  const from = (d.from || '').trim();
  const line = [who, from].filter(Boolean).join(' · ');
  return line ? '— ' + line : '— 一言';
}
function renderDailyQuote(animate = false) {
  if (!dailyQuote) return;
  clearTimeout(quoteTransitionTimer);
  const apply = () => {
    quoteEl.textContent = dailyQuote.text;
    quoteAuthorEl.textContent = dailyQuote.author;
    quoteEl.classList.add('visible');
    quoteTransitionTimer = null;
    sendFsState();
  };
  if (animate) {
    quoteEl.classList.remove('visible');
    quoteTransitionTimer = setTimeout(apply, 380);
  } else {
    apply();
  }
}
async function loadDailyQuote({ refresh = false } = {}) {
  if (dailyQuoteLoading) return;

  // 启动时优先还原当天缓存；定时轮换时则绕过缓存，获取新的一言。
  if (!refresh) {
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem('chan-daily-quote') || 'null'); } catch (e) {}
    if (cached && cached.date === todayKey() && cached.text) {
      dailyQuote = {
        date: cached.date,
        text: String(cached.text).trim(),
        author: String(cached.author || '— 一言'),
      };
      renderDailyQuote(false);
      return;
    }
  }

  // 保留当前内容；初次请求前先展示本地备用句，避免出现空白。
  renderDailyQuote(false);
  dailyQuoteLoading = true;
  try {
    const data = await window.electronAPI?.fetchHitokoto?.();
    if (data && data.hitokoto) {
      const text = String(data.hitokoto).trim();
      if (text) {
        dailyQuote = {
          date: todayKey(),
          text,
          author: formatHitokotoAuthor(data),
        };
        try { localStorage.setItem('chan-daily-quote', JSON.stringify(dailyQuote)); } catch (e) {}
      }
    }
  } catch (e) {
    // 网络失败时继续保留当前一言；下次 15 分钟轮换时重试。
  } finally {
    dailyQuoteLoading = false;
    renderDailyQuote(false);
  }
}

// ── Play icon ────────────────────────────────────────────────────────────────
function setPlayIcon(playing) {
  playBtn.querySelector('svg').innerHTML = playing
    ? `<g><rect x="5" y="3" width="4.5" height="18" rx="1.2"/><rect x="14.5" y="3" width="4.5" height="18" rx="1.2"/></g>`
    : `<polygon points="6,3 20,12 6,21"/>`;
}

// ── Tray ─────────────────────────────────────────────────────────────────────
function notifyTray() {
  const sec = mode === 'stopwatch' ? elapsed : remaining;
  const text = running ? `run:${sec}` : 'idle';
  if (text === lastTrayText) return;        // 秒数未变则不重复刷新托盘
  lastTrayText = text;
  window.electronAPI?.timerTick({
    remaining: sec,
    running,
  });
}

function setCompactMode(compact) {
  appEl.classList.toggle('compact', compact);
  compactBtn.classList.toggle('active', compact);
  compactBtn.title = compact ? '展开窗口' : '极简模式';
}

// ── 木鱼序列：存储 timeout + Audio，方便暂停时中断 ──────────────────────────────
let _mokugyo = { timers: [], audios: [] };

function stopWoodenFish() {
  _mokugyo.timers.forEach(t => clearTimeout(t));
  _mokugyo.audios.forEach(a => { try { a.pause(); } catch (_) {} });
  _mokugyo.timers = []; _mokugyo.audios = [];
}

function playWoodenFish() {
  if (!cfg.soundEnable) return;
  stopWoodenFish();   // 确保无残留
  [0, 1800, 3600].forEach(delay => {
    const t = setTimeout(() => {
      const a = playSound('./sounds/mokugyo.wav', 0.9);
      if (a) _mokugyo.audios.push(a);
    }, delay);
    _mokugyo.timers.push(t);
  });
}

// ── 暂停短铃：轻敲一声木鱼（音量稍低）──────────────────────────────────────────
function playPauseTone() {
  if (!cfg.soundEnable) return;
  playSound('./sounds/mokugyo.wav', 0.45);
}

// ── 引磬：跳过静音，响 4 秒后用 1 秒淡出，总计 5 秒内结束 ──────────────────────
function playRinBell() {
  if (!cfg.soundEnable) return;
  try {
    const a = new Audio('./sounds/rin.mp3');
    a.volume = 1.0;
    a.currentTime = 2;    // 跳过前 2 秒静音
    a.play().catch(e => console.warn('引磬播放失败:', e));
    setTimeout(() => {
      const fade = setInterval(() => {
        a.volume = Math.max(0, a.volume - 0.05);   // 1 秒内淡出
        if (a.volume <= 0) { clearInterval(fade); a.pause(); }
      }, 50);
    }, 4000);  // 4 秒响铃 + 1 秒淡出 = 共 5 秒
  } catch (e) { console.warn('引磬错误:', e); }
}

// ── 构造日历事件备注：模式 / 轮次 / 时长 / 起止时间 ───────────────────────────
function buildEventDesc(startISO, endISO) {
  const modeName = {
    focus: '专注', short: '小憩', long: '长休',
    stopwatch: '正计时', countdown: '倒计时',
  }[mode] || '专注';
  const s0 = new Date(startISO), s1 = new Date(endISO);
  const sec = Math.max(0, Math.round((s1 - s0) / 1000));
  const h = Math.floor(sec / 3600),
        m = Math.floor((sec % 3600) / 60),
        s = sec % 60;
  let dur = '';
  if (h) dur += `${h}小时`;
  if (m) dur += `${m}分钟`;
  if (!h && s) dur += `${s}秒`;
  if (!dur) dur = '0秒';
  const p2 = (n) => String(n).padStart(2, '0');
  const hm = (d) => `${p2(d.getHours())}:${p2(d.getMinutes())}`;
  const hms = (d) => `${hm(d)}:${p2(d.getSeconds())}`;
  const tf = sec < 60 ? hms : hm;   // 不足 1 分钟显示到秒
  const dateStr = `${s0.getFullYear()}-${p2(s0.getMonth() + 1)}-${p2(s0.getDate())} ${tf(s0)}–${tf(s1)}`;
  const roundStr = mode === 'focus' ? `（第 ${session} 轮）` : '';
  return `由 Chan zone 记录 · ${modeName}${roundStr} · 时长 ${dur} · ${dateStr}`;
}

// ── Calendar sync ─────────────────────────────────────────────────────────────
async function syncCalendar(startISO, endISO, task, isManual = false) {
  if (!cfg.calEnable || !window.electronAPI) {
    if (isManual) showToast('请先在设置中开启日历同步', 'red');
    return;
  }
  const title = mode === 'focus'     ? `专注：${task}`
              : mode === 'countdown' ? `倒计时：${task}`
              : mode === 'stopwatch' ? `正计时：${task}`
              : '休息';
  const desc = buildEventDesc(startISO, endISO);
  showToast('正在记录到日历…');
  const r = await window.electronAPI.addToCalendar({
    title, startISO, endISO, calName: cfg.calName, desc,
  });
  if (r.ok) {
    showToast(r.mode === 'silent' ? '已记录到日历' : '请在弹窗中点击「加入」确认', 'green');
  } else {
    showToast(r.error ? `日历写入失败：${r.error.slice(0, 24)}` : '日历写入失败，请检查权限', 'red');
  }
}

// ── Tick ─────────────────────────────────────────────────────────────────────
function tick() {
  // 以墙上时间戳重算，setInterval 只负责刷新节奏，不参与累计
  const seg = Math.max(0, Math.floor((Date.now() - segStartTs) / 1000));
  let displaySec;
  if (mode === 'stopwatch') {
    elapsed = frozenElapsed + seg;
    displaySec = elapsed;
  } else {
    remaining = Math.max(0, segRemaining - seg);
    displaySec = remaining;
  }

  // 后台节流/系统休眠恢复后会一次跳过多秒：临时关闭进度环过渡，避免快转追赶
  if (Math.abs(displaySec - lastDisplaySec) > 2) {
    ring.style.transition = 'none';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      ring.style.transition = '';
    }));
  }
  lastDisplaySec = displaySec;

  updateDisplay();
  notifyTray();

  if (mode !== 'stopwatch' && remaining <= 0) {
    clearInterval(timerId); timerId = null;
    running = false;
    segStartTs = 0;
    appEl.classList.remove('running');
    setPlayIcon(false);
    updateSaveBtn();
    playRinBell();
    notifyEnd();
    finishTimer();
  }
}

// ── 计时结束系统通知文案 ──────────────────────────────────────────────────────
function notifyEnd() {
  const msgs = {
    focus:     { title: '专注完成', body: '休息一下吧' },
    short:     { title: '小憩结束', body: '开始下一轮专注吧' },
    long:      { title: '长休结束', body: '开始专注吧' },
    countdown: { title: '倒计时结束', body: '' },
  };
  const m = msgs[mode];
  if (m) window.electronAPI?.notifyEnd?.(m);
}

async function finishTimer() {
  // 自然结束：先同步日历，再决定轮换或停留
  if (sessionStart) {
    await syncCalendar(
      sessionStart.toISOString(), new Date().toISOString(),
      ($('task-input').value.trim() || '专注工作'),
    );
    sessionStart = null;
  }
  if (mode === 'countdown') {
    // 自由倒计时：结束不轮换，停留在 00:00，播放 / 重置可重新开始
    showToast('倒计时结束');
    updateSaveBtn();
    notifyTray();
    return;
  }
  onComplete();
}

function onComplete() {
  if (mode === 'focus') {
    completedSessions++;
    if (completedSessions % 4 === 0) {
      session = 1;           // reset counter for next cycle
      setMode('long');
    } else {
      session++;
      setMode('short');
    }
  } else if (mode === 'short' || mode === 'long') {
    setMode('focus');
  }
}

// ── Mode ─────────────────────────────────────────────────────────────────────
function setMode(m) {
  mode = m;
  document.querySelectorAll('.mode-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.mode === m)
  );
  clearInterval(timerId); timerId = null;
  running = false; sessionStart = null;
  elapsed = 0;
  segStartTs = 0; frozenElapsed = 0; lastTrayText = '';
  appEl.classList.remove('running');
  setPlayIcon(false);

  const showDur = (m === 'focus' || m === 'countdown');
  durRow.style.opacity       = m === 'stopwatch' ? '0'    : (showDur ? '1' : '0.28');
  durRow.style.pointerEvents = showDur ? 'auto' : 'none';

  skipBtn.style.display = m === 'stopwatch' ? 'none' : '';
  dotsEl.style.display  = m === 'stopwatch' ? 'none' : '';

  if (m === 'stopwatch') {
    totalSecs = 3600;            // 进度环周期基准：每小时走满一圈
    remaining = 0;
  } else {
    totalSecs = remaining = modeDuration(m);
    if (m === 'focus')     durInput.value = cfg.focusMins;
    if (m === 'countdown') durInput.value = cfg.countdownMins;
  }

  updateDisplay();
  updateSaveBtn();
  showQuote();
  notifyTray();
}

// ── Play / Pause ─────────────────────────────────────────────────────────────
function togglePlay() {
  running = !running;
  if (running) {
    if (mode !== 'stopwatch' && remaining <= 0) {
      // 结束（00:00）状态再次播放：从设定时长重新开始
      totalSecs = remaining = modeDuration(mode);
      if (mode === 'focus')     durInput.value = cfg.focusMins;
      if (mode === 'countdown') durInput.value = cfg.countdownMins;
    }
    if (!sessionStart) sessionStart = new Date();
    // 时间戳基准：本段从当前显示值开始
    segStartTs = Date.now();
    segRemaining = remaining;
    lastDisplaySec = mode === 'stopwatch' ? elapsed : remaining;
    appEl.classList.add('running');
    setPlayIcon(true);
    playWoodenFish();                      // 开始三声木鱼
    timerId = setInterval(tick, 250);      // 250ms 刷新，归零时刻更及时
  } else {
    // 暂停：按时间戳立即结算本段，冻结显示值
    if (segStartTs) {
      const seg = Math.max(0, Math.floor((Date.now() - segStartTs) / 1000));
      if (mode === 'stopwatch') elapsed = frozenElapsed + seg;
      else remaining = Math.max(0, segRemaining - seg);
    }
    if (mode === 'stopwatch') frozenElapsed = elapsed;
    segStartTs = 0;
    appEl.classList.remove('running');
    setPlayIcon(false);
    clearInterval(timerId); timerId = null;
    stopWoodenFish();   // 取消未播的木鱼 + 停止正在响的
    playPauseTone();    // 暂停轻鸣
    updateDisplay();
  }
  updateSaveBtn();
  notifyTray();
}

// ── Reset ─────────────────────────────────────────────────────────────────────
function resetTimer() {
  clearInterval(timerId); timerId = null;
  running = false; sessionStart = null;
  elapsed = 0;
  segStartTs = 0; frozenElapsed = 0; lastTrayText = '';
  appEl.classList.remove('running');
  setPlayIcon(false);
  if (mode === 'stopwatch') {
    totalSecs = 3600;
    remaining = 0;
  } else {
    totalSecs = remaining = modeDuration(mode);
    if (mode === 'focus')     durInput.value = cfg.focusMins;
    if (mode === 'countdown') durInput.value = cfg.countdownMins;
  }
  updateDisplay();
  updateSaveBtn();
  notifyTray();
}

// ── Skip ─────────────────────────────────────────────────────────────────────
function skipNext() {
  clearInterval(timerId); timerId = null;
  running = false; sessionStart = null;
  segStartTs = 0; frozenElapsed = 0; lastTrayText = '';
  appEl.classList.remove('running');
  setPlayIcon(false);
  updateSaveBtn();
  finishTimer();
}

// ── Settings ──────────────────────────────────────────────────────────────────
function openSettings() {
  sFocus.value    = cfg.focusMins;
  sShort.value    = cfg.shortMins;
  sLong.value     = cfg.longMins;
  sCountdown.value = cfg.countdownMins;
  sCalEn.value    = cfg.calEnable  ? '1' : '0';
  sCalName.value  = cfg.calName;
  sSoundEn.value  = cfg.soundEnable ? '1' : '0';
  settingsPanel.classList.add('open');
  $('btn-settings').classList.add('active');
}

function closeSettings() {
  const parse = (el, fb) => Math.max(1, parseInt(el.value, 10) || fb);
  cfg.focusMins = parse(sFocus, 25);
  cfg.shortMins = parse(sShort, 5);
  cfg.longMins  = parse(sLong,  15);
  cfg.countdownMins = parse(sCountdown, 10);
  cfg.calEnable   = sCalEn.value === '1';
  cfg.calName     = sCalName.value.trim() || '日历';
  cfg.soundEnable = sSoundEn.value === '1';
  if (!running && mode !== 'stopwatch') {
    totalSecs = remaining = modeDuration(mode);
    if (mode === 'focus')     durInput.value = cfg.focusMins;
    if (mode === 'countdown') durInput.value = cfg.countdownMins;
    updateDisplay();
  }
  settingsPanel.classList.remove('open');
  $('btn-settings').classList.remove('active');
}

// ── Test calendar ─────────────────────────────────────────────────────────────
async function testCalendar() {
  if (!window.electronAPI) {
    calDot.className = 'cal-indicator err';
    calText.textContent = '仅桌面端可用'; return;
  }
  calDot.className = 'cal-indicator';
  calText.textContent = '正在连接…';
  const now = new Date(), end = new Date(now.getTime() + 60000);
  const r = await window.electronAPI.addToCalendar({
    title: '云水番茄钟 · 连接测试',
    startISO: now.toISOString(), endISO: end.toISOString(),
    calName: sCalName.value.trim() || '日历',
  });
  calDot.className = 'cal-indicator ' + (r.ok ? 'ok' : 'err');
  calText.textContent = r.ok
    ? '连接成功，测试事件已写入'
    : (r.error?.replace(/\s+/g, ' ').slice(0, 56) || '连接失败，请检查日历权限');
}

// ── Bindings ──────────────────────────────────────────────────────────────────
playBtn.addEventListener('click',                  togglePlay);
$('btn-reset').addEventListener('click',           resetTimer);
$('btn-skip').addEventListener('click',            skipNext);
$('btn-settings').addEventListener('click',        openSettings);
$('btn-settings-close').addEventListener('click',  closeSettings);
$('btn-test-cal').addEventListener('click',        testCalendar);
$('btn-compact').addEventListener('click',         () => window.electronAPI?.toggleCompact());
$('btn-close').addEventListener('click', () => window.electronAPI?.closeWindow());
$('btn-min').addEventListener('click',   () => window.electronAPI?.minimizeWindow());
window.electronAPI?.onCompactChanged?.(setCompactMode);

// ── 钉在最上层 ────────────────────────────────────────────────────────────────
function setPinState(pinned) {
  pinBtn.classList.toggle('active', pinned);
  pinBtn.title = pinned ? '取消钉在最上层' : '钉在最上层';
}
pinBtn.addEventListener('click', () => window.electronAPI?.togglePin());
window.electronAPI?.onPinChanged?.(setPinState);
setPinState(true);   // 初始置顶开启

// ── 黑夜模式（黑 · 白 · 橙）──────────────────────────────────────────────────
const themeBtn  = $('btn-theme');
const MOON_SVG  = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
const SUN_SVG   = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>';
function setTheme(dark) {
  appEl.classList.toggle('dark', dark);
  themeBtn.classList.toggle('active', dark);
  themeBtn.title = dark ? '白昼模式' : '黑夜模式';
  themeBtn.innerHTML = dark ? SUN_SVG : MOON_SVG;
  try { localStorage.setItem('chan-theme', dark ? 'dark' : 'light'); } catch (e) {}
  window.electronAPI?.setTheme?.(dark);
  sendFsState();
}
themeBtn.addEventListener('click', () => setTheme(!appEl.classList.contains('dark')));
let savedTheme = 'light';
try { savedTheme = localStorage.getItem('chan-theme') || 'light'; } catch (e) {}
setTheme(savedTheme === 'dark');

// 全屏沉浸时钟：打开前先同步一次状态
$('btn-fullscreen').addEventListener('click', () => {
  sendFsState();
  window.electronAPI?.openFullscreen(appEl.classList.contains('dark'));
});

// 全屏打开期间：主窗口持续推送状态（空闲也推，保证每日一句/主题/任务实时同步）
let fsTimer = null;
window.electronAPI?.onFsOpened?.(() => {
  sendFsState();
  if (fsTimer) clearInterval(fsTimer);
  fsTimer = setInterval(sendFsState, 250);
});
window.electronAPI?.onFsClosed?.(() => {
  if (fsTimer) { clearInterval(fsTimer); fsTimer = null; }
});

// 启动时还原/预取每日一句；之后每 15 分钟自动获取并同步到全屏。
loadDailyQuote();
setInterval(() => {
  loadDailyQuote({ refresh: true });
}, DAILY_QUOTE_REFRESH_MS);

document.querySelectorAll('.mode-btn').forEach(b =>
  b.addEventListener('click', () => { if (!running) setMode(b.dataset.mode); })
);

durInput.addEventListener('change', () => {
  if (mode === 'countdown') {
    cfg.countdownMins = Math.max(1, parseInt(durInput.value, 10) || 10);
  } else {
    cfg.focusMins = Math.max(1, parseInt(durInput.value, 10) || 25);
  }
  if (!running) resetTimer();
});

// Manual save button
saveBtnEl.addEventListener('click', async () => {
  if (!sessionStart) return;
  const end = new Date();
  const task = $('task-input').value.trim() || '专注工作';
  await syncCalendar(sessionStart.toISOString(), end.toISOString(), task, true);
  sessionStart = null;
  updateSaveBtn();
});

// ── 公考模板快捷短语：一键填入任务输入框 ─────────────────────────────────────
$('task-chips').addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (!btn || !btn.dataset.full) return;
  const input = $('task-input');
  input.value = btn.dataset.full;
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
});

// ── 音效测试按钮 ───────────────────────────────────────────────────────────────
$('btn-test-mokugyo').addEventListener('click', () => {
  playSound('./sounds/mokugyo.wav', 0.9);
});
$('btn-test-rin').addEventListener('click', () => {
  playRinBell();   // 直接复用 playRinBell，保持一致
});

// ── Boot ──────────────────────────────────────────────────────────────────────
setMode('focus');
