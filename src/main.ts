import './style.css';
import { AgeTier, GameId, GameModule, SessionRecord, ThemeSkin } from './engine/types';
import { goNoGoGame } from './games/junior/goNoGo';
import { latinSquareGame } from './games/junior/latinSquare';
import { dccsMazeGame } from './games/junior/dccsMaze';
import { schulteGame } from './games/junior/schulte';
import { fireflyMemoryGame } from './games/junior/fireflyMemory';
import { conjunctionSearchGame } from './games/junior/conjunctionSearch';
import { symmetryGridGame } from './games/junior/symmetryGrid';
import { mastermindGame } from './games/junior/mastermind';
import { waitSignalGame } from './games/junior/waitSignal';
import { oddOneOutGame } from './games/junior/oddOneOut';
import { sequenceSortGame } from './games/junior/sequenceSort';
import { countCompareGame } from './games/junior/countCompare';
import { clockMatchGame } from './games/junior/clockMatch';
import { memoryPairsGame } from './games/junior/memoryPairs';
import { shadowMatchGame } from './games/junior/shadowMatch';
import { storyOrderGame } from './games/junior/storyOrder';
import { hanoiGame } from './games/middle/hanoi';
import { spatialConflictGame } from './games/middle/spatialConflict';
import { matrixPatternGame } from './games/middle/matrixPattern';
import { blockMazeGame } from './games/middle/blockMaze';
import { lightsOutGame } from './games/middle/lightsOut';
import { sokobanGame } from './games/middle/sokoban';
import { minesweeperGame } from './games/middle/minesweeper';
import { balanceScaleGame } from './games/middle/balanceScale';
import { flankerFishGame } from './games/middle/flankerFish';
import { bridgesGame } from './games/middle/bridges';
import { pathFinderGame } from './games/middle/pathFinder';
import { wordSearchGame } from './games/middle/wordSearch';
import { fractionPizzaGame } from './games/middle/fractionPizza';
import { mirrorMazeGame } from './games/middle/mirrorMaze';
import { numberPyramidGame } from './games/middle/numberPyramid';
import { colorFloodGame } from './games/middle/colorFlood';
import { anagramSortGame } from './games/middle/anagramSort';
import { nbackGame } from './games/senior/nback';
import { logicGateGame } from './games/senior/logicGate';
import { sudoku6x6Game } from './games/senior/sudoku6x6';
import { sudoku9x9Game } from './games/senior/sudoku9x9';
import { dualMatrixGame } from './games/senior/dualMatrix';
import { zebraPuzzleGame } from './games/senior/zebraPuzzle';
import { nonogramGame } from './games/senior/nonogram';
import { binaryPuzzleGame } from './games/senior/binaryPuzzle';
import { target24Game } from './games/senior/target24';
import { axCptGame } from './games/senior/axCpt';
import { knightTourGame } from './games/senior/knightTour';
import { setMatchGame } from './games/senior/setMatch';
import { primeSieveGame } from './games/senior/primeSieve';
import { cipherBreakGame } from './games/senior/cipherBreak';
import { hitoriGame } from './games/senior/hitori';
import { futoshikiGame } from './games/senior/futoshiki';
import { polyominoFitGame } from './games/senior/polyominoFit';
import { loadPrefs, savePrefs } from './storage/prefs';
import { saveSession } from './storage/db';
import { buildChallengeUrl, buildShareUrl, parseUrlSeed } from './storage/urlSeed';
import {
  BadgeDef,
  MILESTONE_BADGES,
  getDailyQuest,
  getTodayKey,
  loadEngagement,
  recordSessionEngagement,
} from './storage/engagement';
import { audioGateway } from './ui/audio/unlock';
import { showQrModal } from './ui/components/QrModal';
import { escapeHtml } from './ui/escapeHtml';
import { renderDashboard } from './dashboard/radarView';
import {
  mountLiveReactionBattle,
  renderBattleComparison,
  renderBattleLobby,
} from './battle/battleArena';

