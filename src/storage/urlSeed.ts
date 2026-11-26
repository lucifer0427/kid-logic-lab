import { ALL_GAME_IDS, GameId } from '../engine/types';

export interface UrlSeedParams {
  game: GameId | null;
  seed: number | null;
  lvl: number | null;
}

export function parseUrlSeed(search: string): UrlSeedParams {
  const params = new URLSearchParams(search);
  const rawGame = params.get('game');
  const game = ALL_GAME_IDS.includes(rawGame as GameId) ? (rawGame as GameId) : null;

  const rawSeed = params.get('seed');
  const parsedSeed = rawSeed !== null ? Number.parseInt(rawSeed, 10) : Number.NaN;
  const seed = Number.isFinite(parsedSeed) && parsedSeed > 0 ? parsedSeed : null;

  const rawLvl = params.get('lvl');
  const parsedLvl = rawLvl !== null ? Number.parseInt(rawLvl, 10) : Number.NaN;
  const lvl = Number.isFinite(parsedLvl) && parsedLvl >= 1 ? parsedLvl : null;

  return { game, seed, lvl };
}

export function buildShareUrl(baseHref: string, game: GameId, seed: number, lvl: number): string {
  const url = new URL(baseHref);
  url.search = '';
  url.searchParams.set('game', game);
  url.searchParams.set('seed', String(seed >>> 0));
  url.searchParams.set('lvl', String(lvl));
  return url.toString();
}
