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
