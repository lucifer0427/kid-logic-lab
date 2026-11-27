import { GameId, GameModule, SessionMetrics } from '../engine/types';
import { SeededRng } from '../worker/prng';
import { OKABE_ITO_PALETTE, drawTokenOnCanvas } from '../ui/theme/okabeIto';
import { audioGateway } from '../ui/audio/unlock';
import { VisualTimer } from '../ui/components/VisualTimer';
import { escapeHtml } from '../ui/escapeHtml';

export function renderBattleLobby(
  container: HTMLElement,
  games: Record<GameId, GameModule>,
  defaultP1: string,
  onStartRelay: (gameId: GameId, p1: string, p2: string) => void,
  onStartLive: (p1: string, p2: string) => void,
  onBack: () => void,
): void {
  const gameOptions = Object.values(games)
    .map((g) => `<option value="${g.id}">[${g.ageLabel}] ${g.title}</option>`)
    .join('');

  container.innerHTML = `
    <section class="battle-lobby">
      <div class="dashboard-header">
        <div>
          <h2>⚔️ 雙人同題對戰專區</h2>
          <p class="muted">免聯網、同機或跨裝置皆可 PK！雙方挑戰完全相同的題目種子。</p>
        </div>
        <button type="button" class="btn btn-outline" id="battle-back">返回首頁</button>
      </div>

      <div class="card">
        <h3>1. 設定兩位挑戰者暱稱</h3>
        <div class="battle-names-row">
          <div class="battle-player-box p1-box">
            <label for="bp1">🔵 玩家 1</label>
            <input id="bp1" type="text" class="nickname-input" maxlength="12" value="${(defaultP1 || '探險家 A').replace(/"/g, '&quot;')}" />
          </div>
          <span class="vs-badge">VS</span>
          <div class="battle-player-box p2-box">
            <label for="bp2">🟠 玩家 2</label>
            <input id="bp2" type="text" class="nickname-input" maxlength="12" value="探險家 B" />
          </div>
        </div>
      </div>

      <div class="dashboard-grid">
        <div class="card battle-mode-card">
          <h3>⚡ 模式一：同機即時搶答對戰</h3>
          <p class="muted">兩人同時看著同一個螢幕！看到「橘色圓形」誰先拍到自己區域就得分，看到「朱紅星形」拍錯會扣分喔！支援觸控分區或鍵盤 <strong>A 鍵 vs L 鍵</strong>。</p>
          <button type="button" class="btn btn-primary btn-lg" id="btn-start-live">開始即時搶答！</button>
        </div>

        <div class="card battle-mode-card">
          <h3>🧩 模式二：同題輪流接力賽</h3>
          <p class="muted">挑選任一款邏輯或專注遊戲，玩家 1 與玩家 2 輪流挑戰<strong>完全相同的題目</strong>，比比看誰更穩、更準！</p>
          <select id="battle-game-select" class="battle-select" aria-label="選擇對戰遊戲">
            ${gameOptions}
          </select>
          <button type="button" class="btn btn-primary btn-lg" id="btn-start-relay">開始同題接力賽！</button>
        </div>
      </div>
    </section>
  `;

  const getNames = (): [string, string] => {
    const p1 = (container.querySelector('#bp1') as HTMLInputElement).value.trim() || '玩家 1';
    const p2 = (container.querySelector('#bp2') as HTMLInputElement).value.trim() || '玩家 2';
    return [p1, p2];
  };

  container.querySelector('#battle-back')?.addEventListener('click', onBack);
  container.querySelector('#btn-start-live')?.addEventListener('click', () => {
    audioGateway.unlock();
    const [p1, p2] = getNames();
    onStartLive(p1, p2);
  });
  container.querySelector('#btn-start-relay')?.addEventListener('click', () => {
    audioGateway.unlock();
    const [p1, p2] = getNames();
    const gameId = (container.querySelector('#battle-game-select') as HTMLSelectElement).value as GameId;
    onStartRelay(gameId, p1, p2);
  });
}

