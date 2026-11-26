import { AgeTier, GameId, SessionRecord } from '../engine/types';
import { SeededRng } from '../worker/prng';

export interface BadgeDef {
  id: string;
  icon: string;
  title: string;
  desc: string;
}

export const MILESTONE_BADGES: readonly BadgeDef[] = [
  { id: 'first_step', icon: '🌱', title: '小小探險家', desc: '完成第 1 次大腦練習' },
  { id: 'steady_hand', icon: '🎯', title: '穩如泰山', desc: '單次專注穩定度 (ASI) 達 85 分以上' },
  { id: 'logic_detective', icon: '🔍', title: '邏輯小偵探', desc: '數獨或拉丁方陣以 95% 以上正確率過關' },
  { id: 'hanoi_master', icon: '🗼', title: '預演大師', desc: '漢諾塔策略規劃達 90 分以上' },
  { id: 'maze_coder', icon: '🤖', title: '積木工程師', desc: '成功引導積木迷宮走到終點' },
  { id: 'memory_spark', icon: '✨', title: '記憶閃電', desc: '記憶或 N-Back 任務達 85% 以上正確率' },
  { id: 'daily_explorer', icon: '🏅', title: '今日探險達成', desc: '完成「今日大腦探險」全部 3 個關卡' },
  { id: 'streak_builder', icon: '📚', title: '持之以恆', desc: '累積完成 5 次以上大腦練習' },
] as const;

export interface DailyQuest {
  dateKey: string;
  seed: number;
  games: [GameId, GameId, GameId];
}

export interface EngagementState {
  unlockedBadges: string[];
  dailyCompleted: Record<string, GameId[]>; // dateKey -> completed gameIds
  totalSessions: number;
}

const ENGAGEMENT_KEY = 'kid_logic_lab_engagement_v1';

export function getTodayKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

export function getDailyQuest(ageTier: AgeTier, dateKey = getTodayKey()): DailyQuest {
  const seed = Number.parseInt(dateKey, 10) || 20261126;
  const rng = new SeededRng(seed + ageTier.length * 997);

  const pools: Record<AgeTier, [GameId[], GameId[], GameId[]]> = {
    junior: [
      ['gonogo', 'dccsMaze', 'conjunctionSearch'],
      ['schulte', 'fireflyMemory', 'symmetryGrid'],
      ['latinSquare', 'mastermind'],
    ],
    middle: [
      ['spatialConflict', 'minesweeper'],
      ['hanoi', 'lightsOut', 'sokoban'],
      ['matrixPattern', 'blockMaze', 'balanceScale'],
    ],
    senior: [
      ['nback', 'nonogram'],
      ['logicGate', 'dualMatrix', 'binaryPuzzle'],
      ['sudoku6x6', 'sudoku9x9', 'zebraPuzzle', 'target24'],
    ],
  };

  const [p1, p2, p3] = pools[ageTier];
  return {
    dateKey,
    seed,
    games: [
      p1[rng.int(0, p1.length - 1)],
      p2[rng.int(0, p2.length - 1)],
      p3[rng.int(0, p3.length - 1)],
    ],
  };
}

export function loadEngagement(): EngagementState {
  try {
    const raw = localStorage.getItem(ENGAGEMENT_KEY);
    if (!raw) return { unlockedBadges: [], dailyCompleted: {}, totalSessions: 0 };
    const parsed = JSON.parse(raw) as Partial<EngagementState>;
    return {
      unlockedBadges: Array.isArray(parsed.unlockedBadges) ? parsed.unlockedBadges : [],
      dailyCompleted: parsed.dailyCompleted ?? {},
      totalSessions: typeof parsed.totalSessions === 'number' ? parsed.totalSessions : 0,
    };
  } catch {
    return { unlockedBadges: [], dailyCompleted: {}, totalSessions: 0 };
  }
}

export function saveEngagement(state: EngagementState): void {
  try {
    localStorage.setItem(ENGAGEMENT_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

/** Records a completed session and returns newly unlocked badge definitions */
export function recordSessionEngagement(
  record: Omit<SessionRecord, 'id' | 'timestamp'>,
  dateKey = getTodayKey(),
): { state: EngagementState; newlyUnlocked: BadgeDef[] } {
  const state = loadEngagement();
  state.totalSessions += 1;

  const todayList = state.dailyCompleted[dateKey] ?? [];
  if (!todayList.includes(record.gameId)) {
    todayList.push(record.gameId);
  }
  state.dailyCompleted[dateKey] = todayList;

  const quest = getDailyQuest(record.ageTier, dateKey);
  const dailyDoneCount = quest.games.filter((g) => todayList.includes(g)).length;

  const earned = new Set(state.unlockedBadges);
  const newlyUnlocked: BadgeDef[] = [];

  const grant = (id: string) => {
    if (!earned.has(id)) {
      earned.add(id);
      const def = MILESTONE_BADGES.find((b) => b.id === id);
      if (def) newlyUnlocked.push(def);
    }
  };

  grant('first_step');
  if (record.metrics.asi >= 85) grant('steady_hand');
  if (
    (record.gameId === 'sudoku6x6' ||
      record.gameId === 'sudoku9x9' ||
      record.gameId === 'latinSquare' ||
      record.gameId === 'zebraPuzzle') &&
    record.metrics.accuracy >= 0.95
  ) {
    grant('logic_detective');
  }
  if (record.gameId === 'hanoi' && (record.axisScores.strategicPlanning ?? 0) >= 90) {
    grant('hanoi_master');
  }
  if (record.gameId === 'blockMaze' && record.metrics.accuracy > 0) {
    grant('maze_coder');
  }
  if (
    (record.gameId === 'fireflyMemory' || record.gameId === 'nback') &&
    record.metrics.accuracy >= 0.85
  ) {
    grant('memory_spark');
  }
  if (dailyDoneCount >= 3) grant('daily_explorer');
  if (state.totalSessions >= 5) grant('streak_builder');

  state.unlockedBadges = Array.from(earned);
  saveEngagement(state);

  return { state, newlyUnlocked };
}
