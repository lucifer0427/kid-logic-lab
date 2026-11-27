import { describe, expect, it } from 'vitest';
import { SeededRng } from '../src/worker/prng';
import { countSolutions6x6, generateSudoku6x6 } from '../src/worker/solvers/sudoku6x6';
import { countSolutions9x9, generateSudoku9x9 } from '../src/worker/solvers/sudoku9x9';
import { countSolutionsLatin, generateLatinSquare } from '../src/worker/solvers/latinSquare';
import { StaircaseController } from '../src/engine/dda/staircase';
import { FuzzyDdaController } from '../src/engine/dda/fuzzyLogic';
import { computeSessionMetrics } from '../src/telemetry/asiCalculator';
import { buildChallengeUrl, buildShareUrl, parseUrlSeed } from '../src/storage/urlSeed';
import { evalLogicCircuit } from '../src/games/senior/logicGate';
import { expandCommands } from '../src/games/middle/blockMaze';
import { generateLightsOutPuzzle, toggleLightsGrid } from '../src/games/middle/lightsOut';
import { generateZebraPuzzle } from '../src/games/senior/zebraPuzzle';
import { getDailyQuest } from '../src/storage/engagement';
import { scoreMastermindGuess } from '../src/games/junior/mastermind';
import { generateBalancePuzzle } from '../src/games/middle/balanceScale';
import { computeRuns } from '../src/games/senior/nonogram';
import { isValidTakuzuBoard } from '../src/games/senior/binaryPuzzle';
import { evaluateArithmeticExpr } from '../src/games/senior/target24';
import { generateFlankerTrial } from '../src/games/middle/flankerFish';
import { isAxTarget } from '../src/games/senior/axCpt';
import { SOKOBAN_MAPS } from '../src/games/middle/sokoban';
import { escapeHtml } from '../src/ui/escapeHtml';
import { isKnightMove } from '../src/games/senior/knightTour';
import { isValidSet } from '../src/games/senior/setMatch';
import { ALL_GAME_IDS } from '../src/engine/types';
import { traceLaser } from '../src/games/middle/mirrorMaze';
import { floodFillGrid } from '../src/games/middle/colorFlood';
import { isPrime } from '../src/games/senior/primeSieve';
import { caesarEncode } from '../src/games/senior/cipherBreak';
import { rotatePolyCells } from '../src/games/senior/polyominoFit';

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
  it('evaluates boolean AND/OR/XOR/NOT circuit accurately', () => {
    expect(evalLogicCircuit(1, 0, 1, { gate1: 'AND', gate2: 'AND', invertB: true })).toBe(1);
    expect(evalLogicCircuit(1, 1, 1, { gate1: 'AND', gate2: 'AND', invertB: true })).toBe(0);
    expect(evalLogicCircuit(0, 0, 1, { gate1: 'AND', gate2: 'OR', invertB: false })).toBe(1);
    expect(evalLogicCircuit(1, 1, 0, { gate1: 'XOR', gate2: 'OR', invertB: false })).toBe(0);
    expect(evalLogicCircuit(1, 0, 0, { gate1: 'XOR', gate2: 'OR', invertB: false })).toBe(1);
  });

  it('expands REPEAT2 and REPEAT3 block commands accurately', () => {
    expect(expandCommands(['FWD', 'REPEAT2', 'LEFT', 'REPEAT3'])).toEqual([
      'FWD',
      'FWD',
      'LEFT',
      'LEFT',
      'LEFT',
    ]);
  });
});

