import { SeededRng } from '../prng';

/**
 * 6x6 Sudoku (2x3 sub-boxes) generator & MRV backtracking solver
 * with mathematical unique-solution verification (solutions === 1).
 */
export interface Sudoku6x6Puzzle {
  puzzle: number[];   // 36 cells, 0 = empty
  solution: number[]; // 36 cells, 1..6
  seed: number;
  level: number;
}

const SIZE = 6;
const BOX_R = 2;
const BOX_C = 3;

function getCandidates(board: number[], idx: number): number[] {
  const row = Math.floor(idx / SIZE);
  const col = idx % SIZE;
  const boxRowStart = Math.floor(row / BOX_R) * BOX_R;
  const boxColStart = Math.floor(col / BOX_C) * BOX_C;

  const used = new Set<number>();
  for (let i = 0; i < SIZE; i++) {
    used.add(board[row * SIZE + i]);
    used.add(board[i * SIZE + col]);
  }
  for (let r = 0; r < BOX_R; r++) {
    for (let c = 0; c < BOX_C; c++) {
      used.add(board[(boxRowStart + r) * SIZE + (boxColStart + c)]);
    }
  }

  const candidates: number[] = [];
  for (let n = 1; n <= SIZE; n++) {
    if (!used.has(n)) candidates.push(n);
  }
  return candidates;
}

/** Find empty cell with Minimum Remaining Values (MRV) */
function findMrvCell(board: number[]): { idx: number; candidates: number[] } | null {
  let bestIdx = -1;
  let bestCandidates: number[] = [];

  for (let i = 0; i < SIZE * SIZE; i++) {
    if (board[i] !== 0) continue;
    const cands = getCandidates(board, i);
    if (cands.length === 0) return { idx: i, candidates: [] };
    if (bestIdx === -1 || cands.length < bestCandidates.length) {
      bestIdx = i;
      bestCandidates = cands;
      if (bestCandidates.length === 1) break;
    }
  }

  return bestIdx === -1 ? null : { idx: bestIdx, candidates: bestCandidates };
}

/** Count solutions up to `limit` (default 2) to verify uniqueness */
export function countSolutions6x6(board: number[], limit = 2): number {
  const copy = [...board];
  let count = 0;

  function backtrack(): void {
    if (count >= limit) return;
    const next = findMrvCell(copy);
    if (!next) {
      count += 1;
      return;
    }
    if (next.candidates.length === 0) return;

    for (const val of next.candidates) {
      copy[next.idx] = val;
      backtrack();
      copy[next.idx] = 0;
      if (count >= limit) return;
    }
  }

  backtrack();
  return count;
}

function generateSolvedBoard(rng: SeededRng): number[] {
  const board = new Array<number>(SIZE * SIZE).fill(0);

  function fill(): boolean {
    const next = findMrvCell(board);
    if (!next) return true;
    if (next.candidates.length === 0) return false;

    const shuffled = rng.shuffle([...next.candidates]);
    for (const val of shuffled) {
      board[next.idx] = val;
      if (fill()) return true;
      board[next.idx] = 0;
    }
    return false;
  }

  fill();
  return board;
}

export function generateSudoku6x6(seed: number, level = 1): Sudoku6x6Puzzle {
  const rng = new SeededRng(seed);
  const solution = generateSolvedBoard(rng);
  const puzzle = [...solution];

  // Level 1: ~14 blanks, Level 2: ~18 blanks, Level 3: ~22 blanks
  const targetBlanks = Math.min(23, Math.max(12, 10 + level * 4));
  const indices = rng.shuffle(Array.from({ length: SIZE * SIZE }, (_, i) => i));

  let blanks = 0;
  for (const idx of indices) {
    if (blanks >= targetBlanks) break;
    const backup = puzzle[idx];
    puzzle[idx] = 0;

    if (countSolutions6x6(puzzle, 2) !== 1) {
      puzzle[idx] = backup;
    } else {
      blanks += 1;
    }
  }

  return { puzzle, solution, seed, level };
}