const GAMES: Record<GameId, GameModule> = {
  gonogo: goNoGoGame,
  latinSquare: latinSquareGame,
  dccsMaze: dccsMazeGame,
  schulte: schulteGame,
  fireflyMemory: fireflyMemoryGame,
  conjunctionSearch: conjunctionSearchGame,
  symmetryGrid: symmetryGridGame,
  mastermind: mastermindGame,
  waitSignal: waitSignalGame,
  oddOneOut: oddOneOutGame,
  sequenceSort: sequenceSortGame,
  countCompare: countCompareGame,
  clockMatch: clockMatchGame,
  memoryPairs: memoryPairsGame,
  shadowMatch: shadowMatchGame,
  storyOrder: storyOrderGame,
  hanoi: hanoiGame,
  spatialConflict: spatialConflictGame,
  matrixPattern: matrixPatternGame,
  blockMaze: blockMazeGame,
  lightsOut: lightsOutGame,
  sokoban: sokobanGame,
  minesweeper: minesweeperGame,
  balanceScale: balanceScaleGame,
  flankerFish: flankerFishGame,
  bridges: bridgesGame,
  pathFinder: pathFinderGame,
  wordSearch: wordSearchGame,
  fractionPizza: fractionPizzaGame,
  mirrorMaze: mirrorMazeGame,
  numberPyramid: numberPyramidGame,
  colorFlood: colorFloodGame,
  anagramSort: anagramSortGame,
  nback: nbackGame,
  logicGate: logicGateGame,
  sudoku6x6: sudoku6x6Game,
  sudoku9x9: sudoku9x9Game,
  dualMatrix: dualMatrixGame,
  zebraPuzzle: zebraPuzzleGame,
  nonogram: nonogramGame,
  binaryPuzzle: binaryPuzzleGame,
  target24: target24Game,
  axCpt: axCptGame,
  knightTour: knightTourGame,
  setMatch: setMatchGame,
  primeSieve: primeSieveGame,
  cipherBreak: cipherBreakGame,
  hitori: hitoriGame,
  futoshiki: futoshikiGame,
  polyominoFit: polyominoFitGame,
};

const ADHD_GAME_IDS: readonly GameId[] = [
  'waitSignal',
  'flankerFish',
  'axCpt',
  'gonogo',
  'dccsMaze',
  'spatialConflict',
  'nback',
];

type HomeFilter = AgeTier | 'adhd';

const AGE_TIERS: { id: HomeFilter; label: string }[] = [
  { id: 'junior', label: '低年級（6–8 歲）' },
  { id: 'middle', label: '中年級（8–10 歲）' },
  { id: 'senior', label: '高年級（10–12 歲）' },
  { id: 'adhd', label: '🌟 ADHD 專注特訓' },
];

const THEME_SKINS: { id: ThemeSkin; label: string }[] = [
  { id: 'geometry', label: '🔷 幾何實驗室' },
  { id: 'space', label: '🚀 太空星際' },
  { id: 'forest', label: '🐞 森林昆蟲' },
];

const appEl = document.getElementById('app')!;
let prefs = loadPrefs();
let activeFilter: HomeFilter = prefs.ageTier;
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

