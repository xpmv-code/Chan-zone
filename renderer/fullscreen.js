const $ = (id) => document.getElementById(id);

const R = 250;
const CIRC = 2 * Math.PI * R;   // ≈ 1570.80
const progress = $('fs-progress');
progress.setAttribute('stroke-dasharray', CIRC.toFixed(2));

const timeEl = $('fs-time');
const clockEl = $('flip-clock');
const labelEl = $('fs-label');
const centerEl = $('fs-center');
let lastModeLabel = '';

// ── 主窗口计时状态渲染 ──
function render(d) {
  if (!d) return;
  timeEl.textContent = d.timeText;
  lastModeLabel = d.modeLabel || '';
  if (!showClock) labelEl.textContent = lastModeLabel;
  $('fs-task').textContent = d.task || '专注工作';
  $('fs-quote-text').textContent = d.quoteText || '';
  $('fs-quote-author').textContent = d.quoteAuthor || '';
  document.body.classList.toggle('dark', !!d.dark);
  document.body.classList.toggle('light', !d.dark);
  document.body.classList.toggle('running', !!d.running);
  const ratio = Math.max(0, Math.min(1, d.ratio == null ? 1 : d.ratio));
  progress.style.strokeDashoffset = (CIRC * (1 - ratio)).toFixed(2);
}

if (window.electronAPI && window.electronAPI.onFsTick) {
  window.electronAPI.onFsTick(render);
}

// ── 翻页时钟（split-flap）构建 ──
function makeFlip() {
  const f = document.createElement('div');
  f.className = 'flip';
  f.dataset.value = '0';
  f.innerHTML =
    '<span class="c top"><span class="n">0</span></span>' +
    '<span class="c bottom"><span class="n">0</span></span>' +
    '<span class="c flip-top"><span class="n">0</span></span>' +
    '<span class="c flip-bottom"><span class="n">0</span></span>';
  return f;
}

const digits = [];
['h', 'm', 's'].forEach((_, ui) => {
  const unit = document.createElement('div');
  unit.className = 'flip-unit';
  for (let i = 0; i < 2; i++) {
    const f = makeFlip();
    unit.appendChild(f);
    digits.push(f);
  }
  clockEl.appendChild(unit);
  if (ui < 2) {
    const colon = document.createElement('span');
    colon.className = 'flip-colon';
    colon.textContent = ':';
    clockEl.appendChild(colon);
  }
});

function setDigit(flip, ch, animate = true) {
  const top = flip.querySelector('.top .n');
  const bottom = flip.querySelector('.bottom .n');
  const flipTop = flip.querySelector('.flip-top .n');
  const flipBottom = flip.querySelector('.flip-bottom .n');
  const old = flip.dataset.value ?? top.textContent ?? '0';

  // 以目标值为准，并取消上一次清理任务，避免慢帧时旧回调覆盖新数字。
  if (flip._flipTimeout) {
    clearTimeout(flip._flipTimeout);
    flip._flipTimeout = null;
  }
  if (old === ch && !flip.classList.contains('play')) return;

  flip.dataset.value = ch;
  if (!animate || old === ch) {
    flip.classList.remove('play');
    top.textContent = ch;
    bottom.textContent = ch;
    flipTop.textContent = ch;
    flipBottom.textContent = ch;
    return;
  }

  // 上半静态层先切到新值；翻页层保留旧值，底部翻页层准备显示新值。
  flipTop.textContent = old;
  flipBottom.textContent = ch;
  top.textContent = ch;
  flip.classList.remove('play');
  void flip.offsetWidth; // 重置动画后再触发，确保连续翻页可以重新开始
  flip.classList.add('play');

  const finish = () => {
    if (flip.dataset.value !== ch) return;
    bottom.textContent = ch;
    flipTop.textContent = ch;
    flipBottom.textContent = ch;
    flip.classList.remove('play');
    flip._flipTimeout = null;
  };
  // CSS 两段动画总时长为 640ms；稍留余量后复位静态层。
  flip._flipTimeout = setTimeout(finish, 680);
}

const pad2 = (n) => String(n).padStart(2, '0');
let clockInitialized = false;
function renderClock() {
  const now = new Date();
  const str = pad2(now.getHours()) + pad2(now.getMinutes()) + pad2(now.getSeconds());
  for (let i = 0; i < 6; i++) setDigit(digits[i], str[i], clockInitialized);
  clockInitialized = true;
}

let clockTimer = null, clockStartTimer = null;
function startClock() {
  renderClock();
  if (clockTimer !== null || clockStartTimer !== null) return;
  const delay = 1000 - (Date.now() % 1000);   // 对齐整秒，保证精确到秒
  clockStartTimer = setTimeout(() => {
    renderClock();
    clockStartTimer = null;
    clockTimer = setInterval(renderClock, 1000);
  }, delay);
}
function stopClock() {
  if (clockTimer !== null) { clearInterval(clockTimer); clockTimer = null; }
  if (clockStartTimer !== null) { clearTimeout(clockStartTimer); clockStartTimer = null; }
}

// ── 中央数字：点击切换「计时 / 当前时间」──
let showClock = false;
function toggleView() {
  showClock = !showClock;
  document.body.classList.toggle('clock-mode', showClock);
  if (showClock) {
    timeEl.hidden = true;
    clockEl.hidden = false;
    labelEl.textContent = '当前时间';
    startClock();
  } else {
    timeEl.hidden = false;
    clockEl.hidden = true;
    labelEl.textContent = lastModeLabel;
    stopClock();
  }
  showHint();
}
centerEl.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleView();
});

// ── 退出：点击空白或按 ESC ──
function exitFullscreen() {
  window.electronAPI?.closeFullscreen?.();
}
document.addEventListener('click', exitFullscreen);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') exitFullscreen();
});

// ── 提示与光标：静止 2.5s 后淡出 ──
const hint = $('fs-hint');
let hideTimer = null;
function showHint() {
  hint.classList.remove('hide');
  document.body.style.cursor = 'default';
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    hint.classList.add('hide');
    document.body.style.cursor = 'none';
  }, 2500);
}
document.addEventListener('mousemove', showHint);
showHint();
