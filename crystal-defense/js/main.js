// 진입점: 게임 · UI 생성 후 렌더 루프를 돌린다.
import { Game } from './game.js';
import { UI } from './ui.js';

const canvas = document.getElementById('scene');
const fxLayer = document.getElementById('fx-layer');

const game = new Game(canvas, fxLayer);
const ui = new UI(game);
game.ui = ui;
ui.refreshLobby();

// 로비/게임 공용 루프 (게임 시작 전에도 네트워크 하트비트는 돈다)
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt);
  game.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 로비 표시 중에도 방 인원이 바뀌면 목록을 갱신
setInterval(() => { if (!game.running) ui.refreshLobby(); }, 1000);

// 디버그 편의
window.__game = game;