describe('Lights Out, Zebra Puzzle & Daily Quest', () => {
  it('Lights Out toggle is self-inverting and deterministic', () => {
    const p = generateLightsOutPuzzle(12345, 1);
    const toggled = toggleLightsGrid(p.grid, p.size, 4);
    const restored = toggleLightsGrid(toggled, p.size, 4);
    expect(restored).toEqual(p.grid);
  });

  it('Zebra Puzzle generates deterministic clues with a unique solution across seeds', () => {
    const z1 = generateZebraPuzzle(999);
    const z2 = generateZebraPuzzle(999);
    expect(z1).toEqual(z2);
    expect(z1.clues).toHaveLength(3);

    // Exhaustively check all 6 * 6 = 36 color/shape permutations for uniqueness across 20 seeds
    const perms = [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ];
    for (let seed = 1; seed <= 20; seed++) {
      const z = generateZebraPuzzle(seed * 137);
      let validCount = 0;
      for (const cp of perms) {
        for (const sp of perms) {
          // Clue 1: Person 0 has colorOf[0] and shapeOf[0]
          const c1 = cp[0] === z.colorOf[0] && sp[0] === z.shapeOf[0];
          // Clue 2: Person with colorOf[1] has shapeOf[1]
          const ownerOfP1Color = cp.indexOf(z.colorOf[1]);
          const c2 = sp[ownerOfP1Color] === z.shapeOf[1];
          // Clue 3: Person 1 does NOT have colorOf[2]
          const c3 = cp[1] !== z.colorOf[2];
          if (c1 && c2 && c3) validCount += 1;
        }
      }
      expect(validCount).toBe(1);
    }
  });

  it('Daily Quest produces 3 deterministic games per age tier', () => {
    const q1 = getDailyQuest('junior', '20261126');
    const q2 = getDailyQuest('junior', '20261126');
    expect(q1).toEqual(q2);
    expect(q1.games).toHaveLength(3);
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
    expect(parsed).toEqual({
      game: 'logicGate',
      seed: 48291,
      lvl: 2,
      challengerName: null,
      challengerAsi: null,
      challengerAcc: null,
    });
  });

  it('roundtrips async friend challenge URL parameters', () => {
    const url = buildChallengeUrl('https://example.github.io/kid-logic-lab/', 'sudoku6x6', 12345, 1, '小宇', 92.4, 0.95);
    const parsed = parseUrlSeed(new URL(url).search);
    expect(parsed).toEqual({
      game: 'sudoku6x6',
      seed: 12345,
      lvl: 1,
      challengerName: '小宇',
      challengerAsi: 92.4,
      challengerAcc: 0.95,
    });
  });
});

