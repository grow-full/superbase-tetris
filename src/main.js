import { Game } from './game/game.js';
import { Renderer } from './render/renderer.js';
import { KeyboardInput } from './input/keyboard.js';
import { AudioManager } from './audio/audio.js';
import {
  isOnlineEnabled,
  submitScore,
  fetchLeaderboard,
  fetchRank,
  submitFeedback,
} from './api/supabase.js';
import { validateNickname, validateFeedback } from './ui/validation.js';

const $ = (sel) => document.querySelector(sel);
const BEST_KEY = 'stackfall.best';
const NICK_KEY = 'stackfall.nickname';
const FEEDBACK_COOLDOWN_KEY = 'stackfall.feedbackAt';
const FEEDBACK_COOLDOWN_MS = 30_000;

const storage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* 저장소 사용 불가 */
    }
  },
};

const formatTime = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const formatNum = (n) => n.toLocaleString('ko-KR');

// ---------- 상태 ----------
const game = new Game();
const audio = new AudioManager();
const renderer = new Renderer({
  board: $('#board-canvas'),
  hold: $('#hold-canvas'),
  next: [...document.querySelectorAll('.next-canvas')],
});

let best = Number(storage.get(BEST_KEY)) || 0;
let lastResult = null;
let scoreSaved = false;

const screens = { menu: $('#screen-menu'), game: $('#screen-game') };
let currentScreen = 'menu';

function showScreen(name) {
  currentScreen = name;
  for (const [key, el] of Object.entries(screens)) el.hidden = key !== name;
}

const anyDialogOpen = () => document.querySelector('dialog[open]') !== null;

function openDialog(dlg) {
  if (!dlg.open) dlg.showModal();
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.hidden = true), 2400);
}

function setMsg(el, text, kind = '') {
  el.textContent = text;
  el.className = `form-msg ${kind}`;
}

// ---------- 게임 흐름 ----------
function startGame() {
  audio.init();
  document.activeElement?.blur();
  for (const d of document.querySelectorAll('dialog[open]')) d.close();
  showScreen('game');
  $('#pause-overlay').hidden = true;
  game.start();
  audio.setLevel(1);
  audio.startBgm();
  updateHud();
}

function setPaused(paused) {
  if (!game.started || game.over) return;
  game.setPaused(paused);
}

function togglePause() {
  setPaused(!game.paused);
}

function quitToMenu() {
  audio.stopBgm();
  game.reset();
  for (const d of document.querySelectorAll('dialog[open]')) d.close();
  $('#pause-overlay').hidden = true;
  $('#menu-best').textContent = formatNum(best);
  showScreen('menu');
}

game.on((type, data) => {
  switch (type) {
    case 'move':
    case 'rotate':
    case 'hold':
    case 'lock':
    case 'hardDrop':
      audio.sfx(type);
      break;
    case 'clear':
      audio.sfx('clear', data);
      break;
    case 'levelUp':
      audio.sfx('levelUp');
      audio.setLevel(data.level);
      toast(`레벨 ${data.level}!`);
      break;
    case 'pause':
      $('#pause-overlay').hidden = !data.paused;
      audio.sfx('pause');
      if (data.paused) {
        audio.pauseBgm();
        $('#btn-resume').focus();
      } else {
        audio.resumeBgm();
        document.activeElement?.blur();
      }
      break;
    case 'gameOver':
      audio.stopBgm();
      audio.sfx('gameOver');
      onGameOver(data);
      break;
  }
});

function onGameOver(result) {
  lastResult = result;
  scoreSaved = false;
  const isNewBest = result.score > best;
  if (isNewBest) {
    best = result.score;
    storage.set(BEST_KEY, String(best));
  }

  $('#go-score').textContent = formatNum(result.score);
  $('#go-level').textContent = result.level;
  $('#go-lines').textContent = result.lines;
  $('#go-time').textContent = formatTime(result.durationSec);
  $('#go-newbest').hidden = !isNewBest || result.score === 0;
  $('#go-board').hidden = true;

  const form = $('#form-score');
  const input = $('#input-nickname');
  input.value = storage.get(NICK_KEY) || '';
  form.hidden = !isOnlineEnabled;
  $('#btn-save-score').disabled = false;
  input.disabled = false;
  setMsg($('#score-msg'), '');

  // 게임 오버 연출을 잠깐 보여준 뒤 결과 창을 띄운다
  setTimeout(() => {
    if (!game.over) return;
    const dlg = $('#dlg-gameover');
    // 하드 드롭(Space)을 연타하던 키 입력이 버튼을 바로 눌러 버리지 않도록 잠깐 잠근다
    const buttons = [...dlg.querySelectorAll('.dialog-actions .btn')];
    buttons.forEach((b) => (b.disabled = true));
    openDialog(dlg);
    if (isOnlineEnabled) input.focus();
    setTimeout(() => {
      buttons.forEach((b) => (b.disabled = false));
      if (!isOnlineEnabled && dlg.open) $('#btn-retry').focus();
    }, 900);
  }, 700);
}

