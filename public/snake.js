// SNAKE GAME LOGIC (Separate File)
const startBtn = document.getElementById('start-snake-btn');
const closeBtn = document.getElementById('close-game-btn');
const gameContainer = document.getElementById('game-container');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

var COLS = 20, ROWS = 20, FPS = 6, CELL;
var snake, dir, nextDir, food, score, best = 0, phase = 'idle', loopTimer;

var COLORS = { bg: '#1a1a2e', grid: '#16213e', snakeHead: '#56ef83', snakeBody: '#2ecc71', food: '#e74c3c', text: '#ffffff', dimText: 'rgba(255,255,255,0.5)', overlay: 'rgba(0,0,0,0.55)' };

function cell(x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
}

function drawOverlay(title, sub) {
  ctx.fillStyle = COLORS.overlay; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center'; ctx.fillStyle = COLORS.text;
  ctx.font = 'bold ' + Math.max(20, CELL * 1.6) + 'px monospace';
  ctx.fillText(title, canvas.width / 2, canvas.height / 2 - 10);
  ctx.fillStyle = COLORS.dimText; ctx.font = Math.max(11, CELL * 0.65) + 'px monospace';
  ctx.fillText(sub, canvas.width / 2, canvas.height / 2 + 30);
  ctx.textAlign = 'left';
}

function draw() {
  ctx.fillStyle = COLORS.bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = COLORS.food;
  ctx.beginPath(); ctx.arc(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, CELL / 2 - 2, 0, Math.PI * 2); ctx.fill();
  snake.forEach((s, i) => cell(s.x, s.y, i === 0 ? COLORS.snakeHead : COLORS.snakeBody));
  
  ctx.fillStyle = COLORS.dimText; ctx.textAlign = 'right';
  ctx.font = 'bold ' + Math.max(12, CELL * 0.8) + 'px monospace';
  ctx.fillText(score, canvas.width - CELL * 0.5, CELL * 1.2);
  if (best) { ctx.font = Math.max(10, CELL * 0.6) + 'px monospace'; ctx.fillText('best ' + best, canvas.width - CELL * 0.5, CELL * 2.0); }
  ctx.textAlign = 'left';

  if (phase === 'idle') drawOverlay('SNAKE', 'swipe to start');
  else if (phase === 'dead') drawOverlay('GAME OVER', 'score ' + score + '  tap to play again');
}

function initSnake() {
  snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
  dir = { x: 1, y: 0 }; nextDir = { x: 1, y: 0 }; score = 0;
  placeFood();
}

function placeFood() {
  do { food = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) }; } 
  while (snake.some(s => s.x === food.x && s.y === food.y));
}

function startSnake() {
  if (loopTimer) clearInterval(loopTimer);
  initSnake(); phase = 'running'; loopTimer = setInterval(tick, 1000 / FPS);
}

function tick() {
  dir = nextDir;
  var head = { x: (snake[0].x + dir.x + COLS) % COLS, y: (snake[0].y + dir.y + ROWS) % ROWS };
  if (snake.some(s => s.x === head.x && s.y === head.y)) {
    phase = 'dead'; best = Math.max(best, score); clearInterval(loopTimer); draw(); return;
  }
  snake.unshift(head);
  if (head.x === food.x && head.y === food.y) { score++; placeFood(); } else { snake.pop(); }
  draw();
}

function resizeSnake() {
  var size = Math.min(window.innerWidth, window.innerHeight) * 0.9;
  CELL = Math.floor(size / COLS);
  canvas.width = CELL * COLS; canvas.height = CELL * COLS;
  if (phase !== 'running') draw();
}

window.addEventListener('resize', resizeSnake);

// Touch Controls
var touchStart = null;
canvas.addEventListener('touchstart', e => { e.preventDefault(); touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: false });
canvas.addEventListener('touchend', e => {
  e.preventDefault(); if (!touchStart) return;
  var dx = e.changedTouches[0].clientX - touchStart.x, dy = e.changedTouches[0].clientY - touchStart.y; touchStart = null;
  if (phase !== 'running') { startSnake(); return; }
  if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
  if (Math.abs(dx) > Math.abs(dy)) {
    if (dx > 0 && dir.x === 0) nextDir = { x: 1, y: 0 };
    if (dx < 0 && dir.x === 0) nextDir = { x: -1, y: 0 };
  } else {
    if (dy > 0 && dir.y === 0) nextDir = { x: 0, y: 1 };
    if (dy < 0 && dir.y === 0) nextDir = { x: 0, y: -1 };
  }
}, { passive: false });

// Open/Close Game Logic
startBtn.addEventListener('click', () => {
  gameContainer.style.display = 'flex';
  initSnake(); phase = 'idle'; resizeSnake(); draw();
});
closeBtn.addEventListener('click', () => {
  gameContainer.style.display = 'none'; clearInterval(loopTimer);
});
