import {
  COLS,
  ROWS,
  HIDDEN_ROWS,
  NEXT_COUNT,
  LOCK_DELAY,
  MAX_LOCK_RESETS,
  CLEAR_DURATION,
  SOFT_DROP_INTERVAL,
  LINE_SCORES,
  SOFT_DROP_POINTS,
  HARD_DROP_POINTS,
  gravityInterval,
  levelForLines,
} from './constants.js';
import { getCells, getKicks, shapeSize } from './pieces.js';
import { createBag } from './bag.js';

/**
 * 게임 규칙만 담당한다 (화면, 소리, 입력과 분리).
 * 이벤트: start, move, rotate, hold, hardDrop, lock, clear, levelUp, pause, gameOver
 */
export class Game {
  constructor({ rng = Math.random } = {}) {
    this.rng = rng;
    this.listeners = new Set();
    this.reset();
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(type, data) {
    for (const fn of this.listeners) fn(type, data);
  }

  reset() {
    this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    this.nextType = createBag(this.rng);
    this.queue = [];
    while (this.queue.length < NEXT_COUNT) this.queue.push(this.nextType());
    this.hold = null;
    this.holdUsed = false;
    this.active = null;
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.elapsed = 0;
    this.started = false;
    this.over = false;
    this.paused = false;
    this.softDropping = false;
    this.clearing = null;
    this.gravityTimer = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.lowestY = 0;
  }

  start() {
    this.reset();
    this.started = true;
    this.emit('start');
    this.spawn(this.takeNext());
  }

  get canAct() {
    return this.started && !this.over && !this.paused && !this.clearing && this.active !== null;
  }

  takeNext() {
    const type = this.queue.shift();
    this.queue.push(this.nextType());
    return type;
  }

  spawn(type) {
    const piece = { type, rot: 0, x: Math.floor((COLS - shapeSize(type)) / 2), y: 0 };
    this.active = piece;
    this.gravityTimer = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.lowestY = piece.y;
    if (this.collides(piece)) {
      this.endGame();
      return false;
    }
    return true;
  }

  collides(piece, dx = 0, dy = 0, rot = piece.rot) {
    for (const [cx, cy] of getCells(piece.type, rot)) {
      const x = piece.x + cx + dx;
      const y = piece.y + cy + dy;
      if (x < 0 || x >= COLS || y >= ROWS) return true;
      if (y >= 0 && this.board[y][x]) return true;
    }
    return false;
  }

  isGrounded() {
    return this.active !== null && this.collides(this.active, 0, 1);
  }

  /** 바닥에 닿은 상태에서 움직이면 고정까지 남은 시간을 다시 채운다 (최대 횟수 제한). */
  afterManipulation() {
    if (this.isGrounded() && this.lockResets < MAX_LOCK_RESETS) {
      this.lockTimer = 0;
      this.lockResets++;
    }
  }

  move(dx) {
    if (!this.canAct || this.collides(this.active, dx, 0)) return false;
    this.active.x += dx;
    this.afterManipulation();
    this.emit('move');
    return true;
  }

  /** dir: 1 = 시계 방향, -1 = 반시계 방향 */
  rotate(dir) {
    if (!this.canAct) return false;
    const p = this.active;
    const to = (p.rot + dir + 4) % 4;
    for (const [kx, ky] of getKicks(p.type, p.rot, to)) {
      if (!this.collides(p, kx, ky, to)) {
        p.x += kx;
        p.y += ky;
        p.rot = to;
        this.afterManipulation();
        this.emit('rotate');
        return true;
      }
    }
    return false;
  }

  stepDown() {
    if (this.collides(this.active, 0, 1)) return false;
    this.active.y++;
    if (this.active.y > this.lowestY) {
      this.lowestY = this.active.y;
      this.lockResets = 0;
    }
    return true;
  }

  hardDrop() {
    if (!this.canAct) return 0;
    let rows = 0;
    while (this.stepDown()) rows++;
    this.score += rows * HARD_DROP_POINTS;
    this.emit('hardDrop', { rows });
    this.lock();
    return rows;
  }

  holdPiece() {
    if (!this.canAct || this.holdUsed) return false;
    const current = this.active.type;
    this.holdUsed = true;
    const swapIn = this.hold;
    this.hold = current;
    this.emit('hold');
    this.spawn(swapIn ?? this.takeNext());
    return true;
  }

  setSoftDrop(on) {
    this.softDropping = on;
  }

  setPaused(paused) {
    if (!this.started || this.over || this.paused === paused) return;
    this.paused = paused;
    this.emit('pause', { paused });
  }

  lock() {
    const p = this.active;
    let allHidden = true;
    for (const [cx, cy] of getCells(p.type, p.rot)) {
      const x = p.x + cx;
      const y = p.y + cy;
      if (y >= 0) this.board[y][x] = p.type;
      if (y >= HIDDEN_ROWS) allHidden = false;
    }
    this.active = null;
    this.emit('lock');

    const full = [];
    for (let y = 0; y < ROWS; y++) {
      if (this.board[y].every(Boolean)) full.push(y);
    }

    if (full.length > 0) {
      this.addLineScore(full.length);
      this.clearing = { rows: full, timer: CLEAR_DURATION };
      this.emit('clear', { count: full.length, rows: full });
      return;
    }
    // 블록이 보이는 영역 밖에서 완전히 고정되면 종료
    if (allHidden) {
      this.endGame();
      return;
    }
    this.spawnNext();
  }

  addLineScore(count) {
    this.score += LINE_SCORES[count] * this.level;
    this.lines += count;
    const newLevel = levelForLines(this.lines);
    if (newLevel > this.level) {
      this.level = newLevel;
      this.emit('levelUp', { level: newLevel });
    }
  }

  finishClear() {
    const rows = new Set(this.clearing.rows);
    const kept = this.board.filter((_, y) => !rows.has(y));
    while (kept.length < ROWS) kept.unshift(Array(COLS).fill(null));
    this.board = kept;
    this.clearing = null;
    this.spawnNext();
  }

  spawnNext() {
    this.holdUsed = false;
    this.spawn(this.takeNext());
  }

  endGame() {
    if (this.over) return;
    this.over = true;
    this.softDropping = false;
    this.emit('gameOver', this.summary());
  }

  summary() {
    return {
      score: this.score,
      level: this.level,
      lines: this.lines,
      durationSec: Math.round(this.elapsed),
    };
  }

  update(dt) {
    if (!this.started || this.over || this.paused) return;
    this.elapsed += dt;

    if (this.clearing) {
      this.clearing.timer -= dt;
      if (this.clearing.timer <= 0) this.finishClear();
      return;
    }
    if (!this.active) return;

    if (this.isGrounded()) {
      this.gravityTimer = 0;
      this.lockTimer += dt;
      if (this.lockTimer >= LOCK_DELAY) this.lock();
      return;
    }

    this.lockTimer = 0;
    const normal = gravityInterval(this.level);
    const interval = this.softDropping ? Math.min(SOFT_DROP_INTERVAL, normal) : normal;
    this.gravityTimer += dt;
    while (this.gravityTimer >= interval) {
      this.gravityTimer -= interval;
      if (!this.stepDown()) {
        this.gravityTimer = 0;
        break;
      }
      if (this.softDropping) this.score += SOFT_DROP_POINTS;
    }
  }
}
