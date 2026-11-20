import {
  COLS,
  ROWS,
  DANGER_LINE,
  HIT_RADIUS,
  BOMB_COST,
  BOMB_UNLOCK_WAVE,
  ACID_COST,
  ACID_UNLOCK_WAVE,
  WALL_COST,
  WALL_UNLOCK_WAVE,
  LIGHTNING_COST,
  LIGHTNING_UNLOCK_WAVE,
  buildResultPayload,
  buildStartParam,
  createGame,
} from "./game.js";

const STORAGE = {
  best: "kamnepad-best",
  bestWave: "kamnepad-best-wave",
  coins: "kamnepad-coins",
  bombs: "kamnepad-bombs",
  acid: "kamnepad-acid",
  walls: "kamnepad-walls",
  lightning: "kamnepad-lightning",
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
const wallBtn = document.querySelector("#arm-wall");
const bombBtn = document.querySelector("#arm-bomb");
const acidBtn = document.querySelector("#arm-acid");
const lightningBtn = document.querySelector("#arm-lightning");
const wallCountEl = document.querySelector("#wall-count");
const bombCountEl = document.querySelector("#bomb-count");
const acidCountEl = document.querySelector("#acid-count");
const lightningCountEl = document.querySelector("#lightning-count");
const shopCoinsEl = document.querySelector("#shop-coins");
const saveHintEl = document.querySelector("#save-hint");
const savingEl = document.querySelector("#saving");

const SHOP_ITEMS = [
  ["wall", WALL_COST, WALL_UNLOCK_WAVE],
  ["bomb", BOMB_COST, BOMB_UNLOCK_WAVE],
  ["acid", ACID_COST, ACID_UNLOCK_WAVE],
  ["lightning", LIGHTNING_COST, LIGHTNING_UNLOCK_WAVE],
];
const HINTS = {
  wall: "Ведите пальцем, до 8 клеток",
  bomb: "Куда бросить бомбу?",
  acid: "Куда вылить кислоту?",
  lightning: "Куда ударить молнией?",
};

const game = createGame();
const pointers = new Map();
const view = { cell: 20, ox: 0, oy: 0, dpr: 1, width: 360, height: 580 };

let best = readNumber(STORAGE.best);
let bestWave = readNumber(STORAGE.bestWave);
let coins = readNumber(STORAGE.coins);
let bombs = readNumber(STORAGE.bombs);
let acid = readNumber(STORAGE.acid);
let walls = readNumber(STORAGE.walls);
let lightning = readNumber(STORAGE.lightning);
let armed = null;
let drawingPointer = null;
let shopReturn = "start";
let runRecord = false;
let overShown = false;
let saveTimer = 0;
let closeTimer = 0;
let saveStarted = false;
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
for (const [kind] of SHOP_ITEMS) {
  document.querySelector(`#buy-${kind}`).addEventListener("click", () => buy(kind));
}
wallBtn.addEventListener("pointerdown", (event) => onArmPointer(event, "wall"));
bombBtn.addEventListener("pointerdown", (event) => onArmPointer(event, "bomb"));
acidBtn.addEventListener("pointerdown", (event) => onArmPointer(event, "acid"));
lightningBtn.addEventListener("pointerdown", (event) => onArmPointer(event, "lightning"));

canvas.addEventListener("pointerdown", (event) => {
  if (game.phase !== "playing") return;
  event.preventDefault();
  try {
    canvas.setPointerCapture(event.pointerId);
  } catch {
    // У синтетического или уже отпущенного указателя нет захвата, удар всё равно засчитывается.
  }
  const point = cellFromEvent(event);
  if (armed === "wall") {
    if (drawingPointer == null) {
      drawingPointer = event.pointerId;
      game.beginWall();
    }
    if (event.pointerId === drawingPointer) {
      game.extendWall(point.x, point.y);
      pointers.set(event.pointerId, { x: point.x, y: point.y, last: Infinity, placed: true, drawing: true });
      return;
    }
  } else if (armed) {
    useArmed(point);
    pointers.set(event.pointerId, { x: point.x, y: point.y, last: Infinity, placed: true, drawing: false });
    return;
  }
  pointers.set(event.pointerId, { x: point.x, y: point.y, last: 0, placed: false, drawing: false });
  strike(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  const pointer = pointers.get(event.pointerId);
  if (!pointer || game.phase !== "playing") return;
  event.preventDefault();
  const point = cellFromEvent(event);
  pointer.x = point.x;
  pointer.y = point.y;
  if (pointer.drawing) {
    game.extendWall(point.x, point.y);
    return;
  }
  if (pointer.placed) return;
  if (performance.now() - pointer.last >= HIT_COOLDOWN_MS) strike(event.pointerId);
});

canvas.addEventListener("pointerup", (event) => finishPointer(event.pointerId));
canvas.addEventListener("pointercancel", (event) => finishPointer(event.pointerId));
canvas.addEventListener("contextmenu", (event) => event.preventDefault());

function begin() {
  clearSaveTimer();
  if (closeTimer) {
    window.clearTimeout(closeTimer);
    closeTimer = 0;
  }
  saveStarted = false;
  savingEl.classList.add("hidden");
  pointers.clear();
  drawingPointer = null;
  game.cancelWall();
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

function finishPointer(id) {
  const pointer = pointers.get(id);
  if (pointer && pointer.drawing && id === drawingPointer) {
    if (walls > 0 && game.draftWall && game.draftWall.cells.length > 0) {
      game.commitWall();
      walls -= 1;
      saveStock();
      haptic("wall");
    } else {
      game.cancelWall();
    }
    armed = null;
    drawingPointer = null;
    syncAbilityButtons();
  }
  pointers.delete(id);
}

function onArmPointer(event, kind) {
  event.preventDefault();
  event.stopPropagation();
  if (game.phase !== "playing") return;
  if (armed === kind) {
    if (kind === "wall") {
      game.cancelWall();
      drawingPointer = null;
    }
    armed = null;
    syncAbilityButtons();
    return;
  }
  if (stockOf(kind) <= 0) return;
  if (armed === "wall") {
    game.cancelWall();
    drawingPointer = null;
  }
  armed = kind;
  syncAbilityButtons();
}

function stockOf(kind) {
  if (kind === "wall") return walls;
  if (kind === "bomb") return bombs;
  if (kind === "acid") return acid;
  return lightning;
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
  } else if (armed === "lightning" && lightning > 0) {
    lightning -= 1;
    game.strikeLightning(point.x, point.y);
    haptic("lightning");
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
  drawingPointer = null;
  armed = null;
  syncAbilityButtons();
  abilityLayer.classList.add("hidden");
  overScoreEl.textContent = String(game.score);
  overWaveEl.textContent = String(game.wave);
  overBestEl.textContent = String(best);
  recordEl.classList.toggle("hidden", !runRecord);
  const inside = insideTelegram();
  saveHintEl.classList.toggle("hidden", inside);
  savingEl.classList.toggle("hidden", !inside);
  overEl.classList.remove("hidden");
  haptic(runRecord ? "record" : "over");
  if (inside) {
    clearSaveTimer();
    saveTimer = window.setTimeout(() => {
      saveTimer = 0;
      sendResult();
    }, 2000);
  }
}

function clearSaveTimer() {
  if (!saveTimer) return;
  window.clearTimeout(saveTimer);
  saveTimer = 0;
}

function telegramApp() {
  return window.Telegram && window.Telegram.WebApp;
}

function insideTelegram() {
  const telegram = telegramApp();
  return Boolean(telegram) && telegram.platform !== "unknown";
}

function sendResult() {
  const telegram = telegramApp();
  if (!insideTelegram() || saveStarted) return;
  saveStarted = true;
  clearSaveTimer();
  const stats = {
    score: game.score,
    wave: game.wave,
    coins,
    best: Math.max(best, game.score),
  };
  const initData = typeof telegram.initData === "string" ? telegram.initData : "";
  if (initData.length === 0 && typeof telegram.sendData === "function") {
    try {
      const text = buildResultPayload(stats);
      if (text.length > 4096) throw new Error("payload");
      telegram.sendData(text);
      return;
    } catch {
      // Кнопка клавиатуры не приняла sendData — уходим в deep link.
    }
  }
  const start = buildStartParam(stats);
  telegram.openTelegramLink(`https://t.me/mihmakbot?start=${start}`);
  closeTimer = window.setTimeout(() => {
    closeTimer = 0;
    try {
      telegram.close();
    } catch {
      // Закрытие мини-приложения необязательно, если клиент его не поддерживает.
    }
  }, 300);
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
  shopCoinsEl.textContent = String(coins);
  for (const [kind, cost, unlock] of SHOP_ITEMS) {
    const locked = bestWave < unlock;
    document.querySelector(`#stock-${kind}`).textContent = String(stockOf(kind));
    document.querySelector(`#lock-${kind}`).classList.toggle("hidden", !locked);
    const buyButton = document.querySelector(`#buy-${kind}`);
    buyButton.classList.toggle("hidden", locked);
    buyButton.disabled = coins < cost;
    document.querySelector(`#item-${kind}`).classList.toggle("locked", locked);
  }
}

function buy(kind) {
  const item = SHOP_ITEMS.find(([name]) => name === kind);
  if (!item) return;
  const [, cost, unlock] = item;
  if (bestWave < unlock || coins < cost) return;
  coins -= cost;
  if (kind === "wall") walls += 1;
  else if (kind === "bomb") bombs += 1;
  else if (kind === "acid") acid += 1;
  else lightning += 1;
  saveStock();
  coinsEl.textContent = String(coins);
  syncAbilityButtons();
  renderShop();
}

function syncAbilityButtons() {
  const buttons = [
    [wallBtn, wallCountEl, "wall", walls],
    [bombBtn, bombCountEl, "bomb", bombs],
    [acidBtn, acidCountEl, "acid", acid],
    [lightningBtn, lightningCountEl, "lightning", lightning],
  ];
  for (const [button, countEl, kind, stock] of buttons) {
    countEl.textContent = String(stock);
    button.disabled = stock <= 0;
    button.classList.toggle("armed", armed === kind);
    button.setAttribute("aria-pressed", armed === kind ? "true" : "false");
  }
  armHint.textContent = HINTS[armed] || "";
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
  drawWalls(cell);
  for (const stone of game.stones) drawStone(stone, cell);
  drawParticles(cell);
  drawFloaters(cell);
  drawShockwaves(cell);
  drawLightning(cell);

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

function drawWalls(cell) {
  const layers = [];
  if (game.draftWall && game.draftWall.cells.length) {
    layers.push({ cells: game.draftWall.cells, alpha: 1, draft: true });
  }
  for (const wall of game.walls) {
    layers.push({
      cells: wall.cells,
      alpha: Math.max(0, wall.life / wall.maxLife),
      draft: false,
    });
  }
  const gap = Math.max(1, cell * 0.08);
  const size = cell - gap;
  for (const layer of layers) {
    ctx.globalAlpha = layer.alpha;
    for (const block of layer.cells) {
      const x = block.x * cell + gap / 2;
      const y = block.y * cell + gap / 2;
      ctx.fillStyle = "#8b95a8";
      ctx.fillRect(x, y, size, size);
      ctx.fillStyle = "rgba(255,255,255,0.38)";
      ctx.fillRect(x, y, size, Math.max(2, size * 0.22));
      ctx.fillStyle = "rgba(40, 48, 64, 0.35)";
      ctx.fillRect(x, y + size * 0.48, size, Math.max(1, size * 0.08));
      ctx.strokeStyle = layer.draft ? "#ffe08a" : "#4e5868";
      ctx.lineWidth = layer.draft ? 2 : 1;
      ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    }
  }
  ctx.globalAlpha = 1;
}

function drawLightning(cell) {
  if (game.flash > 0) {
    ctx.fillStyle = `rgba(214, 232, 255, ${Math.min(0.62, game.flash * 1.8)})`;
    ctx.fillRect(0, 0, COLS * cell, ROWS * cell);
  }
  for (const bolt of game.bolts) {
    const alpha = Math.max(0, bolt.life / bolt.maxLife);
    const paths = [bolt.points, ...(bolt.forks || [])];
    for (const points of paths) {
      traceBolt(points, cell);
      ctx.strokeStyle = `rgba(150, 200, 255, ${0.45 * alpha})`;
      ctx.lineWidth = Math.max(3, cell * 0.34);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.lineWidth = Math.max(1.4, cell * 0.08);
      ctx.stroke();
    }
  }
}

function traceBolt(points, cell) {
  if (!points || points.length < 2) return;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(points[0].x * cell, points[0].y * cell);
  for (let index = 1; index < points.length; index += 1) {
    ctx.lineTo(points[index].x * cell, points[index].y * cell);
  }
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
  writeNumber(STORAGE.walls, walls);
  writeNumber(STORAGE.lightning, lightning);
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
    else if (kind === "bomb" || kind === "lightning") feedback.impactOccurred("heavy");
    else if (kind === "wall") feedback.impactOccurred("light");
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
