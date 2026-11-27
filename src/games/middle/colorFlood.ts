import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { SeededRng } from '../../worker/prng';
import { OKABE_ITO_PALETTE } from '../../ui/theme/okabeIto';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

const SIZE = 6;
const COLORS = 4;

export function floodFillGrid(grid: number[], size: number, newColor: number): number[] {
  const oldColor = grid[0];
  if (oldColor === newColor) return [...grid];
  const next = [...grid];
  const queue = [0];
  const seen = new Set<number>([0]);

  while (queue.length > 0) {
    const idx = queue.shift()!;
    next[idx] = newColor;
    const r = Math.floor(idx / size);
    const c = idx % size;
    const neighbors = [
      [r - 1, c],
      [r + 1, c],
      [r, c - 1],
      [r, c + 1],
    ];
    for (const [nr, nc] of neighbors) {
      if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
        const nIdx = nr * size + nc;
        if (!seen.has(nIdx) && next[nIdx] === oldColor) {
          seen.add(nIdx);
          queue.push(nIdx);
        }
      }
    }
  }
  return next;
}

export const colorFloodGame: GameModule = {
  id: 'colorFlood',
  title: '色彩擴散大師',
  subtitle: '從左上角開始，每次選一種顏色合併相鄰色塊，把整張棋盤統一成同一種顏色！',
  ageTier: 'middle',
  ageLabel: '中年級 8–10 歲',
  evidenceBadge: '貪婪與全域覆蓋策略（Flood Fill）',
  primaryAxis: 'strategicPlanning',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const rng = new SeededRng(config.seed);
    let grid = Array.from({ length: SIZE * SIZE }, () => rng.int(0, COLORS - 1));
    let moves = 0;
    const maxMoves = 14;
    const trials: TrialRecord[] = [];
    let lastTapMs = performance.now();
    let disposed = false;

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const visualTimer = new VisualTimer('統一進度');
    const boardHost = document.createElement('div');
    const pickerHost = document.createElement('div');
    pickerHost.className = 'numpad-row';
    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(boardHost);
    wrapper.appendChild(pickerHost);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    function render(): void {
      if (disposed) return;
      const baseColor = grid[0];
      const sameCount = grid.filter((c) => c === baseColor).length;
      visualTimer.setProgress(sameCount / (SIZE * SIZE));

      header.innerHTML = `
        <div class="stage-meta">
          <span class="badge">步數：${moves} / ${maxMoves}</span>
          <span class="badge">已統一 ${sameCount} / ${SIZE * SIZE} 格</span>
        </div>
      `;

      boardHost.innerHTML = `
        <div class="flood-grid" style="grid-template-columns: repeat(${SIZE}, 44px);">
          ${grid
            .map(
              (cIdx, i) =>
                `<div class="flood-cell ${i === 0 ? 'is-origin' : ''}" style="background:${OKABE_ITO_PALETTE[cIdx].hex};">${i === 0 ? '★' : ''}</div>`,
            )
            .join('')}
        </div>
      `;

      pickerHost.innerHTML = Array.from({ length: COLORS }, (_, cIdx) => {
        const tok = OKABE_ITO_PALETTE[cIdx];
        return `
          <button type="button" class="btn btn-outline flood-pick" data-c="${cIdx}"
            style="background:${tok.hex};color:#FFFFFF;border-color:#0F172A;"
            ${cIdx === baseColor ? 'disabled' : ''}>
            ${tok.nameZh.slice(0, 2)}
          </button>
        `;
      }).join('');

      pickerHost.querySelectorAll<HTMLButtonElement>('.flood-pick').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (disposed) return;
          audioGateway.unlock();
          const chosen = Number(btn.dataset.c);
          const rtMs = Math.round(performance.now() - lastTapMs);
          lastTapMs = performance.now();

          grid = floodFillGrid(grid, SIZE, chosen);
          moves += 1;
          audioGateway.playPentatonic(moves);
          trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
          render();

          if (grid.every((c) => c === grid[0]) || moves >= maxMoves) {
            const won = grid.every((c) => c === grid[0]);
            audioGateway.playTone(won ? 'complete' : 'gentle');
            const metrics = computeSessionMetrics(trials);
            config.onSessionComplete({
              gameId: 'colorFlood',
              ageTier: 'middle',
              seed: config.seed,
              level: config.level,
              metrics: won ? metrics : { ...metrics, accuracy: 0.6 },
              axisScores: {
                attentionStability: metrics.asi,
                strategicPlanning: won ? Math.max(60, Math.round((1 - moves / (maxMoves + 4)) * 100)) : 55,
              },
            });
          }
        });
      });
    }

    render();
    statusLine.textContent = '從左上角 ★ 開始，選顏色讓相同區塊越變越大！';

    if (config.showTutorial) {
      const svg = `<div style="font-size:0.95rem;font-weight:600;color:#0072B2;">優先選能吃掉最多相鄰格子的顏色，步數更省！</div>`;
      const overlay = createTutorialOverlay('在 14 步內把整張圖變成同一種顏色', svg, () => {
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