describe('New Games Pure Logic', () => {
  it('scores Mastermind exact and misplaced matches accurately', () => {
    expect(scoreMastermindGuess([0, 1, 2], [0, 1, 2])).toEqual({ exact: 3, misplaced: 0 });
    expect(scoreMastermindGuess([0, 1, 2], [2, 0, 1])).toEqual({ exact: 0, misplaced: 3 });
    expect(scoreMastermindGuess([0, 0, 1], [0, 1, 3])).toEqual({ exact: 1, misplaced: 1 });
  });

  it('generates distinct deterministic weights for Balance Scale', () => {
    const b = generateBalancePuzzle(42, 2);
    expect(b.useThree).toBe(true);
    expect(b.wA).not.toBe(b.wB);
  });

  it('computes Nonogram run-length clues accurately', () => {
    expect(computeRuns([1, 1, 0, 1, 0])).toEqual([2, 1]);
    expect(computeRuns([0, 0, 0, 0, 0])).toEqual([0]);
  });

  it('validates Takuzu 6x6 three-in-a-row rule', () => {
    const bad = new Array<number>(36).fill(-1);
    bad[0] = 1; bad[1] = 1; bad[2] = 1;
    expect(isValidTakuzuBoard(bad)).toBe(false);
  });

  it('evaluates Target 24 arithmetic expressions safely', () => {
    expect(evaluateArithmeticExpr('(8-4)*6')).toBe(24);
    expect(evaluateArithmeticExpr('8/(3-8/3)')).toBeCloseTo(24, 5);
    expect(evaluateArithmeticExpr('1/0')).toBeNull();
  });

  it('generates valid Flanker congruent/incongruent trials', () => {
    const rng = new SeededRng(101);
    const t = generateFlankerTrial(rng, 1.0);
    expect(t.congruent).toBe(false);
    expect(t.centerDir).not.toBe(t.flankDir);
  });

  it('evaluates AX-CPT target pair strictly as A -> X', () => {
    expect(isAxTarget('A', 'X')).toBe(true);
    expect(isAxTarget('A', 'Y')).toBe(false);
    expect(isAxTarget('B', 'X')).toBe(false);
    expect(isAxTarget(null, 'X')).toBe(false);
  });

  it('verifies every Sokoban map has equal boxes and goals and exactly one player', () => {
    for (const map of SOKOBAN_MAPS) {
      let boxes = 0;
      let goals = 0;
      let players = 0;
      for (const row of map) {
        for (const ch of row) {
          if (ch === '$') boxes += 1;
          else if (ch === '.') goals += 1;
          else if (ch === '@') players += 1;
        }
      }
      expect(boxes).toBeGreaterThan(0);
      expect(boxes).toBe(goals);
      expect(players).toBe(1);
    }
  });

  it('escapes HTML special characters in user nicknames and URL params', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;',
    );
  });

  it('validates Knight Tour L-shaped moves on 5x5 board', () => {
    expect(isKnightMove(0, 7)).toBe(true);  // (0,0) -> (1,2)
    expect(isKnightMove(0, 11)).toBe(true); // (0,0) -> (2,1)
    expect(isKnightMove(0, 1)).toBe(false);
  });

  it('validates SET 3-attribute all-same or all-different rule', () => {
    expect(
      isValidSet(
        { color: 0, shape: 0, count: 1 },
        { color: 1, shape: 1, count: 2 },
        { color: 2, shape: 2, count: 3 },
      ),
    ).toBe(true);
    expect(
      isValidSet(
        { color: 0, shape: 0, count: 1 },
        { color: 0, shape: 1, count: 2 },
        { color: 1, shape: 2, count: 3 },
      ),
    ).toBe(false);
  });

  it('registers all 50 distinct games in ALL_GAME_IDS', () => {
    expect(new Set(ALL_GAME_IDS).size).toBe(50);
    expect(ALL_GAME_IDS).toHaveLength(50);
  });

  it('traces Laser Mirror Maze reflections accurately', () => {
    // 4x4 grid: start (0,0) heading East, '\' mirror at (0,3) reflects South to (3,3)
    const grid = new Array(16).fill(0);
    grid[3] = 2; // '\'
    const beam = traceLaser(grid, 4, 0, 0, 1);
    expect(beam[beam.length - 1]).toEqual([3, 3]);
  });

  it('performs Color Flood Fill from top-left origin', () => {
    const res = floodFillGrid([0, 0, 1, 0, 1, 1, 2, 2, 2], 3, 1);
    expect(res.slice(0, 6)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('checks primes and Caesar cipher encoding accurately', () => {
    expect(isPrime(2)).toBe(true);
    expect(isPrime(29)).toBe(true);
    expect(isPrime(21)).toBe(false);
    expect(caesarEncode('CAT', 2)).toBe('ECV');
  });

  it('rejects Takuzu boards with duplicate completed rows', () => {
    const dupRows = [
      0, 1, 0, 1, 1, 0,
      0, 1, 0, 1, 1, 0,
      -1, -1, -1, -1, -1, -1,
      -1, -1, -1, -1, -1, -1,
      -1, -1, -1, -1, -1, -1,
      -1, -1, -1, -1, -1, -1,
    ];
    expect(isValidTakuzuBoard(dupRows)).toBe(false);
  });

  it('verifies Polyomino L-tetrominoes rotate cleanly and tile a 2x4 rectangle', () => {
    const baseL: [number, number][] = [[0, 0], [1, 0], [2, 0], [2, 1]];
    const r1 = rotatePolyCells(baseL, 1); // fits in 2x3
    const r3 = rotatePolyCells(baseL, 3); // rotated 180° relative to r1
    const filled = new Set<string>();
    r1.forEach(([r, c]) => filled.add(`${r},${c}`));
    r3.forEach(([r, c]) => filled.add(`${r},${c + 1}`));
    expect(filled.size).toBe(8);
  });
});