export function mountLiveReactionBattle(
  container: HTMLElement,
  p1Name: string,
  p2Name: string,
  seed: number,
  onExit: () => void,
): () => void {
  const TOTAL_ROUNDS = 12;
  const rng = new SeededRng(seed);
  const targetToken = OKABE_ITO_PALETTE[0]; // Orange Circle
  const noGoToken = OKABE_ITO_PALETTE[4];   // Vermilion Star

  let score1 = 0;
  let score2 = 0;
  let round = 0;
  let disposed = false;
  let awaiting = false;
  let roundResolved = false;
  let currentIsTarget = true;
  let stimStartMs = 0;
  let timerId: number | null = null;

  const safeP1 = escapeHtml(p1Name);
  const safeP2 = escapeHtml(p2Name);

  container.innerHTML = `
    <div class="game-stage">
      <div class="stage-header">
        <div class="stage-meta">
          <span class="badge">⚡ 即時雙人搶答</span>
          <span class="badge" id="live-round">第 1 / ${TOTAL_ROUNDS} 題</span>
        </div>
        <div class="target-legend">
          <span>搶答：<strong>橘色圓形</strong></span>
          <span>禁制：<strong>朱紅星形（按到扣 1 分）</strong></span>
        </div>
      </div>
      <div id="live-timer-slot" style="width:100%;"></div>
      <div class="live-scoreboard">
        <div class="score-pill p1-pill">🔵 ${safeP1}：<strong id="s1">0</strong></div>
        <div class="score-pill p2-pill">🟠 ${safeP2}：<strong id="s2">0</strong></div>
      </div>
      <canvas class="gonogo-canvas" id="live-canvas" width="420" height="220"></canvas>
      <div class="live-pads">
        <button type="button" class="btn live-pad p1-pad" id="pad-p1">🔵 ${safeP1} 搶答區<br><small>(鍵盤 A 鍵)</small></button>
        <button type="button" class="btn live-pad p2-pad" id="pad-p2">🟠 ${safeP2} 搶答區<br><small>(鍵盤 L 鍵)</small></button>
      </div>
      <div class="stage-status" id="live-status">準備好了嗎？眼睛盯緊中間！</div>
    </div>
  `;

  const timer = new VisualTimer('對戰進度');
  container.querySelector('#live-timer-slot')!.appendChild(timer.element);
  const canvas = container.querySelector('#live-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const s1El = container.querySelector('#s1') as HTMLElement;
  const s2El = container.querySelector('#s2') as HTMLElement;
  const roundEl = container.querySelector('#live-round') as HTMLElement;
  const statusEl = container.querySelector('#live-status') as HTMLElement;

  function clearCanvas(): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2 - 12, canvas.height / 2);
    ctx.lineTo(canvas.width / 2 + 12, canvas.height / 2);
    ctx.moveTo(canvas.width / 2, canvas.height / 2 - 12);
    ctx.lineTo(canvas.width / 2, canvas.height / 2 + 12);
    ctx.stroke();
  }

  function updateScores(): void {
    s1El.textContent = String(score1);
    s2El.textContent = String(score2);
  }

  function handlePlayerTap(player: 1 | 2): void {
    if (!awaiting || roundResolved || disposed) return;
    audioGateway.unlock();
    const pName = player === 1 ? p1Name : p2Name;

    if (currentIsTarget) {
      roundResolved = true;
      awaiting = false;
      const rt = Math.round(performance.now() - stimStartMs);
      if (player === 1) score1 += 1;
      else score2 += 1;
      audioGateway.playPentatonic(4);
      statusEl.textContent = `${pName} 搶答成功！（${rt} ms）+1 分`;
      updateScores();
      if (timerId !== null) window.clearTimeout(timerId);
      timerId = window.setTimeout(nextRound, 650);
    } else {
      roundResolved = true;
      awaiting = false;
      if (player === 1) score1 = Math.max(0, score1 - 1);
      else score2 = Math.max(0, score2 - 1);
      audioGateway.playTone('gentle');
      statusEl.textContent = `${pName} 按到禁制星形囉！扣 1 分`;
      updateScores();
      if (timerId !== null) window.clearTimeout(timerId);
      timerId = window.setTimeout(nextRound, 650);
    }
  }

  container.querySelector('#pad-p1')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handlePlayerTap(1);
  });
  container.querySelector('#pad-p2')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handlePlayerTap(2);
  });

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'a' || e.key === 'A') handlePlayerTap(1);
    else if (e.key === 'l' || e.key === 'L') handlePlayerTap(2);
  };
  window.addEventListener('keydown', onKeyDown);

  function showLiveWinner(): void {
    window.removeEventListener('keydown', onKeyDown);
    audioGateway.playTone('complete');
    const winner =
      score1 > score2 ? `🏆 ${safeP1} 獲勝！` : score2 > score1 ? `🏆 ${safeP2} 獲勝！` : '🤝 勢均力敵，平手！';
    container.innerHTML = `
      <div class="summary-card pop-soft">
        <div style="font-size:2.4rem;">⚔️</div>
        <h2 style="margin:0;">${winner}</h2>
        <div class="summary-kid-bars">
          <div class="metric-box">
            <span class="metric-label">🔵 ${safeP1}</span>
            <strong class="metric-value">${score1} 分</strong>
          </div>
          <div class="metric-box">
            <span class="metric-label">🟠 ${safeP2}</span>
            <strong class="metric-value">${score2} 分</strong>
          </div>
        </div>
        <div class="summary-actions">
          <button type="button" class="btn btn-primary btn-lg" id="live-rematch">再戰一局</button>
          <button type="button" class="btn btn-outline btn-lg" id="live-home">返回首頁</button>
        </div>
      </div>
    `;
    container.querySelector('#live-rematch')?.addEventListener('click', () => {
      mountLiveReactionBattle(container, p1Name, p2Name, seed + 1, onExit);
    });
    container.querySelector('#live-home')?.addEventListener('click', onExit);
  }

  function nextRound(): void {
    if (disposed) return;
    if (round >= TOTAL_ROUNDS) {
      timer.setProgress(1);
      showLiveWinner();
      return;
    }

    timer.setProgress(round / TOTAL_ROUNDS);
    round += 1;
    roundEl.textContent = `第 ${round} / ${TOTAL_ROUNDS} 題`;
    clearCanvas();

    const isi = 650 + rng.int(0, 850);
    timerId = window.setTimeout(() => {
      if (disposed) return;
      currentIsTarget = rng.next() >= 0.3;
      const tok = currentIsTarget ? targetToken : noGoToken;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drawTokenOnCanvas(ctx, tok, canvas.width / 2, canvas.height / 2, 58);

      stimStartMs = performance.now();
      awaiting = true;
      roundResolved = false;

      timerId = window.setTimeout(() => {
        if (disposed || roundResolved) return;
        awaiting = false;
        statusEl.textContent = currentIsTarget ? '雙方都錯過囉！' : '兩位都成功忍住！';
        nextRound();
      }, 1450);
    }, isi);
  }

  clearCanvas();
  timerId = window.setTimeout(nextRound, 600);

  return () => {
    disposed = true;
    if (timerId !== null) window.clearTimeout(timerId);
    window.removeEventListener('keydown', onKeyDown);
  };
}

