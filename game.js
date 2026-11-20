// Логика «Камнепада»: сетка, камни, волны, удары по площади. Без DOM.

export const COLS = 16;
export const ROWS = 26;
export const HIT_RADIUS = 1.9;
export const DANGER_LINE = ROWS - 1.35;
export const CELL_SCORE = 2;
export const PIECE_SCORE = 5;

const COLORS = [
  "#3ec6ff",
  "#ffb020",
  "#7c5cff",
  "#3ddc97",
  "#ff7ad9",
  "#e7eef8",
  "#ff8a3d",
  "#6aa2ff",
  "#c6f25c",
  "#f2c14e",
];

const BASE_SHAPES = [
  [[0, 0], [1, 0]],
  [[0, 0], [1, 0], [2, 0]],
  [[0, 0], [1, 0], [0, 1]],
  [[0, 0], [1, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [2, 0], [2, 1]],
  [[0, 1], [1, 1], [2, 1], [1, 0]],
  [[0, 0], [1, 0], [1, 1], [2, 1]],
  [[1, 0], [2, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [2, 0], [3, 0]],
  [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]],
  [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]],
  [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]],
  [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2], [1, 2], [2, 2]],
  [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1]],
  [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]],
  [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2]],
  [[0, 0], [1, 0], [2, 0], [3, 0], [1, 1], [2, 1]],
];