// ---------- 화면 갱신 ----------
let hudCache = {};
function updateHud() {
  const values = {
    score: formatNum(game.score),
    best: formatNum(Math.max(best, game.score)),
    level: String(game.level),
    lines: String(game.lines),
    time: formatTime(game.elapsed),
  };
  for (const [key, value] of Object.entries(values)) {
    if (hudCache[key] !== value) {
      $(`#stat-${key}`).textContent = value;
      hudCache[key] = value;
    }
  }
}

function updateMuteButton() {
  const muted = audio.settings.muted;
  $('#btn-mute').textContent = muted ? '🔇 소리 꺼짐' : '🔊 소리';
  $('#btn-mute').setAttribute('aria-pressed', String(muted));
}

// ---------- 메인 루프 ----------
const input = new KeyboardInput(game, {
  isActive: () => currentScreen === 'game' && !anyDialogOpen() && game.started && !game.over,
  onPause: togglePause,
  onMute: () => audio.toggleMute(),
});

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (currentScreen === 'game') {
    input.update(dt);
    game.update(dt);
    renderer.draw(game);
    updateHud();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 다른 탭으로 가면 자동 일시정지
document.addEventListener('visibilitychange', () => {
  if (document.hidden && currentScreen === 'game') setPaused(true);
});
window.addEventListener('blur', () => {
  if (currentScreen === 'game' && !anyDialogOpen()) setPaused(true);
});

// ---------- 랭킹 ----------
function renderLeaderboard(listEl, rows, highlight) {
  listEl.replaceChildren();
  if (!rows.length) {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.className = 'empty';
    span.textContent = '아직 기록이 없어요. 첫 번째 주인공이 되어 보세요!';
    li.append(span);
    listEl.append(li);
    return;
  }
  rows.forEach((row, i) => {
    const li = document.createElement('li');
    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = String(i + 1);
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = row.nickname; // textContent 사용: 사용자 입력이 HTML로 해석되지 않음
    name.title = `레벨 ${row.level} · ${row.lines}줄`;
    const score = document.createElement('span');
    score.className = 'score';
    score.textContent = formatNum(row.score);
    li.append(rank, name, score);
    if (highlight && i + 1 === highlight.rank && row.nickname === highlight.nickname && row.score === highlight.score) {
      li.classList.add('me');
    }
    listEl.append(li);
  });
}

let rankRequest = 0;
async function loadRankTab(period) {
  const list = $('#rank-list');
  const msg = $('#rank-msg');
  for (const tab of document.querySelectorAll('#dlg-rank .tab')) {
    tab.setAttribute('aria-selected', String(tab.dataset.period === period));
  }
  if (!isOnlineEnabled) {
    list.replaceChildren();
    setMsg(msg, '온라인 기능이 설정되지 않아 랭킹을 볼 수 없습니다.', 'err');
    return;
  }
  const id = ++rankRequest;
  setMsg(msg, '불러오는 중…');
  try {
    const rows = await fetchLeaderboard(period);
    if (id !== rankRequest) return;
    renderLeaderboard(list, rows);
    setMsg(msg, '');
  } catch (err) {
    if (id !== rankRequest) return;
    list.replaceChildren();
    setMsg(msg, `랭킹을 불러오지 못했습니다. ${err.message}`, 'err');
  }
}

function openRanking() {
  openDialog($('#dlg-rank'));
  loadRankTab('all');
}

for (const tab of document.querySelectorAll('#dlg-rank .tab')) {
  tab.addEventListener('click', () => loadRankTab(tab.dataset.period));
}

// ---------- 점수 저장 ----------
$('#form-score').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!lastResult || scoreSaved) return;
  const input = $('#input-nickname');
  const msg = $('#score-msg');
  const error = validateNickname(input.value);
  if (error) {
    setMsg(msg, error, 'err');
    input.focus();
    return;
  }
  const nickname = input.value.trim();
  const btn = $('#btn-save-score');
  btn.disabled = true;
  setMsg(msg, '저장하는 중…');
  try {
    await submitScore({ nickname, ...lastResult });
    scoreSaved = true;
    storage.set(NICK_KEY, nickname);
    input.disabled = true;
    const [rank, rows] = await Promise.all([
      fetchRank(lastResult.score).catch(() => null),
      fetchLeaderboard('all').catch(() => []),
    ]);
    setMsg(msg, rank ? `저장 완료! 전체 ${formatNum(rank)}위입니다.` : '저장 완료!', 'ok');
    renderLeaderboard($('#go-leaderboard'), rows, rank && { rank, nickname, score: lastResult.score });
    $('#go-board').hidden = false;
  } catch (err) {
    btn.disabled = false;
    setMsg(msg, `저장하지 못했습니다. ${err.message} 다시 시도해 주세요.`, 'err');
  }
});

