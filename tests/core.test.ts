import { describe, expect, it } from 'vitest';
import { SeededRng } from '../src/worker/prng';
import { countSolutions6x6, generateSudoku6x6 } from '../src/worker/solvers/sudoku6x6';
import { countSolutions9x9, generateSudoku9x9 } from '../src/worker/solvers/sudoku9x9';
import { countSolutionsLatin, generateLatinSquare } from '../src/worker/solvers/latinSquare';
import { StaircaseController } from '../src/engine/dda/staircase';
import { FuzzyDdaController } from '../src/engine/dda/fuzzyLogic';
import { computeSessionMetrics } from '../src/telemetry/asiCalculator';
import { buildShareUrl, parseUrlSeed } from '../src/storage/urlSeed';
import { evalLogicCircuit } from '../src/games/senior/logicGate';
import { expandCommands } from '../src/games/middle/blockMaze';

describe('SeededRng', () => {
  it('produces identical deterministic sequences for the same seed', () => {
    const a = new SeededRng(48291);
    const b = new SeededRng(48291);
    const seqA = Array.from({ length: 10 }, () => a.int(1, 100));
    const seqB = Array.from({ length: 10 }, () => b.int(1, 100));
    expect(seqA).toEqual(seqB);
  });
});

describe('PCG Unique Solution Verifiers', () => {
  it('6x6 Sudoku generates deterministic puzzle with unique solution (solutions === 1)', () => {
    const p1 = generateSudoku6x6(48291, 2);
    const p2 = generateSudoku6x6(48291, 2);
    expect(p1.puzzle).toEqual(p2.puzzle);
    expect(p1.solution).toEqual(p2.solution);
    expect(countSolutions6x6(p1.puzzle, 2)).toBe(1);
  });

  it('9x9 Sudoku generates deterministic puzzle with unique solution (solutions === 1)', () => {
    const p1 = generateSudoku9x9(77123, 1);
    const p2 = generateSudoku9x9(77123, 1);
    expect(p1.puzzle).toEqual(p2.puzzle);
    expect(countSolutions9x9(p1.puzzle, 2)).toBe(1);
  });

  it('Latin Square (3x3 and 4x4) generates deterministic puzzle with unique solution', () => {
    const l3 = generateLatinSquare(1024, 1);
    expect(l3.size).toBe(3);
    expect(countSolutionsLatin(l3.puzzle, 3, 2)).toBe(1);

    const l4 = generateLatinSquare(2048, 2);
    expect(l4.size).toBe(4);
    expect(countSolutionsLatin(l4.puzzle, 4, 2)).toBe(1);
  });
});

describe('DDA Controllers', () => {
  it('applies 2-up 1-down staircase transitions within bounds', () => {
    const sc = new StaircaseController({ initialLevel: 1, minLevel: 1, maxLevel: 3 });
    expect(sc.record(true)).toBe(1);
    expect(sc.record(true)).toBe(2);
    expect(sc.record(false)).toBe(1);
    expect(sc.record(false)).toBe(1);
  });

  it('fuzzy DDA eases on high false-alarm/low hit and challenges on high hit/low false-alarm', () => {
    const fuzzy = new FuzzyDdaController();
    expect(fuzzy.evaluateAdjustment({ hitRate: 0.96, falseAlarmRate: 0.02 })).toBeGreaterThan(0.3);
    expect(fuzzy.evaluateAdjustment({ hitRate: 0.5, falseAlarmRate: 0.35 })).toBeLessThan(-0.3);
  });
});

describe('Logic Gate & Block Maze Pure Logic', () => {
  it('evaluates boolean AND/OR/NOT circuit accurately', () => {
    expect(evalLogicCircuit(1, 0, 1, { gate1: 'AND', gate2: 'AND', invertB: true })).toBe(1);
    expect(evalLogicCircuit(1, 1, 1, { gate1: 'AND', gate2: 'AND', invertB: true })).toBe(0);
    expect(evalLogicCircuit(0, 0, 1, { gate1: 'AND', gate2: 'OR', invertB: false })).toBe(1);
  });

  it('expands REPEAT2 block commands accurately', () => {
    expect(expandCommands(['FWD', 'REPEAT2', 'LEFT', 'FWD'])).toEqual(['FWD', 'FWD', 'LEFT', 'FWD']);
  });
});

describe('ASI Telemetry Calculator', () => {
  it('computes CV_RT, fatigue delta, and ASI (0-100)', () => {
    const metrics = computeSessionMetrics([
      { isTarget: true, correct: true, rtMs: 500, errorType: 'none' },
      { isTarget: true, correct: true, rtMs: 520, errorType: 'none' },
      { isTarget: false, correct: true, rtMs: null, errorType: 'none' },
      { isTarget: true, correct: true, rtMs: 480, errorType: 'none' },
    ]);
    expect(metrics.accuracy).toBe(1);
    expect(metrics.meanRtMs).toBe(500);
    expect(metrics.cvRt).toBeLessThan(0.05);
    expect(metrics.asi).toBeGreaterThan(90);
    expect(metrics.asi).toBeLessThanOrEqual(100);
  });
});

describe('URL Seed Sharing', () => {
  it('roundtrips game, seed, and level query parameters for all game IDs', () => {
    const url = buildShareUrl('https://example.github.io/kid-logic-lab/', 'logicGate', 48291, 2);
    const parsed = parseUrlSeed(new URL(url).search);
    expect(parsed).toEqual({ game: 'logicGate', seed: 48291, lvl: 2 });
  });
});
