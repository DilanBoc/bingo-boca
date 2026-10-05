export const LETTERS = ['B', 'I', 'N', 'G', 'O'];
export const letterFor = (n) => LETTERS[Math.floor((n - 1) / 15)];

const all = Array.from({ length: 25 }, (_, i) => i);
const col = (c) => [0, 1, 2, 3, 4].map((r) => r * 5 + c);
const row = (r) => [0, 1, 2, 3, 4].map((c) => r * 5 + c);
const uniq = (a) => [...new Set(a)];

// Cada patrón es una lista de "formas" válidas; basta completar una.
export const PATTERNS = {
  fila: { label: 'Una fila', sets: [0, 1, 2, 3, 4].map(row) },
  esquinas: { label: 'Cuatro esquinas', sets: [[0, 4, 20, 24]] },
  h: { label: 'Letra H', sets: [uniq([...col(0), ...col(4), ...row(2)])] },
  c: { label: 'Letra C', sets: [uniq([...col(0), ...row(0), ...row(4)])] },
  x: { label: 'Letra X', sets: [uniq([0, 6, 12, 18, 24, 4, 8, 16, 20])] },
  z: { label: 'Letra Z', sets: [uniq([...row(0), 8, 12, 16, ...row(4)])] },
  t: { label: 'Letra T', sets: [uniq([...row(0), ...col(2)])] },
  o: { label: 'Letra O', sets: [uniq([...row(0), ...row(4), ...col(0), ...col(4)])] },
  y: { label: 'Letra Y', sets: [uniq([0, 6, 12, 4, 8, 17, 22])] },
  lleno: { label: 'Cartón lleno', sets: [all] },
};

export const previewCells = (key) => new Set(PATTERNS[key].sets[0]);

// Cartón clásico 75 bolas: B 1-15, I 16-30, N 31-45, G 46-60, O 61-75, centro libre (0)
export function generateGrid() {
  const grid = new Array(25);
  for (let c = 0; c < 5; c++) {
    const pool = Array.from({ length: 15 }, (_, i) => c * 15 + i + 1);
    const picks = [];
    for (let r = 0; r < 5; r++) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    picks.sort((a, b) => a - b).forEach((v, r) => (grid[r * 5 + c] = v));
  }
  grid[12] = 0;
  return grid;
}

// La validación usa los números cantados, no lo que marcó la persona.
export function isWinner(grid, drawn, pattern) {
  const set = drawn instanceof Set ? drawn : new Set(drawn);
  const p = PATTERNS[pattern] || PATTERNS.lleno;
  return p.sets.some((cells) => cells.every((i) => grid[i] === 0 || set.has(grid[i])));
}

export function makeRoomCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 5 }, () => abc[Math.floor(Math.random() * abc.length)]).join('');
}

// Premios: etapa 1 usa `pattern`; si hay `pattern2`, la etapa 2 lo usa.
export const hasSecondPrize = (room) => !!room?.pattern2 && PATTERNS[room.pattern2];
export const activePattern = (room) => (room?.stage === 2 && hasSecondPrize(room) ? room.pattern2 : room?.pattern);
export const stageLabel = (room, stage) => {
  if (!hasSecondPrize(room)) return 'Bingo';
  return stage === 1 ? 'Primer premio' : 'Segundo premio';
};

// Revisa ganadores de forma encadenada: si alguien gana la etapa 1 y ya
// completó también la 2 con las mismas balotas, la etapa 2 se resuelve de una.
// Con one_prize_each, quien ganó el primer premio no puede ganar el segundo,
// salvo que no quede nadie más que pueda ganarlo (fallbackToAll).
export function resolveStages(room, drawn, cards, { fallbackToAll = true } = {}) {
  let stage = room.stage || 1;
  const winners = [...(room.winners || [])];
  let finished = false;
  while (!finished) {
    const pattern = stage === 2 ? room.pattern2 : room.pattern;
    let pool = cards;
    if (stage === 2 && room.one_prize_each) {
      const won = new Set(winners.filter((w) => (w.stage || 1) === 1).map((w) => w.playerId));
      pool = cards.filter((c) => !won.has(c.info.playerId));
      if (!pool.length && fallbackToAll) pool = cards;
    }
    let found = pool.filter((c) => isWinner(c.grid, drawn, pattern))
      .map((c) => ({ ...c.info, stage, pattern }));
    if (found.length > 1 && room.tiebreak === 'balota') found = breakTie(found);
    if (!found.length) break;
    winners.push(...found);
    if (stage === 1 && hasSecondPrize(room)) stage = 2;
    else finished = true;
  }
  return { stage, winners, finished };
}

// Desempate "balota más alta": cada cartón empatado recibe una balota distinta; gana la mayor.
export function breakTie(found) {
  const pool = Array.from({ length: 75 }, (_, i) => i + 1);
  const rnd = (n) => {
    const a = new Uint32Array(1);
    globalThis.crypto.getRandomValues(a);
    return a[0] % n;
  };
  const draws = found.map((w) => ({ ...w, ball: pool.splice(rnd(pool.length), 1)[0] }))
    .sort((a, b) => b.ball - a.ball);
  const tiebreak = draws.map(({ name, numero, ball }) => ({ name, numero, ball }));
  const { ball, ...winner } = draws[0];
  return [{ ...winner, tiebreak }];
}

// Cuántas casillas le faltan a un cartón para el patrón (la mejor de sus formas)
export function missingFor(grid, drawnSet, pattern) {
  const p = PATTERNS[pattern] || PATTERNS.lleno;
  return Math.min(...p.sets.map((cells) => cells.filter((i) => grid[i] !== 0 && !drawnSet.has(grid[i])).length));
}

export const TIEBREAKS = {
  compartir: 'Todos los empatados ganan',
  balota: 'Desempate: balota más alta',
};
