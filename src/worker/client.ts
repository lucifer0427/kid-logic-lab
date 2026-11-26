import { generateSudoku6x6, Sudoku6x6Puzzle } from './solvers/sudoku6x6';
import { generateSudoku9x9, Sudoku9x9Puzzle } from './solvers/sudoku9x9';
import { generateLatinSquare, LatinSquarePuzzle } from './solvers/latinSquare';
import type { WorkerRequest, WorkerResponse } from './puzzleWorker';

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, (payload: unknown) => void>();

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (!worker) {
    worker = new Worker(new URL('./puzzleWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const cb = pending.get(ev.data.requestId);
      if (cb) {
        pending.delete(ev.data.requestId);
        cb(ev.data.payload);
      }
    };
  }
  return worker;
}

export function requestSudoku6x6(seed: number, level: number): Promise<Sudoku6x6Puzzle> {
  const w = getWorker();
  if (!w) return Promise.resolve(generateSudoku6x6(seed, level));
  return new Promise((resolve) => {
    const requestId = ++seq;
    pending.set(requestId, (p) => resolve(p as Sudoku6x6Puzzle));
    const req: WorkerRequest = { requestId, type: 'sudoku6x6', seed, level };
    w.postMessage(req);
  });
}

export function requestSudoku9x9(seed: number, level: number): Promise<Sudoku9x9Puzzle> {
  const w = getWorker();
  if (!w) return Promise.resolve(generateSudoku9x9(seed, level));
  return new Promise((resolve) => {
    const requestId = ++seq;
    pending.set(requestId, (p) => resolve(p as Sudoku9x9Puzzle));
    const req: WorkerRequest = { requestId, type: 'sudoku9x9', seed, level };
    w.postMessage(req);
  });
}

export function requestLatinSquare(seed: number, level: number): Promise<LatinSquarePuzzle> {
  const w = getWorker();
  if (!w) return Promise.resolve(generateLatinSquare(seed, level));
  return new Promise((resolve) => {
    const requestId = ++seq;
    pending.set(requestId, (p) => resolve(p as LatinSquarePuzzle));
    const req: WorkerRequest = { requestId, type: 'latinSquare', seed, level };
    w.postMessage(req);
  });
}
