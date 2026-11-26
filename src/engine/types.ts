export type AgeTier = 'junior' | 'middle' | 'senior';

export type ThemeSkin = 'geometry' | 'space' | 'forest';

export type GameId =
  | 'gonogo'
  | 'latinSquare'
  | 'dccsMaze'
  | 'schulte'
  | 'fireflyMemory'
  | 'conjunctionSearch'
  | 'symmetryGrid'
  | 'mastermind'
  | 'hanoi'
  | 'spatialConflict'
  | 'matrixPattern'
  | 'blockMaze'
  | 'lightsOut'
  | 'sokoban'
  | 'minesweeper'
  | 'balanceScale'
  | 'nback'
  | 'logicGate'
  | 'sudoku6x6'
  | 'sudoku9x9'
  | 'dualMatrix'
  | 'zebraPuzzle'
  | 'nonogram'
  | 'binaryPuzzle'
  | 'target24'
  | 'waitSignal'
  | 'flankerFish'
  | 'axCpt';

export const ALL_GAME_IDS: readonly GameId[] = [
  'gonogo',
  'latinSquare',
  'dccsMaze',
  'schulte',
  'fireflyMemory',
  'conjunctionSearch',
  'symmetryGrid',
  'mastermind',
  'waitSignal',
  'hanoi',
  'spatialConflict',
  'matrixPattern',
  'blockMaze',
  'lightsOut',
  'sokoban',
  'minesweeper',
  'balanceScale',
  'flankerFish',
  'nback',
  'logicGate',
  'sudoku6x6',
  'sudoku9x9',
  'dualMatrix',
  'zebraPuzzle',
  'nonogram',
  'binaryPuzzle',
  'target24',
  'axCpt',
] as const;

export type CognitiveAxis =
  | 'attentionStability'
  | 'impulseInhibition'
  | 'workingMemory'
  | 'deductiveReasoning'
  | 'strategicPlanning';

export interface TrialRecord {
  /** Whether a user response was expected (Go) or inhibited (No-Go) */
  isTarget: boolean;
  /** Whether the trial outcome was correct */
  correct: boolean;
  /** Reaction time in milliseconds from performance.now(); null if no response */
  rtMs: number | null;
  /** Error classification */
  errorType: 'none' | 'commission' | 'omission' | 'rule';
}

export interface SessionMetrics {
  meanRtMs: number;
  sdRtMs: number;
  cvRt: number;
  accuracy: number;
  commissionErrors: number;
  omissionErrors: number;
  fatigueDelta: number;
  /** Attention Stability Index (0–100) */
  asi: number;
}

export interface SessionRecord {
  id: string;
  timestamp: number;
  gameId: GameId;
  ageTier: AgeTier;
  seed: number;
  level: number;
  metrics: SessionMetrics;
  /** Normalized 0–100 score for the game's cognitive axes */
  axisScores: Partial<Record<CognitiveAxis, number>>;
}

export interface GameLaunchConfig {
  seed: number;
  level: number;
  showTutorial: boolean;
  themeSkin?: ThemeSkin;
  onSessionComplete: (record: Omit<SessionRecord, 'id' | 'timestamp'>) => void;
  onExit: () => void;
}

export interface GameModule {
  id: GameId;
  title: string;
  subtitle: string;
  ageTier: AgeTier;
  ageLabel: string;
  evidenceBadge: string;
  primaryAxis: CognitiveAxis;
  mount(container: HTMLElement, config: GameLaunchConfig): () => void;
}
