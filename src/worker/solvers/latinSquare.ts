import { SeededRng } from '../prng';

export interface LatinSquarePuzzle {
  size: number;       // 3 or 4
  puzzle: number[];   // size*size, 0 = empty, 1..size = token index + 1
  solution: number[]; // size*size, 1..size
  seed: number;
  level: number;
}

function getLatinCandidates(board: number[], size: number, idx: number): number[] {
  const row = Math.floor(idx / size);
  const col = idx % size;
  const used = new Set<number>();
  for (let i = 0; i < size; i++) {
    used.add(board[row * size + i]);
    used.add(board[i * size + col]);
  }
  const cands: number[] = [];
  for (let n = 1; n <= size; n++) {
    if (!used.has(n)) cands.push(n);
  }
  return cands;
}

function findMrvLatin(board: number[], size: number): { idx: number; candidates: number[] } | null {
  let bestIdx = -1;
  let bestCands: number[] = [];
  for (let i = 0; i < size * size; i++) {
    if (board[i] !== 0) continue;
    const cands = getLatinCandidates(board, size, i);
    if (cands.length === 0) return { idx: i, candidates: [] };
    if (bestIdx === -1 || cands.length < bestCands.length) {
      bestIdx = i;
      bestCands = cands;
      if (bestCands.length === 1) break;
    }
  }
  return bestIdx === -1 ? null : { idx: bestIdx, candidates: bestCands };
}

export function countSolutionsLatin(board: number[], size: number, limit = 2): number {
  const copy = [...board];
  let count = 0;

  function backtrack(): void {
    if (count >= limit) return;
    const next = findMrvLatin(copy, size);
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

export function generateLatinSquare(seed: number, level = 1): LatinSquarePuzzle {
  const rng = new SeededRng(seed);
  const size = level >= 2 ? 4 : 3;
  const solution = new Array<number>(size * size).fill(0);

  function fill(): boolean {
    const next = findMrvLatin(solution, size);
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
  const targetBlanks = size === 3 ? 4 + Math.min(2, level - 1) : 7 + Math.min(3, level - 2);
  const indices = rng.shuffle(Array.from({ length: size * size }, (_, i) => i));

  let blanks = 0;
  for (const idx of indices) {
    if (blanks >= targetBlanks) break;
    const backup = puzzle[idx];
    puzzle[idx] = 0;
    if (countSolutionsLatin(puzzle, size, 2) !== 1) {
      puzzle[idx] = backup;
    } else {
      blanks += 1;
    }
  }

  return { size, puzzle, solution, seed, level };
}