function renderShellHeader(activeView: 'home' | 'game' | 'dashboard' | 'battle'): HTMLElement {
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
        activeView !== 'battle'
          ? '<button type="button" class="btn btn-outline" id="btn-battle">⚔️ 雙人對戰</button>'
          : ''
      }
      ${
        activeView !== 'dashboard'
          ? '<button type="button" class="btn btn-outline" id="btn-dashboard">師長儀表板</button>'
          : ''
      }
    </div>
  `;

  header.querySelector('#btn-mute')?.addEventListener('click', () => {
    audioGateway.unlock();
    prefs.muted = !prefs.muted;
    audioGateway.setMuted(prefs.muted);
    savePrefs(prefs);
    const btn = header.querySelector('#btn-mute') as HTMLButtonElement;
    btn.textContent = prefs.muted ? '🔇 靜音中' : '🔊 音效開';
    btn.setAttribute('aria-pressed', String(prefs.muted));
  });

  header.querySelector('#btn-battle')?.addEventListener('click', () => {
    openBattleLobby();
  });

  header.querySelector('#btn-dashboard')?.addEventListener('click', () => {
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

  const todayKey = getTodayKey();
  const daily = getDailyQuest(prefs.ageTier, todayKey);
  const eng = loadEngagement();
  const doneToday = eng.dailyCompleted[todayKey] ?? [];
  const dailyDoneCount = daily.games.filter((g) => doneToday.includes(g)).length;

  const dailyCardsHtml = daily.games
    .map((gId, idx) => {
      const g = GAMES[gId];
      const isDone = doneToday.includes(gId);
      return `
        <button type="button" class="daily-quest-item ${isDone ? 'is-done' : ''}" data-game="${gId}">
          <span class="quest-step">${isDone ? '✅' : `第 ${idx + 1} 關`}</span>
          <strong>${g.title}</strong>
        </button>
      `;
    })
    .join('');

  const tierTabs = AGE_TIERS.map(
    (t) => `
      <button type="button"
        class="tier-tab ${activeFilter === t.id ? 'is-active' : ''}"
        data-tier="${t.id}">
        ${t.label}
      </button>
    `,
  ).join('');

  const skinButtons = THEME_SKINS.map(
    (s) => `
      <button type="button"
        class="btn ${prefs.themeSkin === s.id ? 'btn-primary' : 'btn-outline'} skin-btn"
        data-skin="${s.id}">
        ${s.label}
      </button>
    `,
  ).join('');

  const filteredGames =
    activeFilter === 'adhd'
      ? ADHD_GAME_IDS.map((id) => GAMES[id])
      : Object.values(GAMES).filter((g) => g.ageTier === activeFilter);
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

  const earnedSet = new Set(eng.unlockedBadges);
  const badgesHtml = MILESTONE_BADGES.map((b) => {
    const unlocked = earnedSet.has(b.id);
    return `
      <div class="badge-tile ${unlocked ? 'is-unlocked' : 'is-locked'}" title="${b.desc}">
        <span class="badge-icon">${unlocked ? b.icon : '🔒'}</span>
        <strong>${b.title}</strong>
        <span class="badge-desc">${b.desc}</span>
      </div>
    `;
  }).join('');

  const displayName = escapeHtml(prefs.nickname || '小小探險家');

  main.innerHTML = `
    <section class="card nickname-bar">
      <div class="nickname-row">
        <div>
          <strong>🧑‍🚀 嗨，${displayName}！</strong>
          <span class="muted" style="font-size:0.85rem;margin-left:6px;">（暱稱僅存於本機，請勿填寫真實全名）</span>
        </div>
        <div class="nickname-edit-group">
          <input type="text" id="input-nickname" class="nickname-input" maxlength="12"
            placeholder="輸入喜歡的暱稱..." value="${prefs.nickname.replace(/"/g, '&quot;')}" aria-label="學童暱稱" />
          <button type="button" class="btn btn-outline" id="btn-save-nickname">儲存暱稱</button>
        </div>
      </div>
    </section>

    <section class="card daily-banner">
      <div class="daily-banner-top">
        <div>
          <h2 style="margin:0;">🧭 今日大腦探險（${dailyDoneCount} / 3）</h2>
          <p class="muted" style="margin:4px 0 0;">
            ${
              dailyDoneCount >= 3
                ? '太棒了！今日鍛鍊已達成，起來看看遠方、喝口水休息一下吧！'
                : '每天完成 3 個小探險，全班同學的今日挑戰題目都一樣喔！'
            }
          </p>
        </div>
      </div>
      <div class="daily-quest-row">${dailyCardsHtml}</div>
    </section>

    <section class="home-controls-row">
      <div class="tier-nav" aria-label="學齡分層選擇">${tierTabs}</div>
      <div class="skin-nav" aria-label="圖形主題切換">${skinButtons}</div>
    </section>

    <section class="search-row">
      <input type="search" id="input-game-search" class="nickname-input" style="width:100%;max-width:340px;"
        placeholder="🔍 搜尋 50 款遊戲名稱或訓練目標..." aria-label="搜尋遊戲" />
    </section>

    <section class="game-grid" id="home-game-grid">${cardsHtml}</section>

    <section class="card">
      <h3 style="margin:0;">🏅 實驗室里程碑徽章（已解鎖 ${earnedSet.size} / ${MILESTONE_BADGES.length}）</h3>
      <div class="badges-grid">${badgesHtml}</div>
    </section>

    <section class="info-banner">
      <p><strong>設計原則：</strong>採用 Okabe-Ito 色覺友善配色、視覺進度條與程序化唯一解生成，無抽卡、無倒數焦慮、無個人資料收集。</p>
    </section>
  `;

  appEl.appendChild(main);

  const bindLaunchButtons = () => {
    main.querySelectorAll<HTMLButtonElement>('.launch-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        audioGateway.unlock();
        const gameId = btn.dataset.game as GameId;
        launchGame(gameId, generateFreshSeed(), prefs.levels[gameId] ?? 1, true);
      });
    });
  };

  main.querySelector('#input-game-search')?.addEventListener('input', (e) => {
    const q = (e.target as HTMLInputElement).value.trim().toLowerCase();
    const list = q
      ? Object.values(GAMES).filter(
          (g) =>
            g.title.toLowerCase().includes(q) ||
            g.subtitle.toLowerCase().includes(q) ||
            g.evidenceBadge.toLowerCase().includes(q),
        )
      : filteredGames;
    const gridEl = main.querySelector('#home-game-grid') as HTMLElement;
    gridEl.innerHTML =
      list.length === 0
        ? '<p class="muted">找不到符合的遊戲關鍵字喔！</p>'
        : list
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
    bindLaunchButtons();
  });

  main.querySelector('#btn-save-nickname')?.addEventListener('click', () => {
    const input = main.querySelector('#input-nickname') as HTMLInputElement;
    prefs.nickname = input.value.trim().slice(0, 12);
    savePrefs(prefs);
    renderHome();
  });

  main.querySelectorAll<HTMLButtonElement>('.daily-quest-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      audioGateway.unlock();
      const gameId = btn.dataset.game as GameId;
      launchGame(gameId, daily.seed, prefs.levels[gameId] ?? 1, false);
    });
  });

  main.querySelectorAll<HTMLButtonElement>('.tier-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.tier as HomeFilter;
      activeFilter = val;
      if (val !== 'adhd') {
        prefs.ageTier = val;
        savePrefs(prefs);
      }
      renderHome();
    });
  });

  main.querySelectorAll<HTMLButtonElement>('.skin-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      prefs.themeSkin = btn.dataset.skin as ThemeSkin;
      savePrefs(prefs);
      renderHome();
    });
  });

  bindLaunchButtons();
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

  toolbar.querySelector('#btn-back-home')?.addEventListener('click', () => {
    renderHome();
  });

  const shareBtn = toolbar.querySelector('#btn-share-seed') as HTMLButtonElement;
  shareBtn.addEventListener('click', async () => {
    const url = buildShareUrl(window.location.href, gameId, seed, level);
    try {
      await navigator.clipboard.writeText(url);
      shareBtn.textContent = '✓ 已複製連結';
    } catch {
      window.prompt('請複製此課堂同題連結：', url);
    }
  });

  toolbar.querySelector('#btn-qr-seed')?.addEventListener('click', () => {
    const url = buildShareUrl(window.location.href, gameId, seed, level);
    showQrModal(url, `${game.title}（種子 #${seed}・Lv.${level}）`);
  });

  cleanupActiveGame = game.mount(stageHost, {
    seed,
    level,
    showTutorial,
    themeSkin: prefs.themeSkin,
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
      const { newlyUnlocked } = recordSessionEngagement(summary);
      renderSessionSummary(stageHost, game, record, newlyUnlocked);
    },
  });
}

