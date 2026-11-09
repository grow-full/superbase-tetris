import { DAS, ARR } from '../game/constants.js';

const KEY_ACTIONS = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowDown: 'soft',
  Space: 'hard',
  ArrowUp: 'cw',
  KeyX: 'cw',
  KeyZ: 'ccw',
  ControlLeft: 'ccw',
  ControlRight: 'ccw',
  KeyC: 'hold',
  ShiftLeft: 'hold',
  ShiftRight: 'hold',
  KeyP: 'pause',
  Escape: 'pause',
  KeyM: 'mute',
};

function isTyping(target) {
  return target instanceof HTMLElement && (target.matches('input, textarea, select') || target.isContentEditable);
}

/**
 * 키보드 입력. 좌우 키를 누르고 있으면 DAS(첫 지연) 뒤 ARR 간격으로 반복 이동한다.
 * isActive(): 게임 화면이 떠 있고 대화상자가 닫혀 있을 때만 true
 */
export class KeyboardInput {
  constructor(game, { isActive, onPause, onMute }) {
    this.game = game;
    this.isActive = isActive;
    this.onPause = onPause;
    this.onMute = onMute;
    this.dirStack = [];
    this.dasTimer = 0;
    this.arrTimer = 0;

    window.addEventListener('keydown', (e) => this.handleDown(e));
    window.addEventListener('keyup', (e) => this.handleUp(e));
    window.addEventListener('blur', () => this.releaseAll());
  }

  handleDown(e) {
    const action = KEY_ACTIONS[e.code];
    if (!action || isTyping(e.target) || !this.isActive()) return;
    e.preventDefault();
    if (e.repeat) return;

    const g = this.game;
    switch (action) {
      case 'left':
      case 'right': {
        const dir = action === 'left' ? -1 : 1;
        this.dirStack = this.dirStack.filter((d) => d !== dir);
        this.dirStack.push(dir);
        this.dasTimer = 0;
        this.arrTimer = 0;
        g.move(dir);
        break;
      }
      case 'soft':
        g.setSoftDrop(true);
        break;
      case 'hard':
        g.hardDrop();
        break;
      case 'cw':
        g.rotate(1);
        break;
      case 'ccw':
        g.rotate(-1);
        break;
      case 'hold':
        g.holdPiece();
        break;
      case 'pause':
        this.onPause();
        break;
      case 'mute':
        this.onMute();
        break;
    }
  }

  handleUp(e) {
    const action = KEY_ACTIONS[e.code];
    if (action === 'left') this.dirStack = this.dirStack.filter((d) => d !== -1);
    if (action === 'right') this.dirStack = this.dirStack.filter((d) => d !== 1);
    if (action === 'soft') this.game.setSoftDrop(false);
  }

  releaseAll() {
    this.dirStack = [];
    this.game.setSoftDrop(false);
  }

  update(dt) {
    if (!this.isActive()) {
      this.releaseAll();
      return;
    }
    const dir = this.dirStack[this.dirStack.length - 1];
    if (!dir) return;
    this.dasTimer += dt;
    if (this.dasTimer < DAS) return;
    this.arrTimer += dt;
    while (this.arrTimer >= ARR) {
      this.arrTimer -= ARR;
      if (!this.game.move(dir)) {
        this.arrTimer = 0;
        break;
      }
    }
  }
}
