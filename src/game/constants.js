export const COLS = 10;
export const VISIBLE_ROWS = 20;
export const HIDDEN_ROWS = 2;
export const ROWS = VISIBLE_ROWS + HIDDEN_ROWS;

export const NEXT_COUNT = 3;

// 시간 단위: 초
export const LOCK_DELAY = 0.5;
export const MAX_LOCK_RESETS = 15;
export const CLEAR_DURATION = 0.25;
export const SOFT_DROP_INTERVAL = 0.035;
export const DAS = 0.17;
export const ARR = 0.05;

export const LINES_PER_LEVEL = 10;
export const LINE_SCORES = [0, 100, 300, 500, 800];
export const SOFT_DROP_POINTS = 1;
export const HARD_DROP_POINTS = 2;

/** 레벨별 한 칸 낙하 간격(초). 레벨이 오를수록 짧아진다. */
export function gravityInterval(level) {
  const l = Math.min(Math.max(level, 1), 20);
  return Math.max(Math.pow(0.8 - (l - 1) * 0.007, l - 1), 0.02);
}

export function levelForLines(lines) {
  return Math.floor(lines / LINES_PER_LEVEL) + 1;
}
