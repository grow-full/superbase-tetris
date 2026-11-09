/**
 * 배경음과 효과음을 Web Audio API로 직접 합성한다 (외부 음원 파일 없음, 저작권 문제 없음).
 * 브라우저 자동재생 정책 때문에 사용자의 첫 클릭/키 입력에서 init()을 호출해야 한다.
 */

const STORAGE_KEY = 'stackfall.audio';
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

// 8마디 진행: Am – F – C – G 를 두 번. 각 마디는 16분음표 16칸.
const CHORDS = [
  [57, 60, 64], // Am
  [57, 60, 65], // F
  [55, 60, 64], // C
  [55, 59, 62], // G
];
const BASS = [45, 41, 48, 43];
const _ = null;
const LEAD_A = [
  [76, _, _, 72, _, 74, _, 76, _, _, 81, _, 79, _, 76, _],
  [77, _, _, 76, _, 72, _, 69, _, _, 72, _, 74, _, _, _],
  [72, _, _, 76, _, 79, _, 84, _, _, 83, _, 79, _, 76, _],
  [74, _, _, 71, _, 74, _, 79, _, _, 77, _, 76, _, 74, _],
];
const LEAD_B = [
  [69, _, 72, _, 76, _, _, _, 74, _, 72, _, 74, _, 76, _],
  [77, _, _, _, 76, _, 74, _, 72, _, _, _, 69, _, _, _],
  [67, _, 72, _, 76, _, _, _, 79, _, 77, _, 76, _, 72, _],
  [71, _, _, _, 74, _, 76, _, 79, _, _, _, _, _, _, _],
];
const ARP_ORDER = [0, 1, 2, 1];
const LOOP_STEPS = 16 * 8;

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (s && typeof s === 'object') {
      return {
        bgm: clamp01(s.bgm ?? 0.5),
        sfx: clamp01(s.sfx ?? 0.7),
        muted: Boolean(s.muted),
      };
    }
  } catch {
    /* 저장된 값이 없거나 깨진 경우 기본값 */
  }
  return { bgm: 0.5, sfx: 0.7, muted: false };
}