function getKidHeadline(asi: number, accuracy: number): { emoji: string; title: string; msg: string } {
  if (asi >= 85 && accuracy >= 0.9) {
    return { emoji: '🌟', title: '太穩了！專注力像雷射一樣！', msg: '你的節奏非常穩定，而且幾乎沒有失誤！' };
  }
  if (accuracy >= 0.75) {
    return { emoji: '👏', title: '表現很棒！完成這次挑戰！', msg: '穩穩地思考、不急著亂按，大腦越來越靈活了！' };
  }
  return { emoji: '💪', title: '勇敢完成練習！', msg: '每一次思考都是大腦在長肌肉，再試一次會更順手喔！' };
}

function renderSessionSummary(
  host: HTMLElement,
  game: GameModule,
  record: SessionRecord,
  newlyUnlocked: BadgeDef[],
): void {
  unmountCurrent();
  const kid = getKidHeadline(record.metrics.asi, record.metrics.accuracy);
  const namePrefix = prefs.nickname ? `${escapeHtml(prefs.nickname)}，` : '';

  const newBadgeHtml =
    newlyUnlocked.length > 0
      ? `
      <div class="new-badges-banner">
        <strong>🎉 解鎖新徽章！</strong>
        <div class="new-badges-list">
          ${newlyUnlocked.map((b) => `<span class="badge">${b.icon} ${b.title}</span>`).join('')}
        </div>
      </div>`
      : '';

  host.innerHTML = `
    <div class="summary-card pop-soft">
      <div style="font-size:2.4rem;">${kid.emoji}</div>
      <h2 style="margin:0;">${namePrefix}${kid.title}</h2>
      <p class="muted" style="margin:0;">${kid.msg}</p>
      ${newBadgeHtml}
      <div class="summary-kid-bars">
        <div class="metric-box">
          <span class="metric-label">本局表現正確率</span>
          <strong class="metric-value">${Math.round(record.metrics.accuracy * 100)}%</strong>
        </div>
        <div class="metric-box">
          <span class="metric-label">目前挑戰階梯</span>
          <strong class="metric-value">Lv.${record.level}</strong>
        </div>
      </div>

      <details class="teacher-metrics-details">
        <summary>師長檢視詳細認知指標（ASI / CV_RT）</summary>
        <div class="summary-metrics" style="margin-top:10px;">
          <div class="metric-box">
            <span class="metric-label">專注穩定度 (ASI)</span>
            <strong class="metric-value">${record.metrics.asi}</strong>
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
      </details>

      <div class="summary-actions">
        <button type="button" class="btn btn-primary btn-lg" id="btn-replay-new">再玩一局（新題目）</button>
        <button type="button" class="btn btn-outline btn-lg" id="btn-replay-same">再試同一題</button>
        <button type="button" class="btn btn-outline btn-lg" id="btn-challenge-friend">⚔️ 挑戰好友（PK 連結）</button>
        <button type="button" class="btn btn-outline btn-lg" id="btn-home">返回首頁</button>
      </div>
    </div>
  `;

  host.querySelector('#btn-replay-new')?.addEventListener('click', () => {
    launchGame(game.id, generateFreshSeed(), record.level, false);
  });
  host.querySelector('#btn-replay-same')?.addEventListener('click', () => {
    launchGame(game.id, record.seed, record.level, false);
  });
  host.querySelector('#btn-challenge-friend')?.addEventListener('click', () => {
    const url = buildChallengeUrl(
      window.location.href,
      game.id,
      record.seed,
      record.level,
      prefs.nickname || '小小探險家',
      record.metrics.asi,
      record.metrics.accuracy,
    );
    showQrModal(url, `⚔️ 挑戰 ${prefs.nickname || '小小探險家'} 的紀錄（${game.title}）`);
  });
  host.querySelector('#btn-home')?.addEventListener('click', renderHome);
}

