import './style.css';
import { AgeTier, GameId, GameModule, SessionRecord } from './engine/types';
import { goNoGoGame } from './games/junior/goNoGo';
import { latinSquareGame } from './games/junior/latinSquare';
import { dccsMazeGame } from './games/junior/dccsMaze';
import { schulteGame } from './games/junior/schulte';
import { hanoiGame } from './games/middle/hanoi';
import { spatialConflictGame } from './games/middle/spatialConflict';
import { matrixPatternGame } from './games/middle/matrixPattern';
import { blockMazeGame } from './games/middle/blockMaze';
import { nbackGame } from './games/senior/nback';
import { logicGateGame } from './games/senior/logicGate';
import { sudoku6x6Game } from './games/senior/sudoku6x6';
import { sudoku9x9Game } from './games/senior/sudoku9x9';
import { dualMatrixGame } from './games/senior/dualMatrix';
import { loadPrefs, savePrefs } from './storage/prefs';
import { saveSession } from './storage/db';
import { buildShareUrl, parseUrlSeed } from './storage/urlSeed';
import { audioGateway } from './ui/audio/unlock';
import { showQrModal } from './ui/components/QrModal';
import { renderDashboard } from './dashboard/radarView';

const GAMES: Record<GameId, GameModule> = {
  gonogo: goNoGoGame,
  latinSquare: latinSquareGame,
  dccsMaze: dccsMazeGame,
  schulte: schulteGame,
  hanoi: hanoiGame,
  spatialConflict: spatialConflictGame,
  matrixPattern: matrixPatternGame,
  blockMaze: blockMazeGame,
  nback: nbackGame,
  logicGate: logicGateGame,
  sudoku6x6: sudoku6x6Game,
  sudoku9x9: sudoku9x9Game,
  dualMatrix: dualMatrixGame,
};

const AGE_TIERS: { id: AgeTier; label: string }[] = [
  { id: 'junior', label: '低年級（6–8 歲）' },
  { id: 'middle', label: '中年級（8–10 歲）' },
  { id: 'senior', label: '高年級（10–12 歲）' },
];

const appEl = document.getElementById('app')!;
let prefs = loadPrefs();
audioGateway.setMuted(prefs.muted);

let cleanupActiveGame: (() => void) | null = null;

function generateFreshSeed(): number {
  return Math.floor(10000 + Math.random() * 89999);
}

function unmountCurrent(): void {
  if (cleanupActiveGame) {
    cleanupActiveGame();
    cleanupActiveGame = null;
  }
}

function renderShellHeader(activeView: 'home' | 'game' | 'dashboard'): HTMLElement {
  const header = document.createElement('header');
  header.className = 'topbar';
  header.innerHTML = `
    <div class="brand">
      <span class="brand-dot" aria-hidden="true"></span>
      <div>
        <h1>Kid Logic Lab</h1>
        <span class="brand-sub">國小專注力與邏輯訓練（零個資・離線可用）</span>
      </div>
    </div>
    <div class="topbar-actions">
      <button type="button" class="btn btn-outline" id="btn-mute" aria-pressed="${prefs.muted}">
        ${prefs.muted ? '🔇 靜音中' : '🔊 音效開'}
      </button>
      ${
        activeView !== 'dashboard'
          ? '<button type="button" class="btn btn-outline" id="btn-dashboard">師長儀表板</button>'
          : ''
      }
    </div>
  `;

  header.querySelector('#btn-mute')?.addEventListener('pointerdown', () => {
    audioGateway.unlock();
    prefs.muted = !prefs.muted;
    audioGateway.setMuted(prefs.muted);
    savePrefs(prefs);
    const btn = header.querySelector('#btn-mute') as HTMLButtonElement;
    btn.textContent = prefs.muted ? '🔇 靜音中' : '🔊 音效開';
    btn.setAttribute('aria-pressed', String(prefs.muted));
  });

  header.querySelector('#btn-dashboard')?.addEventListener('pointerdown', () => {
    openDashboard();
  });

  return header;
}

function renderHome(): void {
  unmountCurrent();
  appEl.innerHTML = '';
  appEl.appendChild(renderShellHeader('home'));

  const main = document.createElement('main');
  main.className = 'home-main';

  const tierTabs = AGE_TIERS.map(
    (t) => `
      <button type="button"
        class="tier-tab ${prefs.ageTier === t.id ? 'is-active' : ''}"
        data-tier="${t.id}">
        ${t.label}
      </button>
    `,
  ).join('');

  const filteredGames = Object.values(GAMES).filter((g) => g.ageTier === prefs.ageTier);
  const cardsHtml = filteredGames
    .map(
      (g) => `
      <article class="game-card">
        <div class="game-card-top">
          <span class="badge">${g.ageLabel}</span>
          <span class="evidence-tag">${g.evidenceBadge}</span>
        </div>
        <h2>${g.title}</h2>
        <p>${g.subtitle}</p>
        <div class="game-card-footer">
          <span class="muted">目前階梯 Lv.${prefs.levels[g.id] ?? 1}</span>
          <button type="button" class="btn btn-primary btn-lg launch-btn" data-game="${g.id}">
            開始練習
          </button>
        </div>
      </article>
    `,
    )
    .join('');

  main.innerHTML = `
    <section class="tier-nav" aria-label="學齡分層選擇">${tierTabs}</section>
    <section class="game-grid">${cardsHtml}</section>
    <section class="info-banner">
      <p><strong>設計原則：</strong>採用 Okabe-Ito 色覺友善配色、視覺進度條與程序化唯一解生成，無廣告、無倒數焦慮、無個人資料收集。</p>
    </section>
  `;

  appEl.appendChild(main);

  main.querySelectorAll<HTMLButtonElement>('.tier-tab').forEach((btn) => {
    btn.addEventListener('pointerdown', () => {
      prefs.ageTier = btn.dataset.tier as AgeTier;
      savePrefs(prefs);
      renderHome();
    });
  });

  main.querySelectorAll<HTMLButtonElement>('.launch-btn').forEach((btn) => {
    btn.addEventListener('pointerdown', () => {
      audioGateway.unlock();
      const gameId = btn.dataset.game as GameId;
      launchGame(gameId, generateFreshSeed(), prefs.levels[gameId] ?? 1, true);
    });
  });
}