function clamp01(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), 1) : 0;
}

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.settings = loadSettings();
    this.bpm = 112;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
    this.listeners = new Set();
  }

  onChange(fn) {
    this.listeners.add(fn);
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    this.bgmGain = ctx.createGain();
    this.sfxGain = ctx.createGain();
    this.bgmGain.connect(this.master);
    this.sfxGain.connect(this.master);

    const len = ctx.sampleRate;
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.applySettings();
  }

  // ---------- 설정 ----------
  applySettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      /* 저장소 사용 불가 시 무시 */
    }
    if (this.ctx) {
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(this.settings.muted ? 0 : 1, t, 0.02);
      this.bgmGain.gain.setTargetAtTime(this.settings.bgm * 0.45, t, 0.02);
      this.sfxGain.gain.setTargetAtTime(this.settings.sfx, t, 0.02);
    }
    for (const fn of this.listeners) fn(this.settings);
  }

  setBgmVolume(v) {
    this.settings.bgm = clamp01(v);
    this.applySettings();
  }

  setSfxVolume(v) {
    this.settings.sfx = clamp01(v);
    this.applySettings();
  }

  setMuted(muted) {
    this.settings.muted = muted;
    this.applySettings();
  }

  toggleMute() {
    this.setMuted(!this.settings.muted);
  }

  // ---------- 배경음 ----------
  startBgm() {
    if (!this.ctx) return;
    this.step = 0;
    this.resumeBgm();
  }

  resumeBgm() {
    if (!this.ctx || this.timer) return;
    this.nextTime = this.ctx.currentTime + 0.06;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  pauseBgm() {
    clearInterval(this.timer);
    this.timer = null;
  }

  stopBgm() {
    this.pauseBgm();
    this.step = 0;
  }

  setLevel(level) {
    this.bpm = Math.min(112 + (level - 1) * 4, 160);
  }

  schedule() {
    const stepDur = 60 / this.bpm / 4;
    // 탭이 백그라운드였다가 돌아온 경우 밀린 음을 한꺼번에 재생하지 않도록 건너뛴다
    if (this.nextTime < this.ctx.currentTime - 0.2) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % LOOP_STEPS;
    }
  }

  playStep(step, t, d) {
    const bar = Math.floor(step / 16) % 4;
    const half = Math.floor(step / 64); // 0: 앞 4마디, 1: 뒤 4마디
    const s = step % 16;
    const out = this.bgmGain;

    if (s % 2 === 0) {
      const octave = s % 4 === 0 ? 0 : 12;
      this.tone({ freq: midi(BASS[bar] + octave), type: 'triangle', t, dur: d * 1.8, vol: 0.5, out });
    }

    const chord = CHORDS[bar];
    const arpNote = chord[ARP_ORDER[s % 4]] + (s >= 8 ? 12 : 0);
    this.tone({ freq: midi(arpNote), type: 'sine', t, dur: d * 0.9, vol: 0.16, out });

    const lead = (half === 0 ? LEAD_A : LEAD_B)[bar][s];
    if (lead) this.tone({ freq: midi(lead), type: 'square', t, dur: d * 1.7, vol: 0.09, out, attack: 0.01 });

    if (s % 4 === 0) this.kick(t, out);
    if (s === 4 || s === 12) this.noise({ t, dur: 0.09, vol: 0.18, out, filter: 'bandpass', freq: 1800 });
    if (s % 2 === 1) this.noise({ t, dur: 0.03, vol: 0.06, out, filter: 'highpass', freq: 7000 });
  }

  // ---------- 합성 도구 ----------
  tone({ freq, freqEnd, type = 'sine', t, dur, vol, out, attack = 0.005 }) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise({ t, dur, vol, out, filter = 'lowpass', freq = 1000 }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  kick(t, out) {
    this.tone({ freq: 140, freqEnd: 45, type: 'sine', t, dur: 0.16, vol: 0.55, out, attack: 0.002 });
  }

  arpeggio(notes, { type = 'triangle', gap = 0.05, dur = 0.12, vol = 0.22 } = {}) {
    const t = this.ctx.currentTime;
    notes.forEach((n, i) => this.tone({ freq: midi(n), type, t: t + i * gap, dur, vol, out: this.sfxGain }));
  }

  // ---------- 효과음 ----------
  sfx(name, data = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.sfxGain;
    switch (name) {
      case 'move':
        this.tone({ freq: 520, type: 'square', t, dur: 0.03, vol: 0.06, out });
        break;
      case 'rotate':
        this.tone({ freq: 620, freqEnd: 900, type: 'triangle', t, dur: 0.06, vol: 0.14, out });
        break;
      case 'hold':
        this.tone({ freq: 440, freqEnd: 680, type: 'sine', t, dur: 0.1, vol: 0.18, out });
        break;
      case 'lock':
        this.tone({ freq: 200, freqEnd: 110, type: 'sine', t, dur: 0.07, vol: 0.22, out });
        this.noise({ t, dur: 0.03, vol: 0.08, out, filter: 'lowpass', freq: 1500 });
        break;
      case 'hardDrop':
        this.tone({ freq: 180, freqEnd: 40, type: 'sine', t, dur: 0.18, vol: 0.45, out, attack: 0.002 });
        this.noise({ t, dur: 0.1, vol: 0.22, out, filter: 'lowpass', freq: 900 });
        break;
      case 'clear': {
        const count = data.count ?? 1;
        if (count >= 4) {
          this.arpeggio([72, 76, 79, 84, 88, 91], { type: 'square', gap: 0.045, dur: 0.18, vol: 0.14 });
          this.noise({ t: t + 0.2, dur: 0.35, vol: 0.12, out, filter: 'highpass', freq: 5000 });
        } else {
          const notes = [[72, 79], [72, 76, 79], [72, 76, 79, 84]][count - 1];
          this.arpeggio(notes, { type: 'triangle', gap: 0.05, dur: 0.14, vol: 0.24 });
        }
        break;
      }
      case 'levelUp':
        this.arpeggio([67, 71, 74, 79, 83], { type: 'sine', gap: 0.07, dur: 0.2, vol: 0.22 });
        break;
      case 'pause':
        this.tone({ freq: 880, type: 'sine', t, dur: 0.08, vol: 0.12, out });
        break;
      case 'gameOver':
        this.tone({ freq: 440, freqEnd: 90, type: 'sawtooth', t, dur: 1.0, vol: 0.12, out, attack: 0.02 });
        [64, 60, 57, 52].forEach((n, i) =>
          this.tone({ freq: midi(n), type: 'triangle', t: t + i * 0.18, dur: 0.3, vol: 0.22, out }),
        );
        break;
      case 'click':
        this.tone({ freq: 700, type: 'sine', t, dur: 0.04, vol: 0.08, out });
        break;
    }
  }
}