function openBattleLobby(): void {
  unmountCurrent();
  appEl.innerHTML = '';
  appEl.appendChild(renderShellHeader('battle'));
  const main = document.createElement('main');
  main.className = 'home-main';
  appEl.appendChild(main);

  renderBattleLobby(
    main,
    GAMES,
    prefs.nickname,
    (gameId, p1, p2) => startRelayBattle(gameId, p1, p2, generateFreshSeed()),
    (p1, p2) => startLiveBattle(p1, p2),
    renderHome,
  );
}

function startLiveBattle(p1: string, p2: string): void {
  unmountCurrent();
  appEl.innerHTML = '';
  appEl.appendChild(renderShellHeader('battle'));
  const toolbar = document.createElement('div');
  toolbar.className = 'game-toolbar';
  toolbar.innerHTML = `<button type="button" class="btn btn-outline" id="btn-live-exit">← 返回對戰大廳</button>`;
  const stageHost = document.createElement('main');
  stageHost.className = 'game-host';
  appEl.appendChild(toolbar);
  appEl.appendChild(stageHost);

  toolbar.querySelector('#btn-live-exit')?.addEventListener('click', openBattleLobby);
  cleanupActiveGame = mountLiveReactionBattle(
    stageHost,
    p1,
    p2,
    generateFreshSeed(),
    () => startLiveBattle(p1, p2),
    renderHome,
  );
}

