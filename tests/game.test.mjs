import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/game.js';
import { createBag } from '../src/game/bag.js';
import { PIECE_TYPES, getCells, getKicks } from '../src/game/pieces.js';
import { COLS, ROWS, LOCK_DELAY, CLEAR_DURATION, gravityInterval, levelForLines } from '../src/game/constants.js';
import { validateNickname, validateFeedback, hasBannedWord } from '../src/ui/validation.js';

function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return s / 2 ** 31;
  };
}

function newGame(firstType) {
  const g = new Game({ rng: seeded(7) });
  g.start();
  if (firstType) g.spawn(firstType);
  return g;
}

function fillRow(g, y, gapX = -1) {
  for (let x = 0; x < COLS; x++) g.board[y][x] = x === gapX ? null : 'O';
}

test('7-bag: 7개마다 7종이 한 번씩 나온다', () => {
  const next = createBag(seeded(3));
  for (let round = 0; round < 5; round++) {
    const set = new Set(Array.from({ length: 7 }, next));
    assert.equal(set.size, 7);
  }
});

test('모든 블록은 4칸이며 회전 4상태를 가진다', () => {
  for (const t of PIECE_TYPES) {
    for (let r = 0; r < 4; r++) assert.equal(getCells(t, r).length, 4);
  }
});

test('T 블록을 4번 회전하면 원래 모양으로 돌아온다', () => {
  const g = newGame('T');
  g.board.forEach((row) => row.fill(null));
  g.active.y = 10;
  const before = JSON.stringify(g.active);
  for (let i = 0; i < 4; i++) assert.ok(g.rotate(1));
  assert.equal(JSON.stringify(g.active), before);
});

test('벽에 붙은 I 블록은 위치 보정(월 킥)으로 회전한다', () => {
  const g = newGame('I');
  g.active.rot = 1;
  g.active.y = 10;
  g.active.x = -2; // 세로 I가 왼쪽 벽(0열)에 붙은 상태
  assert.ok(!g.collides(g.active));
  assert.ok(g.rotate(1));
  assert.ok(!g.collides(g.active));
  assert.ok(getCells('I', g.active.rot).every(([cx]) => g.active.x + cx >= 0));
});

test('위치 보정값은 화면 좌표(y 아래가 +)로 변환된다', () => {
  assert.deepEqual(getKicks('T', 0, 1)[2], [-1, -1]);
  assert.deepEqual(getKicks('O', 0, 1), [[0, 0]]);
});

test('벽 밖으로는 이동할 수 없다', () => {
  const g = newGame('O');
  for (let i = 0; i < 20; i++) g.move(-1);
  assert.equal(g.active.x, 0);
  for (let i = 0; i < 20; i++) g.move(1);
  assert.equal(g.active.x, COLS - 2);
});

test('하드 드롭: 1칸당 2점, 바닥에 고정된다', () => {
  const g = newGame('O');
  const rows = g.hardDrop();
  assert.equal(rows, ROWS - 2);
  assert.equal(g.score, rows * 2);
  assert.equal(g.board[ROWS - 1][4], 'O');
  assert.equal(g.board[ROWS - 1][5], 'O');
});

test('소프트 드롭: 내려간 칸당 1점', () => {
  const g = newGame('O');
  g.setSoftDrop(true);
  for (let i = 0; i < 5; i++) g.update(0.035);
  assert.ok(g.score >= 4 && g.score <= 5, `score=${g.score}`);
});

test('1줄 제거 = 100 × 레벨, 애니메이션 후 줄이 사라진다', () => {
  const g = newGame('I');
  fillRow(g, ROWS - 1);
  for (let x = 3; x <= 6; x++) g.board[ROWS - 1][x] = null; // 가운데 4칸 비움
  g.hardDrop();
  const dropPoints = (ROWS - 2) * 2;
  assert.equal(g.score, dropPoints + 100);
  assert.equal(g.lines, 1);
  assert.ok(g.clearing);
  g.update(CLEAR_DURATION + 0.01);
  assert.equal(g.clearing, null);
  assert.ok(g.board[ROWS - 1].every((c) => c === null));
  assert.ok(g.active, '다음 블록이 나와야 함');
});

test('4줄 동시 제거 = 800점', () => {
  const g = newGame('I');
  for (let y = ROWS - 4; y < ROWS; y++) fillRow(g, y, 0);
  g.rotate(1); // 세로
  while (g.move(-1));
  const before = g.score;
  const rows = g.hardDrop();
  assert.equal(g.lines, 4);
  assert.equal(g.score - before, rows * 2 + 800);
});

test('10줄마다 레벨이 오르고 낙하 속도가 빨라진다', () => {
  assert.equal(levelForLines(9), 1);
  assert.equal(levelForLines(10), 2);
  assert.ok(gravityInterval(5) < gravityInterval(1));
  const g = newGame();
  let leveled = null;
  g.on((type, data) => type === 'levelUp' && (leveled = data.level));
  g.lines = 9;
  g.addLineScore(1);
  assert.equal(g.level, 2);
  assert.equal(leveled, 2);
});

test('고정 지연: 바닥에 닿은 뒤 0.5초 지나면 고정된다', () => {
  const g = newGame('O');
  while (g.stepDown());
  g.update(LOCK_DELAY / 2);
  assert.equal(g.board[ROWS - 1][4], null);
  g.update(LOCK_DELAY / 2 + 0.01);
  assert.equal(g.board[ROWS - 1][4], 'O');
});

test('홀드: 보관 후 같은 블록 차례에는 다시 쓸 수 없다', () => {
  const g = newGame('T');
  const nextType = g.queue[0];
  assert.ok(g.holdPiece());
  assert.equal(g.hold, 'T');
  assert.equal(g.active.type, nextType);
  assert.equal(g.holdPiece(), false);
  g.hardDrop();
  assert.ok(g.holdPiece());
  assert.equal(g.active.type, 'T');
});

test('일시정지 중에는 시간이 흐르지 않고 조작도 안 된다', () => {
  const g = newGame('O');
  g.setPaused(true);
  const y = g.active.y;
  g.update(5);
  assert.equal(g.active.y, y);
  assert.equal(g.elapsed, 0);
  assert.equal(g.move(1), false);
});

test('생성 위치가 막히면 게임 오버', () => {
  const g = newGame();
  let over = null;
  g.on((type, data) => type === 'gameOver' && (over = data));
  for (let y = 0; y < ROWS; y++) fillRow(g, y, y % COLS);
  g.spawnNext();
  assert.ok(g.over);
  assert.ok(over && typeof over.score === 'number');
});

test('닉네임/피드백 검사', () => {
  assert.equal(validateNickname('홍길동'), null);
  assert.ok(validateNickname('a'));
  assert.ok(validateNickname('가'.repeat(13)));
  assert.equal(validateNickname('', { required: false }), null);
  assert.ok(validateNickname('씨 발'));
  assert.ok(hasBannedWord('F.u.c.k'));
  assert.equal(validateFeedback('재밌어요'), null);
  assert.ok(validateFeedback('   '));
  assert.ok(validateFeedback('a'.repeat(501)));
});
