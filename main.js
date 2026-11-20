import {
  COLS,
  ROWS,
  DANGER_LINE,
  HIT_RADIUS,
  BOMB_COST,
  BOMB_UNLOCK_WAVE,
  ACID_COST,
  ACID_UNLOCK_WAVE,
  createGame,
} from "./game.js";

const STORAGE = {
  best: "kamnepad-best",
  bestWave: "kamnepad-best-wave",
  coins: "kamnepad-coins",
  bombs: "kamnepad-bombs",
  acid: "kamnepad-acid",
};
const HIT_COOLDOWN_MS = 90;

const canvas = document.querySelector("#board");
const ctx = canvas.getContext("2d");
const scoreEl = document.querySelector("#score");
const waveEl = document.querySelector("#wave");
const bestEl = document.querySelector("#best");
const coinsEl = document.querySelector("#coins");
const bannerEl = document.querySelector("#banner");
const startEl = document.querySelector("#start");
const overEl = document.querySelector("#over");
const shopEl = document.querySelector("#shop");
const recordEl = document.querySelector("#record");
const overScoreEl = document.querySelector("#over-score");
const overWaveEl = document.querySelector("#over-wave");
const overBestEl = document.querySelector("#over-best");
const abilityLayer = document.querySelector("#ability-layer");
const abilitiesEl = document.querySelector("#abilities");
const armHint = document.querySelector("#arm-hint");
const bombBtn = document.querySelector("#arm-bomb");
const acidBtn = document.querySelector("#arm-acid");
const bombCountEl = document.querySelector("#bomb-count");
const acidCountEl = document.querySelector("#acid-count");
const shopCoinsEl = document.querySelector("#shop-coins");
const stockBombEl = document.querySelector("#stock-bomb");
const stockAcidEl = document.querySelector("#stock-acid");
const lockBombEl = document.querySelector("#lock-bomb");
const lockAcidEl = document.querySelector("#lock-acid");
const buyBombEl = document.querySelector("#buy-bomb");
const buyAcidEl = document.querySelector("#buy-acid");

const game = createGame();
const pointers = new Map();
const view = { cell: 20, ox: 0, oy: 0, dpr: 1, width: 360, height: 580 };

let best = readNumber(STORAGE.best);
let bestWave = readNumber(STORAGE.bestWave);
let coins = readNumber(STORAGE.coins);
let bombs = readNumber(STORAGE.bombs);
let acid = readNumber(STORAGE.acid);
let armed = null;
let shopReturn = "start";
let runRecord = false;
let overShown = false;
let lastTime = performance.now();

bestEl.textContent = String(best);
coinsEl.textContent = String(coins);
initTelegram();
lockGestures();
resize();
syncAbilityButtons();
requestAnimationFrame(frame);

window.addEventListener("resize", resize);
window.addEventListener("orientationchange", () => setTimeout(resize, 60));
document.querySelector("#play").addEventListener("click", begin);
document.querySelector("#again").addEventListener("click", begin);
document.querySelector("#shop-start").addEventListener("click", () => openShop("start"));
document.querySelector("#shop-over").addEventListener("click", () => openShop("over"));
document.querySelector("#shop-close").addEventListener("click", closeShop);
buyBombEl.addEventListener("click", () => buy("bomb"));
buyAcidEl.addEventListener("click", () => buy("acid"));
bombBtn.addEventListener("pointerdown", (event) => onArmPointer(event, "bomb"));
acidBtn.addEventListener("pointerdown", (event) => onArmPointer(event, "acid"));

