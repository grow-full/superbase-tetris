import { PIECE_TYPES } from './pieces.js';

/** 7종 블록을 섞어 한 묶음씩 꺼내는 생성기. 같은 블록이 계속 나오는 것을 막는다. */
export function createBag(rng = Math.random) {
  let bag = [];
  return function next() {
    if (bag.length === 0) {
      bag = [...PIECE_TYPES];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.pop();
  };
}
