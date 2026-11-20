import { COLS, ROWS, DANGER_LINE, HIT_RADIUS, createGame } from "./game.js";

const BEST_KEY = "kamnepad-best";
const HIT_COOLDOWN_MS = 90;

const canvas = document.querySelector("#board");
const ctx = canvas.getContext("2d");
const scoreEl = document.querySelector("#score");
const waveEl = document.querySelector("#wave");
const bestEl = document.querySelector("#best");
const bannerEl = document.querySelector("#banner");
const startEl = document.querySelector("#start");
const overEl = document.querySelector("#over");
const recordEl = document.querySelector("#record");
const overScoreEl = document.querySelector("#over-score");
const overWaveEl = document.querySelector("#over-wave");
const overBestEl = document.querySelector("#over-best");

const game = createGame();
const pointers = new Map();
const view = { cell: 20, ox: 0, oy: 0, dpr: 1, width: 360, height: 580 };

let best = readBest();
let runRecord = false;
let overShown = false;
let lastTime = performance.now();

bestEl.textContent = String(best);
initTelegram();
lockGestures();
resize();
requestAnimationFrame(frame);

window.addEventListener("resize", resize);
window.addEventListener("orientationchange", () => setTimeout(resize, 60));
document.querySelector("#play").addEventListener("click", begin);
document.querySelector("#again").addEventListener("click", begin);

canvas.addEventListener("pointerdown", (event) => {
  if (game.phase !== "playing") return;
  event.preventDefault();
  try {
    canvas.setPointerCapture(event.pointerId);
  } catch {
    // У синтетического или уже отпущенного указателя нет захвата, удар всё равно засчитывается.
  }
  const point = cellFromEvent(event);
  pointers.set(event.pointerId, { x: point.x, y: point.y, last: 0 });
  strike(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  const pointer = pointers.get(event.pointerId);
  if (!pointer || game.phase !== "playing") return;
  event.preventDefault();
  const point = cellFromEvent(event);
  pointer.x = point.x;
  pointer.y = point.y;
  if (performance.now() - pointer.last >= HIT_COOLDOWN_MS) strike(event.pointerId);
});

canvas.addEventListener("pointerup", (event) => {
  pointers.delete(event.pointerId);
});
canvas.addEventListener("pointercancel", (event) => {
  pointers.delete(event.pointerId);
});
canvas.addEventListener("contextmenu", (event) => event.preventDefault());

function begin() {
  pointers.clear();
  runRecord = false;
  overShown = false;
  recordEl.classList.add("hidden");
  startEl.classList.add("hidden");
  overEl.classList.add("hidden");
  game.start();
  syncHud();
}

function strike(id) {
  if (game.phase !== "playing") return;
  const pointer = pointers.get(id);
  if (!pointer) return;
  pointer.last = performance.now();
  const result = game.applyHit(pointer.x, pointer.y);
  if (result.destroyedCells > 0 || result.destroyedPieces > 0) haptic("break");
  else if (result.damagedCells > 0) haptic("hit");
}

function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  if (game.phase !== "menu") game.update(dt);
  syncHud();
  render();
  requestAnimationFrame(frame);
}

function syncHud() {
  if (game.phase === "playing" && game.score > best) {
    best = game.score;
    writeBest(best);
    runRecord = true;
  }
  scoreEl.textContent = String(game.score);
  waveEl.textContent = String(game.wave);
  bestEl.textContent = String(best);
  const showBanner = game.phase === "playing" && game.time < game.bannerUntil;
  bannerEl.textContent = game.bannerText;
  bannerEl.classList.toggle("hidden", !showBanner);
  if (game.phase === "over") showGameOver();
}