canvas.addEventListener("pointerdown", (event) => {
  if (game.phase !== "playing") return;
  event.preventDefault();
  try {
    canvas.setPointerCapture(event.pointerId);
  } catch {
    // У синтетического или уже отпущенного указателя нет захвата, удар всё равно засчитывается.
  }
  const point = cellFromEvent(event);
  if (armed) {
    useArmed(point);
    pointers.set(event.pointerId, { x: point.x, y: point.y, last: Infinity, placed: true });
    return;
  }
  pointers.set(event.pointerId, { x: point.x, y: point.y, last: 0, placed: false });
  strike(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  const pointer = pointers.get(event.pointerId);
  if (!pointer || game.phase !== "playing") return;
  event.preventDefault();
  const point = cellFromEvent(event);
  pointer.x = point.x;
  pointer.y = point.y;
  if (pointer.placed) return;
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
  armed = null;
  runRecord = false;
  overShown = false;
  recordEl.classList.add("hidden");
  startEl.classList.add("hidden");
  overEl.classList.add("hidden");
  shopEl.classList.add("hidden");
  game.start();
  noteWave();
  syncAbilityButtons();
  syncHud();
}

function onArmPointer(event, kind) {
  event.preventDefault();
  event.stopPropagation();
  if (game.phase !== "playing") return;
  const stock = kind === "bomb" ? bombs : acid;
  if (stock <= 0) return;
  armed = armed === kind ? null : kind;
  syncAbilityButtons();
}

function useArmed(point) {
  if (armed === "bomb" && bombs > 0) {
    bombs -= 1;
    game.useBomb(point.x, point.y);
    haptic("bomb");
  } else if (armed === "acid" && acid > 0) {
    acid -= 1;
    game.pourAcid(point.x, point.y);
    haptic("acid");
  }
  armed = null;
  saveStock();
  syncAbilityButtons();
}

function strike(id) {
  if (game.phase !== "playing") return;
  const pointer = pointers.get(id);
  if (!pointer || pointer.placed) return;
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
  const gained = game.collectCoins();
  if (gained > 0) {
    coins += gained;
    saveStock();
  }
  if (game.phase === "playing" && game.score > best) {
    best = game.score;
    writeNumber(STORAGE.best, best);
    runRecord = true;
  }
  if (game.phase === "playing") noteWave();
  scoreEl.textContent = String(game.score);
  waveEl.textContent = String(game.wave);
  bestEl.textContent = String(best);
  coinsEl.textContent = String(coins);
  const showBanner = game.phase === "playing" && game.time < game.bannerUntil;
  bannerEl.textContent = game.bannerText;
  bannerEl.classList.toggle("hidden", !showBanner);
  const playing = game.phase === "playing";
  abilityLayer.classList.toggle("hidden", !playing);
  if (playing) placeAbilities();
  if (game.phase === "over") showGameOver();
}

function noteWave() {
  if (game.wave > bestWave) {
    bestWave = game.wave;
    writeNumber(STORAGE.bestWave, bestWave);
  }
}

function showGameOver() {
  if (overShown) return;
  overShown = true;
  pointers.clear();
  armed = null;
  syncAbilityButtons();
  abilityLayer.classList.add("hidden");
  overScoreEl.textContent = String(game.score);
  overWaveEl.textContent = String(game.wave);
  overBestEl.textContent = String(best);
  recordEl.classList.toggle("hidden", !runRecord);
  overEl.classList.remove("hidden");
  haptic(runRecord ? "record" : "over");
}

function openShop(from) {
  shopReturn = from;
  startEl.classList.add("hidden");
  overEl.classList.add("hidden");
  renderShop();
  shopEl.classList.remove("hidden");
}

function closeShop() {
  shopEl.classList.add("hidden");
  if (shopReturn === "over") overEl.classList.remove("hidden");
  else startEl.classList.remove("hidden");
}

function renderShop() {
  const bombLocked = bestWave < BOMB_UNLOCK_WAVE;
  const acidLocked = bestWave < ACID_UNLOCK_WAVE;
  shopCoinsEl.textContent = String(coins);
  stockBombEl.textContent = String(bombs);
  stockAcidEl.textContent = String(acid);
  lockBombEl.classList.toggle("hidden", !bombLocked);
  lockAcidEl.classList.toggle("hidden", !acidLocked);
  buyBombEl.classList.toggle("hidden", bombLocked);
  buyAcidEl.classList.toggle("hidden", acidLocked);
  buyBombEl.disabled = coins < BOMB_COST;
  buyAcidEl.disabled = coins < ACID_COST;
  document.querySelector("#item-bomb").classList.toggle("locked", bombLocked);
  document.querySelector("#item-acid").classList.toggle("locked", acidLocked);
}

function buy(kind) {
  const locked = kind === "bomb" ? bestWave < BOMB_UNLOCK_WAVE : bestWave < ACID_UNLOCK_WAVE;
  const cost = kind === "bomb" ? BOMB_COST : ACID_COST;
  if (locked || coins < cost) return;
  coins -= cost;
  if (kind === "bomb") bombs += 1;
  else acid += 1;
  saveStock();
  coinsEl.textContent = String(coins);
  syncAbilityButtons();
  renderShop();
}

function syncAbilityButtons() {
  bombCountEl.textContent = String(bombs);
  acidCountEl.textContent = String(acid);
  bombBtn.disabled = bombs <= 0;
  acidBtn.disabled = acid <= 0;
  bombBtn.classList.toggle("armed", armed === "bomb");
  acidBtn.classList.toggle("armed", armed === "acid");
  bombBtn.setAttribute("aria-pressed", armed === "bomb" ? "true" : "false");
  acidBtn.setAttribute("aria-pressed", armed === "acid" ? "true" : "false");
  const hint = armed === "bomb" ? "Куда бросить бомбу?" : armed === "acid" ? "Куда вылить кислоту?" : "";
  armHint.textContent = hint;
  armHint.classList.toggle("hidden", !armed);
  if (!abilityLayer.classList.contains("hidden")) placeAbilities();
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  view.width = Math.max(1, rect.width);
  view.height = Math.max(1, rect.height);
  view.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = Math.max(1, Math.round(view.width * view.dpr));
  canvas.height = Math.max(1, Math.round(view.height * view.dpr));
  view.cell = Math.max(1, Math.min(view.width / COLS, view.height / ROWS));
  view.ox = (view.width - view.cell * COLS) / 2;
  view.oy = (view.height - view.cell * ROWS) / 2;
  placeAbilities();
}

function placeAbilities() {
  if (abilityLayer.classList.contains("hidden")) return;
  const line = view.oy + DANGER_LINE * view.cell;
  const hintVisible = !armHint.classList.contains("hidden");
  const hintH = hintVisible ? armHint.offsetHeight + 6 : 0;
  const buttonH = abilitiesEl.offsetHeight || 62;
  let top = line - buttonH * 0.28 - hintH;
  const maxTop = Math.max(4, view.height - (hintH + buttonH) - 4);
  top = Math.max(4, Math.min(maxTop, top));
  abilityLayer.style.top = `${top}px`;
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

  drawPuddles(cell);
  for (const stone of game.stones) drawStone(stone, cell);
  drawParticles(cell);
  drawFloaters(cell);
  drawShockwaves(cell);

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

function drawPuddles(cell) {
  for (const puddle of game.puddles) {
    const alpha = Math.max(0, puddle.life / puddle.maxLife);
    const radius = puddle.radius * cell;
    const gradient = ctx.createRadialGradient(
      puddle.x * cell,
      puddle.y * cell,
      radius * 0.15,
      puddle.x * cell,
      puddle.y * cell,
      radius,
    );
    gradient.addColorStop(0, `rgba(198, 255, 90, ${0.55 * alpha})`);
    gradient.addColorStop(0.7, `rgba(40, 170, 60, ${0.38 * alpha})`);
    gradient.addColorStop(1, `rgba(12, 90, 30, ${0.05 * alpha})`);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(puddle.x * cell, puddle.y * cell, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawStone(stone, cell) {
  const gap = Math.max(1, cell * 0.1);
  const size = cell - gap;
  if (stone.dart) drawDartTrail(stone, cell, gap, size);
  for (const block of stone.cells) {
    const x = (stone.x + block.dx) * cell + gap / 2;
    const y = (stone.y + block.dy) * cell + gap / 2;
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(x, y + 1, size, size);
    ctx.fillStyle = block.coin ? "#f5c542" : stone.color;
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = block.coin ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.28)";
    ctx.fillRect(x, y, size, Math.max(2, size * 0.14));
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(x, y + size * 0.72, size, size * 0.28);
    if (block.coin) drawCoinGlyph(x, y, size);
    const damage = block.maxHp > 0 ? 1 - block.hp / block.maxHp : 0;
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

function drawDartTrail(stone, cell, gap, size) {
  const length = Math.min(2.6, stone.vy * 0.18);
  for (let step = 3; step >= 1; step -= 1) {
    ctx.globalAlpha = 0.07 * (4 - step);
    const shift = (length * step) / 3;
    ctx.fillStyle = step === 1 ? "#ffb020" : "#ff2d2d";
    for (const block of stone.cells) {
      const x = (stone.x + block.dx) * cell + gap / 2;
      const y = (stone.y + block.dy - shift) * cell + gap / 2;
      ctx.fillRect(x, y, size, size * 0.85);
    }
  }
  ctx.globalAlpha = 1;
}

function drawCoinGlyph(x, y, size) {
  const centerX = x + size * 0.5;
  const centerY = y + size * 0.48;
  const radius = size * 0.26;
  ctx.beginPath();
  ctx.fillStyle = "#fff6c8";
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = Math.max(1, size * 0.07);
  ctx.strokeStyle = "#a56b00";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius * 0.52, 0, Math.PI * 2);
  ctx.stroke();
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
    const maxLife = floater.maxLife || 0.55;
    ctx.globalAlpha = Math.max(0, floater.life / maxLife);
    ctx.font = `800 ${Math.max(12, cell * (floater.coin ? 0.62 : 0.7))}px system-ui, sans-serif`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(8, 10, 18, 0.75)";
    ctx.fillStyle = floater.coin ? "#ffe08a" : "#fff4cc";
    ctx.strokeText(floater.text, floater.x * cell, floater.y * cell);
    ctx.fillText(floater.text, floater.x * cell, floater.y * cell);
  }
  ctx.globalAlpha = 1;
}

function drawShockwaves(cell) {
  for (const wave of game.shockwaves) {
    const progress = 1 - wave.life / wave.maxLife;
    ctx.beginPath();
    ctx.strokeStyle = `rgba(255, 186, 70, ${1 - progress})`;
    ctx.lineWidth = Math.max(2, cell * 0.14 * (1 - progress));
    ctx.arc(wave.x * cell, wave.y * cell, (0.35 + progress) * wave.radius * cell, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawRings(cell) {
  ctx.lineWidth = Math.max(2, cell * 0.08);
  for (const pointer of pointers.values()) {
    if (pointer.placed) continue;
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

function readNumber(key) {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch {
    return 0;
  }
}

function writeNumber(key, value) {
  try {
    localStorage.setItem(key, String(Math.max(0, Math.floor(value))));
  } catch {
    // Приватный режим может запретить localStorage — значения останутся в памяти вкладки.
  }
}

function saveStock() {
  writeNumber(STORAGE.coins, coins);
  writeNumber(STORAGE.bombs, bombs);
  writeNumber(STORAGE.acid, acid);
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
    else if (kind === "break" || kind === "acid") feedback.impactOccurred("medium");
    else if (kind === "bomb") feedback.impactOccurred("heavy");
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
  document.addEventListener("touchmove", (event) => {
    if (event.target.closest && event.target.closest(".overlay")) return;
    block(event);
  }, { passive: false });
  document.addEventListener("gesturestart", block, { passive: false });
  document.addEventListener("gesturechange", block, { passive: false });
  window.addEventListener("wheel", (event) => {
    if (event.ctrlKey) event.preventDefault();
  }, { passive: false });
}
