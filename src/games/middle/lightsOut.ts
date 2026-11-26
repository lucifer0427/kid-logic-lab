import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { StaircaseController } from '../../engine/dda/staircase';
import { SeededRng } from '../../worker/prng';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

export function toggleLightsGrid(grid: boolean[], size: number, idx: number): boolean[] {
  const next = [...grid];
  const r = Math.floor(idx / size);
  const c = idx % size;
  const dirs = [
    [0, 0],
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  for (const [dr, dc] of dirs) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
      const nIdx = nr * size + nc;
      next[nIdx] = !next[nIdx];
    }
  }
  return next;
}

export function generateLightsOutPuzzle(seed: number, level: number): { size: number; grid: boolean[]; minTaps: number } {
  const rng = new SeededRng(seed);
  const size = level >= 2 ? 4 : 3;
  let grid = new Array<boolean>(size * size).fill(false);

  // Apply K distinct random toggles from solved state so puzzle is 100% guaranteed solvable
  const numTaps = Math.min(size * size - 1, 2 + level * 2);
  const picks = rng.shuffle(Array.from({ length: size * size }, (_, i) => i)).slice(0, numTaps);
  for (const idx of picks) {
    grid = toggleLightsGrid(grid, size, idx);
  }
  // Ensure at least one light is on
  if (grid.every((v) => !v)) {
    grid = toggleLightsGrid(grid, size, 0);
  }
  return { size, grid, minTaps: picks.length };
}

export const lightsOutGame: GameModule = {
  id: 'lightsOut',
  title: '點燈關燈謎題',
  subtitle: '點一格會同時翻轉自己與上下左右四個鄰居，把全部燈泡變成熄滅（○）就過關',
  ageTier: 'middle',
  ageLabel: '中年級 8–10 歲',
  evidenceBadge: '經典邏輯謎題（狀態翻轉與逆向推演）',
  primaryAxis: 'strategicPlanning',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const staircase = new StaircaseController({
      initialLevel: config.level,
      minLevel: 1,
      maxLevel: 3,
    });

    const initial = generateLightsOutPuzzle(config.seed, staircase.currentLevel);
    let grid = [...initial.grid];
    let moves = 0;
    let lastTapMs = performance.now();
    const trials: TrialRecord[] = [];
    let disposed = false;

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const visualTimer = new VisualTimer('關燈進度');
    const boardHost = document.createElement('div');
    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'btn btn-outline';
    resetBtn.textContent = '↺ 重新開始這關';
    resetBtn.addEventListener('pointerdown', () => {
      grid = [...initial.grid];
      moves = 0;
      statusLine.textContent = '已重置盤面，想想看從哪一格開始點！';
      render();
    });

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(boardHost);
    wrapper.appendChild(resetBtn);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    function render(): void {
      if (disposed) return;
      const offCount = grid.filter((v) => !v).length;
      visualTimer.setProgress(offCount / grid.length);

      header.innerHTML = `
        <div class="stage-meta">
          <span class="badge">${initial.size}×${initial.size} 盤面</span>
          <span class="badge">已點 ${moves} 步（參考解法 ${initial.minTaps} 步）</span>
        </div>
      `;

      const cells = grid
        .map((isOn, idx) => {
          return `
            <button type="button"
              class="lights-cell ${isOn ? 'is-on' : 'is-off'}"
              data-idx="${idx}"
              aria-label="第 ${idx + 1} 格，目前${isOn ? '亮燈' : '熄滅'}">
              ${isOn ? '●' : '○'}
            </button>
          `;
        })
        .join('');

      boardHost.innerHTML = `
        <div class="lights-grid" style="grid-template-columns: repeat(${initial.size}, 66px);">
          ${cells}
        </div>
      `;

      boardHost.querySelectorAll<HTMLButtonElement>('.lights-cell').forEach((btn) => {
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          audioGateway.unlock();
          const idx = Number(btn.dataset.idx);
          const now = performance.now();
          const rtMs = Math.round(now - lastTapMs);
          lastTapMs = now;

          grid = toggleLightsGrid(grid, initial.size, idx);
          moves += 1;
          audioGateway.playPentatonic(moves);
          trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
          render();

          if (grid.every((v) => !v)) {
            audioGateway.playTone('complete');
            const efficiency = Math.min(1, initial.minTaps / Math.max(1, moves));
            staircase.record(efficiency >= 0.7);
            const metrics = computeSessionMetrics(trials);
            config.onSessionComplete({
              gameId: 'lightsOut',
              ageTier: 'middle',
              seed: config.seed,
              level: staircase.currentLevel,
              metrics,
              axisScores: {
                attentionStability: metrics.asi,
                strategicPlanning: Math.round(efficiency * 100),
              },
            });
          }
        });
      });
    }

    render();
    statusLine.textContent = '把所有藍色亮燈（●）都關掉（○）就過關囉！';

    if (config.showTutorial) {
      const svg = `<div style="font-size:0.95rem;font-weight:600;color:#0072B2;">點一格會翻轉「十字五格」的亮暗狀態</div>`;
      const overlay = createTutorialOverlay('利用對稱與逆向思考，把全部燈關掉', svg, () => {
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