function launchGame(gameId: GameId, seed: number, level: number, showTutorial: boolean): void {
  unmountCurrent();
  const game = GAMES[gameId];
  appEl.innerHTML = '';
  appEl.appendChild(renderShellHeader('game'));

  const toolbar = document.createElement('div');
  toolbar.className = 'game-toolbar';
  toolbar.innerHTML = `
    <button type="button" class="btn btn-outline" id="btn-back-home">← 返回選單</button>
    <h2 class="toolbar-title">${game.title}</h2>
    <div class="toolbar-share">
      <button type="button" class="btn btn-outline" id="btn-share-seed">複製同題連結</button>
      <button type="button" class="btn btn-outline" id="btn-qr-seed">QR Code</button>
    </div>
  `;

  const stageHost = document.createElement('main');
  stageHost.className = 'game-host';

  appEl.appendChild(toolbar);
  appEl.appendChild(stageHost);

  toolbar.querySelector('#btn-back-home')?.addEventListener('pointerdown', () => {
    renderHome();
  });

  const shareBtn = toolbar.querySelector('#btn-share-seed') as HTMLButtonElement;
  shareBtn.addEventListener('pointerdown', async () => {
    const url = buildShareUrl(window.location.href, gameId, seed, level);
    try {
      await navigator.clipboard.writeText(url);
      shareBtn.textContent = '✓ 已複製連結';
    } catch {
      window.prompt('請複製此課堂同題連結：', url);
    }
  });

  toolbar.querySelector('#btn-qr-seed')?.addEventListener('pointerdown', () => {
    const url = buildShareUrl(window.location.href, gameId, seed, level);
    showQrModal(url, `${game.title}（種子 #${seed}・Lv.${level}）`);
  });

  cleanupActiveGame = game.mount(stageHost, {
    seed,
    level,
    showTutorial,
    onExit: renderHome,
    onSessionComplete: (summary) => {
      const record: SessionRecord = {
        ...summary,
        id: `${summary.gameId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: Date.now(),
      };
      void saveSession(record);
      prefs.levels[summary.gameId] = summary.level;
      savePrefs(prefs);
      renderSessionSummary(stageHost, game, record);
    },
  });
}

function renderSessionSummary(host: HTMLElement, game: GameModule, record: SessionRecord): void {
  unmountCurrent();
  host.innerHTML = `
    <div class="summary-card">
      <h2>練習完成！</h2>
      <p class="muted">${game.title}（種子 #${record.seed}）</p>
      <div class="summary-metrics">
        <div class="metric-box">
          <span class="metric-label">專注穩定度 (ASI)</span>
          <strong class="metric-value">${record.metrics.asi}</strong>
        </div>
        <div class="metric-box">
          <span class="metric-label">正確率</span>
          <strong class="metric-value">${Math.round(record.metrics.accuracy * 100)}%</strong>
        </div>
        <div class="metric-box">
          <span class="metric-label">平均反應時間</span>
          <strong class="metric-value">${record.metrics.meanRtMs} ms</strong>
        </div>
        <div class="metric-box">
          <span class="metric-label">反應變異係數 (CV_RT)</span>
          <strong class="metric-value">${record.metrics.cvRt}</strong>
        </div>
      </div>
      <div class="summary-actions">
        <button type="button" class="btn btn-primary btn-lg" id="btn-replay">再玩一局（新題目）</button>
        <button type="button" class="btn btn-outline btn-lg" id="btn-home">返回首頁</button>
      </div>
    </div>
  `;

  host.querySelector('#btn-replay')?.addEventListener('pointerdown', () => {
    launchGame(game.id, generateFreshSeed(), record.level, false);
  });
  host.querySelector('#btn-home')?.addEventListener('pointerdown', renderHome);
}

function openDashboard(): void {
  unmountCurrent();
  appEl.innerHTML = '';
  appEl.appendChild(renderShellHeader('dashboard'));
  const main = document.createElement('main');
  main.className = 'home-main';
  appEl.appendChild(main);
  void renderDashboard(main, renderHome);
}

// Boot: check if launched via classroom URL seed (?game=...&seed=...&lvl=...)
const urlParams = parseUrlSeed(window.location.search);
if (urlParams.game) {
  const targetGame = urlParams.game;
  const targetSeed = urlParams.seed ?? generateFreshSeed();
  const targetLvl = urlParams.lvl ?? prefs.levels[targetGame] ?? 1;
  launchGame(targetGame, targetSeed, targetLvl, false);
} else {
  renderHome();
}