function normalizeShape(cells) {
  const minX = Math.min(...cells.map((cell) => cell[0]));
  const minY = Math.min(...cells.map((cell) => cell[1]));
  const unique = new Map();
  for (const [x, y] of cells) {
    unique.set(`${x - minX},${y - minY}`, [x - minX, y - minY]);
  }
  return [...unique.values()].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

function rotationsAndMirrors(shape) {
  const variants = [];
  let current = shape.map((cell) => [cell[0], cell[1]]);
  for (let turn = 0; turn < 4; turn += 1) {
    variants.push(normalizeShape(current));
    variants.push(normalizeShape(current.map(([x, y]) => [-x, y])));
    current = current.map(([x, y]) => [y, -x]);
  }
  return variants;
}

function buildShapePool() {
  const seen = new Set();
  const pool = [];
  for (const shape of BASE_SHAPES) {
    for (const variant of rotationsAndMirrors(shape)) {
      const width = Math.max(...variant.map((cell) => cell[0])) + 1;
      const height = Math.max(...variant.map((cell) => cell[1])) + 1;
      if (width > COLS || height > 8) continue;
      const key = variant.map(([x, y]) => `${x},${y}`).join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      pool.push(variant);
    }
  }
  return pool;
}

const SHAPE_POOL = buildShapePool();

export function waveConfig(level) {
  const n = Math.max(1, Math.floor(level) || 1);
  return {
    level: n,
    count: 3 + n,
    minSize: 2,
    maxSize: Math.min(10, 3 + Math.floor((n - 1) / 2)),
    hp: 1 + Math.floor((n - 1) / 2),
    speed: 1.35 + (n - 1) * 0.22,
    interval: Math.max(0.45, 1.75 - (n - 1) * 0.1),
  };
}

export function connectedGroups(cells) {
  const byKey = new Map(cells.map((cell) => [`${cell.dx},${cell.dy}`, cell]));
  const seen = new Set();
  const groups = [];
  for (const start of cells) {
    const startKey = `${start.dx},${start.dy}`;
    if (seen.has(startKey)) continue;
    const group = [];
    const queue = [start];
    seen.add(startKey);
    while (queue.length) {
      const current = queue.pop();
      group.push(current);
      const neighbors = [
        [current.dx + 1, current.dy],
        [current.dx - 1, current.dy],
        [current.dx, current.dy + 1],
        [current.dx, current.dy - 1],
      ];
      for (const [dx, dy] of neighbors) {
        const key = `${dx},${dy}`;
        if (seen.has(key) || !byKey.has(key)) continue;
        seen.add(key);
        queue.push(byKey.get(key));
      }
    }
    groups.push(group);
  }
  return groups;
}

export function splitStone(stone, survivingCells, nextId) {
  if (survivingCells.length === 0) return [];
  const groups = connectedGroups(survivingCells);
  return groups.map((group) => {
    let minX = Infinity;
    let minY = Infinity;
    for (const cell of group) {
      if (cell.dx < minX) minX = cell.dx;
      if (cell.dy < minY) minY = cell.dy;
    }
    return {
      id: groups.length === 1 ? stone.id : nextId(),
      x: stone.x + minX,
      y: stone.y + minY,
      vy: stone.vy,
      color: stone.color,
      cells: group.map((cell) => ({
        dx: cell.dx - minX,
        dy: cell.dy - minY,
        hp: cell.hp,
        maxHp: cell.maxHp,
      })),
    };
  });
}

export function overlapAmount(a, b) {
  let maxOverlap = 0;
  for (const cellA of a.cells) {
    const columnA = a.x + cellA.dx;
    const topA = a.y + cellA.dy;
    for (const cellB of b.cells) {
      if (columnA !== b.x + cellB.dx) continue;
      const overlap = 1 - Math.abs(topA - (b.y + cellB.dy));
      if (overlap > maxOverlap) maxOverlap = overlap;
    }
  }
  return maxOverlap;
}

export function reachesDanger(stone) {
  for (const cell of stone.cells) {
    if (stone.y + cell.dy + 1 >= DANGER_LINE) return true;
  }
  return false;
}

function separatePair(a, b) {
  let best = 0;
  let pushA = false;
  let found = false;
  for (const cellA of a.cells) {
    const columnA = a.x + cellA.dx;
    const topA = a.y + cellA.dy;
    for (const cellB of b.cells) {
      if (columnA !== b.x + cellB.dx) continue;
      const topB = b.y + cellB.dy;
      const overlap = 1 - Math.abs(topA - topB);
      if (overlap <= 0.0005) continue;
      if (overlap > best) {
        best = overlap;
        pushA = topA < topB;
        found = true;
      }
    }
  }
  if (!found) return false;
  if (pushA) a.y -= best;
  else b.y -= best;
  return true;
}

export class Game {
  constructor(options = {}) {
    this.rng = options.rng ?? Math.random;
    this.phase = "menu";
    this.score = 0;
    this.wave = 1;
    this.time = 0;
    this.stones = [];
    this.particles = [];
    this.floaters = [];
    this.shake = 0;
    this.bannerText = "";
    this.bannerUntil = 0;
    this.cfg = waveConfig(1);
    this.spawned = 0;
    this.spawnTimer = 0;
    this.gap = 0;
    this.nextId = 1;
  }

  start() {
    this.phase = "playing";
    this.score = 0;
    this.time = 0;
    this.stones = [];
    this.particles = [];
    this.floaters = [];
    this.shake = 0;
    this.nextId = 1;
    this.beginWave(1);
  }

  beginWave(level) {
    this.wave = level;
    this.cfg = waveConfig(level);
    this.spawned = 0;
    this.spawnTimer = 0.4;
    this.gap = 0;
    this.bannerText = `Волна ${level}`;
    this.bannerUntil = this.time + 1.75;
  }

  update(dt) {
    const step = Math.max(0, Math.min(0.05, dt));
    if (step === 0) return;
    this.time += step;
    this.updateEffects(step);
    if (this.phase !== "playing") return;

    if (this.spawned < this.cfg.count) {
      this.spawnTimer -= step;
      if (this.spawnTimer <= 0) {
        this.spawnStone();
        this.spawned += 1;
        this.spawnTimer = this.cfg.interval * (0.85 + this.rng() * 0.3);
      }
    } else if (this.stones.length === 0) {
      this.gap += step;
      if (this.gap >= 0.6) this.beginWave(this.wave + 1);
    } else {
      this.gap = 0;
    }

    for (const stone of this.stones) stone.y += stone.vy * step;
    this.resolveCollisions();
    if (this.stones.some((stone) => reachesDanger(stone))) this.phase = "over";
  }

  updateEffects(dt) {
    this.shake = Math.max(0, this.shake - dt * 2.4);
    for (const particle of this.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 11 * dt;
      particle.life -= dt;
    }
    if (this.particles.length) {
      this.particles = this.particles.filter((particle) => particle.life > 0);
    }
    for (const floater of this.floaters) {
      floater.y += floater.vy * dt;
      floater.life -= dt;
    }
    if (this.floaters.length) {
      this.floaters = this.floaters.filter((floater) => floater.life > 0);
    }
  }

  resolveCollisions() {
    const list = this.stones;
    const passes = Math.max(16, list.length + 2);
    for (let iteration = 0; iteration < passes; iteration += 1) {
      let moved = false;
      for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
          if (separatePair(list[i], list[j])) moved = true;
        }
      }
      if (!moved) break;
    }
  }

  spawnStone() {
    const shape = this.pickShape(this.cfg);
    const width = Math.max(...shape.map((cell) => cell[0])) + 1;
    const height = Math.max(...shape.map((cell) => cell[1])) + 1;
    const maxX = Math.max(0, COLS - width);
    let placed = null;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const x = maxX === 0 ? 0 : Math.floor(this.rng() * (maxX + 1));
      const y = -height - 0.25 - attempt * 0.2 - this.rng();
      const stone = this.makeStone(shape, x, y);
      const blocked = this.stones.some((other) => overlapAmount(stone, other) > 0);
      if (!blocked) {
        placed = stone;
        break;
      }
    }
    if (!placed) {
      const x = maxX === 0 ? 0 : Math.floor(this.rng() * (maxX + 1));
      placed = this.makeStone(shape, x, -height - 8 - this.rng() * 3);
    }
    this.stones.push(placed);
    return placed;
  }

  pickShape(cfg) {
    const pool = SHAPE_POOL.filter((shape) => shape.length >= cfg.minSize && shape.length <= cfg.maxSize);
    const choices = pool.length ? pool : SHAPE_POOL.filter((shape) => shape.length <= 3);
    return choices[Math.floor(this.rng() * choices.length)];
  }

  makeStone(shape, x, y) {
    const extraHp = this.cfg.level >= 4;
    return {
      id: this.nextId++,
      x,
      y,
      vy: this.cfg.speed * (0.92 + this.rng() * 0.16),
      color: COLORS[Math.floor(this.rng() * COLORS.length)],
      cells: shape.map(([dx, dy]) => {
        const hp = this.cfg.hp + (extraHp && this.rng() < 0.28 ? 1 : 0);
        return { dx, dy, hp, maxHp: hp };
      }),
    };
  }

  applyHit(px, py) {
    const result = {
      damagedCells: 0,
      destroyedCells: 0,
      destroyedPieces: 0,
      scoreGained: 0,
    };
    if (this.phase !== "playing") return result;
    const radiusSq = HIT_RADIUS * HIT_RADIUS;
    const next = [];
    for (const stone of this.stones) {
      const surviving = [];
      let touched = false;
      for (const cell of stone.cells) {
        const centerX = stone.x + cell.dx + 0.5;
        const centerY = stone.y + cell.dy + 0.5;
        const distSq = (centerX - px) ** 2 + (centerY - py) ** 2;
        if (distSq > radiusSq) {
          surviving.push(cell);
          continue;
        }
        touched = true;
        cell.hp -= 1;
        if (cell.hp <= 0) {
          result.destroyedCells += 1;
          this.score += CELL_SCORE;
          result.scoreGained += CELL_SCORE;
          this.burst(centerX, centerY, stone.color);
        } else {
          result.damagedCells += 1;
          surviving.push(cell);
        }
      }
      if (!touched) {
        next.push(stone);
        continue;
      }
      if (surviving.length === 0) {
        result.destroyedPieces += 1;
        this.score += PIECE_SCORE;
        result.scoreGained += PIECE_SCORE;
        continue;
      }
      next.push(...splitStone(stone, surviving, () => this.nextId++));
    }
    this.stones = next;
    if (result.scoreGained > 0) {
      this.floaters.push({
        x: px,
        y: py,
        text: `+${result.scoreGained}`,
        life: 0.55,
        vy: -0.9,
      });
      if (this.floaters.length > 24) this.floaters.splice(0, this.floaters.length - 24);
    }
    if (result.destroyedCells > 0) this.shake = Math.min(1, this.shake + 0.45);
    else if (result.damagedCells > 0) this.shake = Math.min(1, this.shake + 0.15);
    return result;
  }

  burst(x, y, color) {
    const count = 6;
    for (let i = 0; i < count; i += 1) {
      const angle = this.rng() * Math.PI * 2;
      const speed = 1.4 + this.rng() * 3.2;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.8,
        life: 0.28 + this.rng() * 0.22,
        maxLife: 0.5,
        color,
        size: 0.1 + this.rng() * 0.16,
      });
    }
    if (this.particles.length > 180) {
      this.particles.splice(0, this.particles.length - 180);
    }
  }
}

export function createGame(options) {
  return new Game(options);
}
