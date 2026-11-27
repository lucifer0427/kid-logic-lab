import { ALL_GAME_IDS, AgeTier, GameId, ThemeSkin } from '../engine/types';

export interface UserPrefs {
  muted: boolean;
  ageTier: AgeTier;
  themeSkin: ThemeSkin;
  nickname: string;
  levels: Record<GameId, number>;
}

const PREFS_KEY = 'kid_logic_lab_prefs_v1';

function defaultLevels(): Record<GameId, number> {
  const levels = {} as Record<GameId, number>;
  for (const id of ALL_GAME_IDS) {
    levels[id] = 1;
  }
  return levels;
}

export function loadPrefs(): UserPrefs {
  const defaults: UserPrefs = {
    muted: false,
    ageTier: 'junior',
    themeSkin: 'geometry',
    nickname: '',
    levels: defaultLevels(),
  };

  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<UserPrefs>;
    return {
      muted: Boolean(parsed.muted),
      ageTier: parsed.ageTier ?? defaults.ageTier,
      themeSkin: parsed.themeSkin ?? defaults.themeSkin,
      nickname: typeof parsed.nickname === 'string' ? parsed.nickname.slice(0, 16) : '',
      levels: {
        ...defaults.levels,
        ...(parsed.levels ?? {}),
      },
    };
  } catch {
    return defaults;
  }
}

export function savePrefs(prefs: UserPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota errors gracefully
  }
}