function startRelayBattle(gameId: GameId, p1: string, p2: string, seed: number): void {
  unmountCurrent();
  const game = GAMES[gameId];
  const level = prefs.levels[gameId] ?? 1;
  const safeP1 = escapeHtml(p1);
  const safeP2 = escapeHtml(p2);
  appEl.innerHTML = '';
  appEl.appendChild(renderShellHeader('battle'));

  const toolbar = document.createElement('div');
  toolbar.className = 'game-toolbar';
  toolbar.innerHTML = `
    <button type="button" class="btn btn-outline" id="btn-relay-exit">← 返回對戰大廳</button>
    <h2 class="toolbar-title">⚔️ 同題接力：🔵 ${safeP1} 回合</h2>
  `;
  const stageHost = document.createElement('main');
  stageHost.className = 'game-host';
  appEl.appendChild(toolbar);
  appEl.appendChild(stageHost);
  toolbar.querySelector('#btn-relay-exit')?.addEventListener('click', openBattleLobby);

  cleanupActiveGame = game.mount(stageHost, {
    seed,
    level,
    showTutorial: false,
    themeSkin: prefs.themeSkin,
    onExit: openBattleLobby,
    onSessionComplete: (p1Summary) => {
      unmountCurrent();
      stageHost.innerHTML = `
        <div class="summary-card pop-soft">
          <h2>🔵 ${safeP1} 完成！現在換 🟠 ${safeP2} 上場</h2>
          <p class="muted">接下來將挑戰完全相同的題目（種子 #${seed}）</p>
          <button type="button" class="btn btn-primary btn-lg" id="btn-p2-go">🟠 ${safeP2} 開始挑戰！</button>
        </div>
      `;
      stageHost.querySelector('#btn-p2-go')?.addEventListener('click', () => {
        (toolbar.querySelector('.toolbar-title') as HTMLElement).textContent = `⚔️ 同題接力：🟠 ${p2} 回合`;
        cleanupActiveGame = game.mount(stageHost, {
          seed,
          level,
          showTutorial: false,
          themeSkin: prefs.themeSkin,
          onExit: openBattleLobby,
          onSessionComplete: (p2Summary) => {
            unmountCurrent();
            renderBattleComparison(
              stageHost,
              game.title,
              p1,
              p1Summary.metrics.asi,
              p1Summary.metrics.accuracy,
              p2,
              p2Summary.metrics.asi,
              p2Summary.metrics.accuracy,
              () => startRelayBattle(gameId, p1, p2, generateFreshSeed()),
              renderHome,
            );
          },
        });
      });
    },
  });
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

// Boot: check if launched via classroom URL seed or async friend challenge
const urlParams = parseUrlSeed(window.location.search);
if (urlParams.game) {
  const targetGame = urlParams.game;
  const targetSeed = urlParams.seed ?? generateFreshSeed();
  const targetLvl = urlParams.lvl ?? prefs.levels[targetGame] ?? 1;

  if (urlParams.challengerName && urlParams.challengerAsi !== null && urlParams.challengerAcc !== null) {
    const game = GAMES[targetGame];
    appEl.innerHTML = '';
    appEl.appendChild(renderShellHeader('battle'));
    const banner = document.createElement('div');
    banner.className = 'game-toolbar';
    banner.innerHTML = `<span class="badge">⚔️ 正在挑戰 ${escapeHtml(urlParams.challengerName)} 的同題紀錄（${game.title}）</span>`;
    const stageHost = document.createElement('main');
    stageHost.className = 'game-host';
    appEl.appendChild(banner);
    appEl.appendChild(stageHost);

    cleanupActiveGame = game.mount(stageHost, {
      seed: targetSeed,
      level: targetLvl,
      showTutorial: false,
      themeSkin: prefs.themeSkin,
      onExit: renderHome,
      onSessionComplete: (mySummary) => {
        unmountCurrent();
        renderBattleComparison(
          stageHost,
          game.title,
          urlParams.challengerName!,
          urlParams.challengerAsi!,
          urlParams.challengerAcc!,
          prefs.nickname || '我',
          mySummary.metrics.asi,
          mySummary.metrics.accuracy,
          () => launchGame(targetGame, generateFreshSeed(), targetLvl, false),
          renderHome,
        );
      },
    });
  } else {
    launchGame(targetGame, targetSeed, targetLvl, false);
  }
} else {
  renderHome();
}
