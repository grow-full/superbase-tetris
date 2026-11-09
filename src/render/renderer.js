import { COLS, VISIBLE_ROWS, HIDDEN_ROWS, CLEAR_DURATION } from '../game/constants.js';
import { getCells } from '../game/pieces.js';

export const PIECE_COLORS = {
  I: '#f472b6',
  O: '#a3e635',
  T: '#22d3ee',
  S: '#fbbf24',
  Z: '#a78bfa',
  J: '#2dd4bf',
  L: '#fb7185',
};

const BG = '#0b0d1a';
const GRID = 'rgba(148, 163, 255, 0.07)';

/** 캔버스를 화면 크기와 기기 픽셀 비율에 맞춘다. 논리 크기(CSS px)를 돌려준다. */
function fitCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

function drawBlock(ctx, x, y, size, color, alpha = 1) {
  const pad = Math.max(1, size * 0.06);
  const s = size - pad * 2;
  const px = x + pad;
  const py = y + pad;
  const r = size * 0.16;

  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(px, py, s, s, r);
  ctx.fill();

  // 위쪽 밝은 면
  const grad = ctx.createLinearGradient(0, py, 0, py + s);
  grad.addColorStop(0, 'rgba(255,255,255,0.45)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.05)');
  grad.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawPreview(canvas, type, dim = false) {
  const { ctx, w, h } = fitCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  if (!type) return;
  const cells = getCells(type, 0);
  const xs = cells.map(([x]) => x);
  const ys = cells.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const cols = maxX - minX + 1;
  const rows = maxY - minY + 1;
  const size = Math.min(w / 4.6, h / 2.8);
  const ox = (w - cols * size) / 2;
  const oy = (h - rows * size) / 2;
  for (const [x, y] of cells) {
    drawBlock(ctx, ox + (x - minX) * size, oy + (y - minY) * size, size, PIECE_COLORS[type], dim ? 0.35 : 1);
  }
}

export class Renderer {
  constructor({ board, hold, next }) {
    this.boardCanvas = board;
    this.holdCanvas = hold;
    this.nextCanvases = next;
  }

  draw(game) {
    this.drawBoard(game);
    drawPreview(this.holdCanvas, game.hold, game.holdUsed);
    this.nextCanvases.forEach((c, i) => drawPreview(c, game.queue[i]));
  }

  drawBoard(game) {
    const { ctx, w, h } = fitCanvas(this.boardCanvas);
    const size = Math.min(w / COLS, h / VISIBLE_ROWS);

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < COLS; x++) {
      ctx.moveTo(x * size + 0.5, 0);
      ctx.lineTo(x * size + 0.5, h);
    }
    for (let y = 1; y < VISIBLE_ROWS; y++) {
      ctx.moveTo(0, y * size + 0.5);
      ctx.lineTo(w, y * size + 0.5);
    }
    ctx.stroke();

    // 일시정지 중에는 보드를 가린다
    if (game.paused || !game.started) return;

    for (let y = HIDDEN_ROWS; y < game.board.length; y++) {
      for (let x = 0; x < COLS; x++) {
        const type = game.board[y][x];
        if (type) drawBlock(ctx, x * size, (y - HIDDEN_ROWS) * size, size, PIECE_COLORS[type]);
      }
    }

    if (game.active) {
      const p = game.active;
      for (const [cx, cy] of getCells(p.type, p.rot)) {
        const y = p.y + cy;
        if (y >= HIDDEN_ROWS) drawBlock(ctx, (p.x + cx) * size, (y - HIDDEN_ROWS) * size, size, PIECE_COLORS[p.type]);
      }
    }

    if (game.clearing) {
      const t = Math.max(game.clearing.timer, 0) / CLEAR_DURATION; // 1 → 0
      ctx.fillStyle = `rgba(255,255,255,${0.85 * t})`;
      for (const y of game.clearing.rows) {
        if (y >= HIDDEN_ROWS) ctx.fillRect(0, (y - HIDDEN_ROWS) * size, w, size);
      }
    }

    if (game.over) {
      ctx.fillStyle = 'rgba(11,13,26,0.55)';
      ctx.fillRect(0, 0, w, h);
    }
  }
}