export function renderBattleComparison(
  container: HTMLElement,
  gameTitle: string,
  p1Name: string,
  p1Asi: number,
  p1Acc: number,
  p2Name: string,
  p2Asi: number,
  p2Acc: number,
  onRematch: () => void,
  onHome: () => void,
): void {
  const safeP1 = escapeHtml(p1Name);
  const safeP2 = escapeHtml(p2Name);
  const score1 = p1Asi * 0.6 + p1Acc * 100 * 0.4;
  const score2 = p2Asi * 0.6 + p2Acc * 100 * 0.4;
  const headline =
    Math.abs(score1 - score2) < 1
      ? '🤝 棋逢敵手，平分秋色！'
      : score1 > score2
        ? `🏆 ${safeP1} 領先勝出！`
        : `🏆 ${safeP2} 領先勝出！`;

  container.innerHTML = `
    <div class="summary-card pop-soft">
      <div style="font-size:2.2rem;">⚔️</div>
      <h2 style="margin:0;">${headline}</h2>
      <p class="muted" style="margin:0;">對戰項目：${escapeHtml(gameTitle)}</p>
      <div class="summary-kid-bars">
        <div class="metric-box">
          <span class="metric-label">🔵 ${safeP1}</span>
          <strong class="metric-value">ASI ${p1Asi}</strong>
          <span class="muted">正確率 ${Math.round(p1Acc * 100)}%</span>
        </div>
        <div class="metric-box">
          <span class="metric-label">🟠 ${safeP2}</span>
          <strong class="metric-value">ASI ${p2Asi}</strong>
          <span class="muted">正確率 ${Math.round(p2Acc * 100)}%</span>
        </div>
      </div>
      <div class="summary-actions">
        <button type="button" class="btn btn-primary btn-lg" id="battle-rematch">再戰一局（新題目）</button>
        <button type="button" class="btn btn-outline btn-lg" id="battle-go-home">返回首頁</button>
      </div>
    </div>
  `;

  container.querySelector('#battle-rematch')?.addEventListener('click', onRematch);
  container.querySelector('#battle-go-home')?.addEventListener('click', onHome);
}

export function formatMetricsSummary(m: SessionMetrics): string {
  return `ASI ${m.asi} / 正確率 ${Math.round(m.accuracy * 100)}%`;
}
