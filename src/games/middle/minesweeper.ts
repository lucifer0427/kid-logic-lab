import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { SeededRng } from '../../worker/prng';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

export const minesweeperGame: GameModule = {
  id: 'minesweeper',
  title: '星塵純演繹掃雷',
  subtitle: '數字代表周圍 8 格有幾顆休眠星塵；用邏輯推出安全格並插上旗幟',
  ageTier: 'middle',
  ageLabel: '中年級 8–10 歲',
  evidenceBadge: '局部約束演繹（Minesweeper）',
  primaryAxis: 'deductiveReasoning',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const rng = new SeededRng(config.seed);
    const size = config.level >= 2 ? 7 : 6;
    const total = size * size;
    const mineCount = config.level >= 2 ? 8 : 5;

    let mines = new Set<number>();
    const revealed = new Array<boolean>(total).fill(false);
    const flagged = new Array<boolean>(total).fill(false);
    let initialized = false;
    let flagMode = false;
    let lastTapMs = performance.now();
    const trials: TrialRecord[] = [];
    let disposed = false;

    function neighbors(idx: number): number[] {
      const r = Math.floor(idx / size);
      const c = idx % size;
      const out: number[] = [];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
            out.push(nr * size + nc);
          }
        }
      }
      return out;
    }

    function countAdjMines(idx: number): number {
      return neighbors(idx).filter((n) => mines.has(n)).length;
    }

    function placeMinesSafeFirstClick(safeIdx: number): void {
      const forbidden = new Set([safeIdx, ...neighbors(safeIdx)]);
      const candidates = rng.shuffle(Array.from({ length: total }, (_, i) => i).filter((i) => !forbidden.has(i)));
      mines = new Set(candidates.slice(0, mineCount));
      initialized = true;
    }

    function floodReveal(startIdx: number): void {
      const queue = [startIdx];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        if (revealed[cur] || flagged[cur]) continue;
        revealed[cur] = true;
        if (countAdjMines(cur) === 0) {
          for (const n of neighbors(cur)) {
            if (!revealed[n] && !mines.has(n)) queue.push(n);
          }
        }
      }
    }

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const visualTimer = new VisualTimer('探索進度');
    const boardHost = document.createElement('div');
    const modeHost = document.createElement('div');
    modeHost.className = 'mode-row';
    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(boardHost);
    wrapper.appendChild(modeHost);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    function render(): void {
      if (disposed) return;
      const safeTotal = total - mineCount;
      const safeRevealed = revealed.filter((v, i) => v && !mines.has(i)).length;
      visualTimer.setProgress(safeTotal > 0 ? safeRevealed / safeTotal : 0);

      header.innerHTML = `
        <div class="stage-meta">
          <span class="badge">${size}×${size} 星區</span>
          <span class="badge">休眠星塵：${mineCount} 顆</span>
        </div>
      `;

      const cells = Array.from({ length: total }, (_, idx) => {
        const isRev = revealed[idx];
        const isFlag = flagged[idx];
        const isMine = mines.has(idx);
        const adj = isRev && !isMine ? countAdjMines(idx) : 0;
        return `
          <button type="button"
            class="mine-cell ${isRev ? 'is-rev' : ''} ${isFlag ? 'is-flag' : ''} ${isRev && isMine ? 'is-mine' : ''}"
            data-idx="${idx}"
            aria-label="第 ${idx + 1} 格">
            ${isRev ? (isMine ? '✨' : adj > 0 ? adj : '') : isFlag ? '🚩' : ''}
          </button>
        `;
      }).join('');

      boardHost.innerHTML = `
        <div class="mine-grid" style="grid-template-columns: repeat(${size}, 48px);">
          ${cells}
        </div>
      `;

      modeHost.innerHTML = `
        <button type="button" class="btn ${!flagMode ? 'btn-primary' : 'btn-outline'}" id="mine-dig">⛏️ 翻開安全格</button>
        <button type="button" class="btn ${flagMode ? 'btn-primary' : 'btn-outline'}" id="mine-flag">🚩 插旗標記</button>
      `;

      modeHost.querySelector('#mine-dig')?.addEventListener('click', () => {
        flagMode = false;
        render();
      });
      modeHost.querySelector('#mine-flag')?.addEventListener('click', () => {
        flagMode = true;
        render();
      });

      boardHost.querySelectorAll<HTMLButtonElement>('.mine-cell').forEach((btn) => {
        btn.addEventListener('click', () => {
          handleCellTap(Number(btn.dataset.idx));
        });
      });
    }

    function handleCellTap(idx: number): void {
      if (disposed || revealed[idx]) return;
      audioGateway.unlock();
      const now = performance.now();
      const rtMs = Math.round(now - lastTapMs);
      lastTapMs = now;

      if (flagMode) {
        flagged[idx] = !flagged[idx];
        audioGateway.playPentatonic(2);
        render();
        return;
      }

      if (flagged[idx]) return;
      if (!initialized) {
        placeMinesSafeFirstClick(idx);
      }

      if (mines.has(idx)) {
        audioGateway.playTone('gentle');
        revealed[idx] = true;
        trials.push({ isTarget: true, correct: false, rtMs, errorType: 'rule' });
        statusLine.textContent = '哎呀，這格是休眠星塵！再觀察一下周圍數字喔';
        render();
        return;
      }

      floodReveal(idx);
      audioGateway.playPentatonic(trials.length);
      trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
      render();

      const safeTotal = total - mineCount;
      const safeRevealed = revealed.filter((v, i) => v && !mines.has(i)).length;
      if (safeRevealed >= safeTotal) {
        audioGateway.playTone('complete');
        const metrics = computeSessionMetrics(trials);
        config.onSessionComplete({
          gameId: 'minesweeper',
          ageTier: 'middle',
          seed: config.seed,
          level: config.level,
          metrics,
          axisScores: {
            attentionStability: metrics.asi,
            deductiveReasoning: Math.round(metrics.accuracy * 100),
          },
        });
      }
    }

    render();
    statusLine.textContent = '第一格保證安全！先翻開一格開始推論';

    if (config.showTutorial) {
      const svg = `<div style="font-size:0.95rem;font-weight:600;color:#0072B2;">數字 1 代表周圍 8 格有 1 顆星塵，用 🚩 標記出來！</div>`;
      const overlay = createTutorialOverlay('根據數字推論哪裡安全、哪裡是星塵', svg, () => {
        audioGateway.unlock();
        lastTapMs = performance.now();
      });
      wrapper.appendChild(overlay);
    }

    return () => {
      disposed = true;
    };
  },
};