function showGameOver() {
  if (overShown) return;
  overShown = true;
  pointers.clear();
  overScoreEl.textContent = String(game.score);
  overWaveEl.textContent = String(game.wave);
  overBestEl.textContent = String(best);
  recordEl.classList.toggle("hidden", !runRecord);
  overEl.classList.remove("hidden");
  haptic(runRecord ? "record" : "over");
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  view.width = Math.max(1, rect.width);
  view.height = Math.max(1, rect.height);
  view.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = Math.max(1, Math.round(view.width * view.dpr));
  canvas.height = Math.max(1, Math.round(view.height * view.dpr));
  view.cell = Math.min(view.width / COLS, view.height / ROWS);
  view.ox = (view.width - view.cell * COLS) / 2;
  view.oy = (view.height - view.cell * ROWS) / 2;
}

function cellFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left - view.ox) / view.cell,
    y: (event.clientY - rect.top - view.oy) / view.cell,
  };
}

function render() {
  const { cell, dpr, width, height } = view;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, width, height);

  const mag = game.shake * cell * 0.28;
  const shakeX = mag ? (Math.random() - 0.5) * mag : 0;
  const shakeY = mag ? (Math.random() - 0.5) * mag : 0;
  ctx.save();
  ctx.translate(view.ox + shakeX, view.oy + shakeY);
  ctx.beginPath();
  ctx.rect(0, 0, COLS * cell, ROWS * cell);
  ctx.clip();

  ctx.fillStyle = "#0e1730";
  ctx.fillRect(0, 0, COLS * cell, ROWS * cell);
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      ctx.fillStyle = (x + y) % 2 === 0 ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.015)";
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }

  const lineY = DANGER_LINE * cell;
  const gradient = ctx.createLinearGradient(0, lineY, 0, ROWS * cell);
  gradient.addColorStop(0, "rgba(255, 45, 70, 0.18)");
  gradient.addColorStop(1, "rgba(255, 45, 70, 0.02)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, lineY, COLS * cell, ROWS * cell - lineY);

  for (const stone of game.stones) drawStone(stone, cell);
  drawParticles(cell);
  drawFloaters(cell);

  ctx.shadowColor = "#ff2d3a";
  ctx.shadowBlur = 14;
  ctx.strokeStyle = "#ff3142";
  ctx.lineWidth = Math.max(2, cell * 0.1);
  ctx.beginPath();
  ctx.moveTo(0, lineY);
  ctx.lineTo(COLS * cell, lineY);
  ctx.stroke();
  ctx.shadowBlur = 0;

  drawRings(cell);
  ctx.restore();
}