// ---------- 피드백 ----------
function openFeedback() {
  const dlg = $('#dlg-feedback');
  const nick = $('#fb-nickname');
  if (!nick.value) nick.value = storage.get(NICK_KEY) || '';
  setMsg($('#fb-msg'), isOnlineEnabled ? '' : '온라인 기능이 설정되지 않아 피드백을 보낼 수 없습니다.', isOnlineEnabled ? '' : 'err');
  $('#btn-fb-submit').disabled = !isOnlineEnabled;
  openDialog(dlg);
  $('#fb-content').focus();
}

$('#fb-content').addEventListener('input', (e) => {
  $('#fb-count').textContent = [...e.target.value].length;
});

$('#form-feedback').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#fb-msg');
  const form = e.target;
  const nickname = form.nickname.value.trim();
  const content = form.content.value.trim();

  const nickError = validateNickname(nickname, { required: false });
  const contentError = validateFeedback(content);
  if (nickError || contentError) {
    setMsg(msg, nickError || contentError, 'err');
    return;
  }

  const lastAt = Number(storage.get(FEEDBACK_COOLDOWN_KEY)) || 0;
  const wait = FEEDBACK_COOLDOWN_MS - (Date.now() - lastAt);
  if (wait > 0) {
    setMsg(msg, `잠시 후 다시 보내 주세요. (${Math.ceil(wait / 1000)}초)`, 'err');
    return;
  }

  const btn = $('#btn-fb-submit');
  btn.disabled = true;
  setMsg(msg, '보내는 중…');
  try {
    await submitFeedback({
      nickname: nickname || null,
      category: form.category.value,
      rating: Number(form.rating.value),
      content,
    });
    storage.set(FEEDBACK_COOLDOWN_KEY, String(Date.now()));
    form.content.value = '';
    $('#fb-count').textContent = '0';
    setMsg(msg, '소중한 의견 감사합니다! 🙏', 'ok');
  } catch (err) {
    setMsg(msg, `보내지 못했습니다. ${err.message}`, 'err');
  } finally {
    btn.disabled = false;
  }
});

// ---------- 사운드 설정 ----------
function syncSettingsUi(s) {
  $('#vol-bgm').value = Math.round(s.bgm * 100);
  $('#vol-sfx').value = Math.round(s.sfx * 100);
  $('#vol-bgm-val').textContent = `${Math.round(s.bgm * 100)}%`;
  $('#vol-sfx-val').textContent = `${Math.round(s.sfx * 100)}%`;
  $('#chk-mute').checked = s.muted;
  updateMuteButton();
}
audio.onChange(syncSettingsUi);
syncSettingsUi(audio.settings);

$('#vol-bgm').addEventListener('input', (e) => audio.setBgmVolume(e.target.value / 100));
$('#vol-sfx').addEventListener('input', (e) => audio.setSfxVolume(e.target.value / 100));
$('#vol-sfx').addEventListener('change', () => audio.sfx('click'));
$('#chk-mute').addEventListener('change', (e) => audio.setMuted(e.target.checked));

function openSettings() {
  audio.init();
  openDialog($('#dlg-settings'));
}

// ---------- 버튼 연결 ----------
$('#btn-start').addEventListener('click', startGame);
$('#btn-menu-rank').addEventListener('click', openRanking);
$('#btn-menu-feedback').addEventListener('click', openFeedback);
$('#btn-menu-help').addEventListener('click', () => openDialog($('#dlg-help')));
$('#btn-menu-settings').addEventListener('click', openSettings);

$('#btn-pause').addEventListener('click', (e) => {
  e.currentTarget.blur();
  togglePause();
});
$('#btn-mute').addEventListener('click', (e) => {
  e.currentTarget.blur();
  audio.init();
  audio.toggleMute();
});
$('#btn-resume').addEventListener('click', () => setPaused(false));
$('#btn-restart').addEventListener('click', startGame);
$('#btn-pause-settings').addEventListener('click', openSettings);
$('#btn-quit').addEventListener('click', quitToMenu);

$('#btn-retry').addEventListener('click', startGame);
$('#btn-go-feedback').addEventListener('click', openFeedback);
$('#btn-go-menu').addEventListener('click', quitToMenu);

for (const btn of document.querySelectorAll('[data-close]')) {
  btn.addEventListener('click', () => btn.closest('dialog').close());
}

// 결과 창은 Esc로 닫히지 않게 한다 (닫히면 화면이 멈춘 것처럼 보임)
$('#dlg-gameover').addEventListener('cancel', (e) => e.preventDefault());

// 일시정지 중 띄운 설정 창을 닫으면 '계속하기' 버튼에 다시 초점
$('#dlg-settings').addEventListener('close', () => {
  if (game.paused) $('#btn-resume').focus();
});

// ---------- 초기화 ----------
$('#menu-best').textContent = formatNum(best);
$('#offline-notice').hidden = isOnlineEnabled;
showScreen('menu');
