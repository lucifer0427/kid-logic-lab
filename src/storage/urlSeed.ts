import { ALL_GAME_IDS, GameId } from '../engine/types';

export interface UrlSeedParams {
  game: GameId | null;
  seed: number | null;
  lvl: number | null;
  challengerName: string | null;
  challengerAsi: number | null;
  challengerAcc: number | null;
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

  const rawName = params.get('cname');
  const challengerName = rawName ? rawName.trim().slice(0, 12) : null;

  const rawAsi = params.get('casi');
  const parsedAsi = rawAsi !== null ? Number.parseFloat(rawAsi) : Number.NaN;
  const challengerAsi = Number.isFinite(parsedAsi) ? parsedAsi : null;

  const rawAcc = params.get('cacc');
  const parsedAcc = rawAcc !== null ? Number.parseFloat(rawAcc) : Number.NaN;
  const challengerAcc = Number.isFinite(parsedAcc) ? parsedAcc : null;

  return { game, seed, lvl, challengerName, challengerAsi, challengerAcc };
}

export function buildShareUrl(baseHref: string, game: GameId, seed: number, lvl: number): string {
  const url = new URL(baseHref);
  url.search = '';
  url.searchParams.set('game', game);
  url.searchParams.set('seed', String(seed >>> 0));
  url.searchParams.set('lvl', String(lvl));
  return url.toString();
}

export function buildChallengeUrl(
  baseHref: string,
  game: GameId,
  seed: number,
  lvl: number,
  challengerName: string,
  challengerAsi: number,
  challengerAcc: number,
): string {
  const url = new URL(buildShareUrl(baseHref, game, seed, lvl));
  url.searchParams.set('cname', challengerName.slice(0, 12) || '好友');
  url.searchParams.set('casi', String(Math.round(challengerAsi * 10) / 10));
  url.searchParams.set('cacc', String(Math.round(challengerAcc * 1000) / 1000));
  return url.toString();
}
