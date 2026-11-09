export const PIECE_TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

const BASE = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
};

function rotateCW(matrix) {
  const n = matrix.length;
  return matrix.map((row, r) => row.map((_, c) => matrix[n - 1 - c][r]));
}

function toCells(matrix) {
  const cells = [];
  matrix.forEach((row, y) => row.forEach((v, x) => v && cells.push([x, y])));
  return cells;
}

/** SHAPES[type][rotation] = [[x, y], ...] (회전 상태 0~3) */
const SHAPES = {};
for (const type of PIECE_TYPES) {
  const states = [BASE[type]];
  for (let i = 1; i < 4; i++) states.push(rotateCW(states[i - 1]));
  SHAPES[type] = states.map(toCells);
}

export function getCells(type, rotation) {
  return SHAPES[type][rotation];
}

export function shapeSize(type) {
  return BASE[type].length;
}

// 회전이 막혔을 때 시도할 위치 보정값 (x, y). y는 위쪽이 + 인 표기이며 getKicks에서 화면 좌표로 바꾼다.
const KICKS_JLSTZ = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};

const KICKS_I = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

/** 회전 시 시도할 위치 보정 목록 (화면 좌표: y는 아래쪽이 +) */
export function getKicks(type, from, to) {
  if (type === 'O') return [[0, 0]];
  const table = type === 'I' ? KICKS_I : KICKS_JLSTZ;
  return table[`${from}>${to}`].map(([x, y]) => [x, -y]);
}