function drawStone(stone, cell) {
  const gap = Math.max(1, cell * 0.1);
  const size = cell - gap;
  for (const block of stone.cells) {
    const x = (stone.x + block.dx) * cell + gap / 2;
    const y = (stone.y + block.dy) * cell + gap / 2;
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(x, y + 1, size, size);
    ctx.fillStyle = stone.color;
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.fillRect(x, y, size, Math.max(2, size * 0.14));
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(x, y + size * 0.72, size, size * 0.28);
    const damage = 1 - block.hp / block.maxHp;
    if (damage > 0) drawCracks(x, y, size, block, damage);
    const label = String(block.hp);
    ctx.font = `800 ${Math.max(9, Math.floor(size * 0.46))}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = Math.max(2, size * 0.12);
    ctx.strokeStyle = "rgba(8, 10, 18, 0.8)";
    ctx.fillStyle = "#ffffff";
    const textX = x + size / 2;
    const textY = y + size / 2 + size * 0.02;
    ctx.strokeText(label, textX, textY);
    ctx.fillText(label, textX, textY);
  }
}

function drawCracks(x, y, size, block, damage) {
  let seed = (block.dx * 17 + block.dy * 31 + block.maxHp * 13 + 9) >>> 0;
  const roll = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 0.5, y + 0.5, size - 1, size - 1);
  ctx.clip();
  ctx.strokeStyle = "rgba(28, 8, 16, 0.92)";
  ctx.lineWidth = Math.max(1.25, size * 0.09);
  ctx.lineCap = "round";
  ctx.beginPath();
  const cracks = 2 + Math.floor(damage * 3);
  for (let i = 0; i < cracks; i += 1) {
    const edge = Math.floor(roll() * 4);
    const along = roll();
    let startX = x;
    let startY = y;
    if (edge === 0) {
      startX = x + along * size;
      startY = y + 1;
    } else if (edge === 1) {
      startX = x + size - 1;
      startY = y + along * size;
    } else if (edge === 2) {
      startX = x + along * size;
      startY = y + size - 1;
    } else {
      startX = x + 1;
      startY = y + along * size;
    }
    const midX = x + size * (0.32 + roll() * 0.36);
    const midY = y + size * (0.32 + roll() * 0.36);
    ctx.moveTo(startX, startY);
    ctx.lineTo(midX, midY);
    if (damage > 0.4) {
      ctx.lineTo(midX + (roll() - 0.5) * size * 0.7, midY + (roll() - 0.5) * size * 0.7);
    }
  }
  ctx.stroke();
  ctx.restore();
}

function drawParticles(cell) {
  for (const particle of game.particles) {
    const alpha = Math.max(0, particle.life / particle.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    const size = particle.size * cell;
    ctx.fillRect(particle.x * cell - size / 2, particle.y * cell - size / 2, size, size);
  }
  ctx.globalAlpha = 1;
}

function drawFloaters(cell) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const floater of game.floaters) {
    ctx.globalAlpha = Math.max(0, floater.life / 0.55);
    ctx.font = `800 ${Math.max(12, cell * 0.7)}px system-ui, sans-serif`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(8, 10, 18, 0.75)";
    ctx.fillStyle = "#ffe08a";
    ctx.strokeText(floater.text, floater.x * cell, floater.y * cell);
    ctx.fillText(floater.text, floater.x * cell, floater.y * cell);
  }
  ctx.globalAlpha = 1;
}

function drawRings(cell) {
  ctx.lineWidth = Math.max(2, cell * 0.08);
  for (const pointer of pointers.values()) {
    const x = pointer.x * cell;
    const y = pointer.y * cell;
    ctx.beginPath();
    ctx.strokeStyle = "rgba(245, 197, 66, 0.95)";
    ctx.arc(x, y, HIT_RADIUS * cell, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.fillStyle = "rgba(245, 197, 66, 0.9)";
    ctx.arc(x, y, Math.max(3, cell * 0.16), 0, Math.PI * 2);
    ctx.fill();
  }
}

function readBest() {
  try {
    const value = Number(localStorage.getItem(BEST_KEY));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch {
    return 0;
  }
}

function writeBest(value) {
  try {
    localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Приватный режим может запретить localStorage — рекорд останется в памяти вкладки.
  }
}

function initTelegram() {
  const telegram = window.Telegram && window.Telegram.WebApp;
  if (!telegram) return;
  try {
    telegram.ready();
    telegram.expand();
    if (typeof telegram.disableVerticalSwipes === "function") telegram.disableVerticalSwipes();
    if (typeof telegram.setHeaderColor === "function") telegram.setHeaderColor("#0b1220");
    if (typeof telegram.setBackgroundColor === "function") telegram.setBackgroundColor("#0b1220");
  } catch {
    // Клиент Telegram старее отдельных методов — игра всё равно работает.
  }
}

function haptic(kind) {
  const feedback = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback;
  if (!feedback) return;
  try {
    if (kind === "hit") feedback.impactOccurred("light");
    else if (kind === "break") feedback.impactOccurred("medium");
    else if (kind === "record") feedback.notificationOccurred("success");
    else feedback.notificationOccurred("error");
  } catch {
    // Вибрация необязательна.
  }
}

function lockGestures() {
  const block = (event) => {
    if (event.cancelable) event.preventDefault();
  };
  document.addEventListener("touchmove", block, { passive: false });
  document.addEventListener("gesturestart", block, { passive: false });
  document.addEventListener("gesturechange", block, { passive: false });
  window.addEventListener("wheel", (event) => {
    if (event.ctrlKey) event.preventDefault();
  }, { passive: false });
}
