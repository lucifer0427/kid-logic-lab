import { SeededRng } from '../prng';

export interface Sudoku9x9Puzzle {
  puzzle: number[];   // 81 cells, 0 = empty
  solution: number[]; // 81 cells, 1..9
  seed: number;
  level: number;
}

const SIZE = 9;
const BOX = 3;

function getCandidates(board: number[], idx: number): number[] {
  const row = Math.floor(idx / SIZE);
  const col = idx % SIZE;
  const br = Math.floor(row / BOX) * BOX;
  const bc = Math.floor(col / BOX) * BOX;

  const used = new Set<number>();
  for (let i = 0; i < SIZE; i++) {
    used.add(board[row * SIZE + i]);
    used.add(board[i * SIZE + col]);
  }
  for (let r = 0; r < BOX; r++) {
    for (let c = 0; c < BOX; c++) {
      used.add(board[(br + r) * SIZE + (bc + c)]);
    }
  }

  const cands: number[] = [];
  for (let n = 1; n <= SIZE; n++) {
    if (!used.has(n)) cands.push(n);
  }
  return cands;
}

function findMrvCell(board: number[]): { idx: number; candidates: number[] } | null {
  let bestIdx = -1;
  let bestCands: number[] = [];
  for (let i = 0; i < SIZE * SIZE; i++) {
    if (board[i] !== 0) continue;
    const cands = getCandidates(board, i);
    if (cands.length === 0) return { idx: i, candidates: [] };
    if (bestIdx === -1 || cands.length < bestCands.length) {
      bestIdx = i;
      bestCands = cands;
      if (bestCands.length === 1) break;
    }
  }
  return bestIdx === -1 ? null : { idx: bestIdx, candidates: bestCands };
}

export function countSolutions9x9(board: number[], limit = 2): number {
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

export function generateSudoku9x9(seed: number, level = 1): Sudoku9x9Puzzle {
  const rng = new SeededRng(seed);
  const solution = new Array<number>(SIZE * SIZE).fill(0);

  function fill(): boolean {
    const next = findMrvCell(solution);
    if (!next) return true;
    if (next.candidates.length === 0) return false;
    for (const val of rng.shuffle([...next.candidates])) {
      solution[next.idx] = val;
      if (fill()) return true;
      solution[next.idx] = 0;
    }
    return false;
  }
  fill();

  const puzzle = [...solution];
  // Level 1: ~36 blanks, Level 2: ~42 blanks, Level 3: ~48 blanks
  const targetBlanks = Math.min(50, Math.max(34, 30 + level * 6));
  const indices = rng.shuffle(Array.from({ length: SIZE * SIZE }, (_, i) => i));

  let blanks = 0;
  for (const idx of indices) {
    if (blanks >= targetBlanks) break;
    const backup = puzzle[idx];
    puzzle[idx] = 0;
    if (countSolutions9x9(puzzle, 2) !== 1) {
      puzzle[idx] = backup;
    } else {
      blanks += 1;
    }
  }

  return { puzzle, solution, seed, level };
}
