import { generateSudoku6x6, Sudoku6x6Puzzle } from './solvers/sudoku6x6';
import { generateSudoku9x9, Sudoku9x9Puzzle } from './solvers/sudoku9x9';
import { generateLatinSquare, LatinSquarePuzzle } from './solvers/latinSquare';

export type WorkerRequest =
  | { requestId: number; type: 'sudoku6x6'; seed: number; level: number }
  | { requestId: number; type: 'sudoku9x9'; seed: number; level: number }
  | { requestId: number; type: 'latinSquare'; seed: number; level: number };

export type WorkerResponse =
  | { requestId: number; type: 'sudoku6x6'; payload: Sudoku6x6Puzzle }
  | { requestId: number; type: 'sudoku9x9'; payload: Sudoku9x9Puzzle }
  | { requestId: number; type: 'latinSquare'; payload: LatinSquarePuzzle };

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  if (req.type === 'sudoku6x6') {
    const res: WorkerResponse = {
      requestId: req.requestId,
      type: 'sudoku6x6',
      payload: generateSudoku6x6(req.seed, req.level),
    };
    self.postMessage(res);
  } else if (req.type === 'sudoku9x9') {
    const res: WorkerResponse = {
      requestId: req.requestId,
      type: 'sudoku9x9',
      payload: generateSudoku9x9(req.seed, req.level),
    };
    self.postMessage(res);
  } else if (req.type === 'latinSquare') {
    const res: WorkerResponse = {
      requestId: req.requestId,
      type: 'latinSquare',
      payload: generateLatinSquare(req.seed, req.level),
    };
    self.postMessage(res);
  }
};
