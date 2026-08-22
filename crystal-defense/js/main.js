import { Game } from './game.js';
import { UI } from './ui.js';

var canvas = document.getElementById("scene");
var fxLayer = document.getElementById("fx-layer");
var game = new Game(canvas, fxLayer);
var ui2 = new UI(game);
game.ui = ui2;
ui2.refreshLobby();
var last = performance.now();
function frame(now) {
  const dt2 = Math.min(0.05, (now - last) / 1e3);
  last = now;
  game.update(dt2);
  game.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
setInterval(() => {
  if (!game.running) ui2.refreshLobby();
}, 1e3);
window.__game = game;
