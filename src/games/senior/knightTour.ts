import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { SeededRng } from '../../worker/prng';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

const SIZE = 5;
const TOTAL_CELLS = SIZE * SIZE;

export function isKnightMove(fromIdx: number, toIdx: number): boolean {
  const r1 = Math.floor(fromIdx / SIZE);
  const c1 = fromIdx % SIZE;
  const r2 = Math.floor(toIdx / SIZE);
  const c2 = toIdx % SIZE;
  const dr = Math.abs(r1 - r2);
  const dc = Math.abs(c1 - c2);
  return (dr === 1 && dc === 2) || (dr === 2 && dc === 1);
}

export const knightTourGame: GameModule = {
  id: 'knightTour',
  title: '騎士巡邏棋盤',
  subtitle: '西洋棋騎士走「日」字格，從起點出發走遍 5×5 棋盤不重複（可退回一步調整）',
  ageTier: 'senior',
  ageLabel: '高年級 10–12 歲',
  evidenceBadge: '深度前瞻與回溯規劃（Knight’s Tour）',
  primaryAxis: 'strategicPlanning',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const rng = new SeededRng(config.seed);
    // Start at center (12) or corner (0, 4, 20, 24) which always admit full 25-cell Knight's Tours
    const validStarts = [0, 4, 12, 20, 24];
    const startIdx = validStarts[rng.int(0, validStarts.length - 1)];
    const path: number[] = [startIdx];
    const trials: TrialRecord[] = [];
    let lastTapMs = performance.now();
    let disposed = false;

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const visualTimer = new VisualTimer('巡邏進度');
    const boardHost = document.createElement('div');
    const controlsHost = document.createElement('div');
    controlsHost.className = 'mode-row';
    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(boardHost);
    wrapper.appendChild(controlsHost);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    function render(): void {
      if (disposed) return;
      visualTimer.setProgress(path.length / TOTAL_CELLS);

      const head = path[path.length - 1];
      const legalMoves = Array.from({ length: TOTAL_CELLS }, (_, i) => i).filter(
        (i) => !path.includes(i) && isKnightMove(head, i),
      );

      header.innerHTML = `
        <div class="stage-meta">
          <span class="badge">5×5 騎士巡邏</span>
          <span class="badge">已走訪 ${path.length} / ${TOTAL_CELLS} 格</span>
        </div>
      `;

      const cells = Array.from({ length: TOTAL_CELLS }, (_, idx) => {
        const stepOrder = path.indexOf(idx);
        const visited = stepOrder !== -1;
        const isHead = idx === head;
        const isLegal = legalMoves.includes(idx);
        const checker = (Math.floor(idx / SIZE) + (idx % SIZE)) % 2 === 1;
        return `
          <button type="button"
            class="knight-cell ${checker ? 'is-dark' : ''} ${visited ? 'is-visited' : ''} ${isHead ? 'is-head' : ''} ${isLegal ? 'is-legal' : ''}"
            data-idx="${idx}"
            aria-label="第 ${idx + 1} 格">
            ${isHead ? '♞' : visited ? stepOrder + 1 : isLegal ? '·' : ''}
          </button>
        `;
      }).join('');

      boardHost.innerHTML = `
        <div class="maze-grid" style="grid-template-columns: repeat(${SIZE}, 56px);">
          ${cells}
        </div>
      `;

      controlsHost.innerHTML = `
        <button type="button" class="btn btn-outline" id="kt-undo">↩ 退回一步</button>
        <button type="button" class="btn btn-outline" id="kt-reset">↺ 重新開始</button>
      `;

      controlsHost.querySelector('#kt-undo')?.addEventListener('click', () => {
        if (path.length > 1) {
          path.pop();
          statusLine.textContent = '已退回一步，換個方向試試！';
          render();
        }
      });

      controlsHost.querySelector('#kt-reset')?.addEventListener('click', () => {
        path.length = 1;
        statusLine.textContent = '從起點重新規劃騎士巡邏路線';
        render();
      });

      boardHost.querySelectorAll<HTMLButtonElement>('.knight-cell').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.dataset.idx);
          if (!legalMoves.includes(idx) || disposed) return;
          audioGateway.unlock();
          const now = performance.now();
          const rtMs = Math.round(now - lastTapMs);
          lastTapMs = now;

          path.push(idx);
          audioGateway.playPentatonic(path.length);
          trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
          render();

          if (path.length === TOTAL_CELLS) {
            audioGateway.playTone('complete');
            const metrics = computeSessionMetrics(trials);
            config.onSessionComplete({
              gameId: 'knightTour',
              ageTier: 'senior',
              seed: config.seed,
              level: config.level,
              metrics,
              axisScores: {
                attentionStability: metrics.asi,
                strategicPlanning: 100,
              },
            });
          } else {
            const nextHead = path[path.length - 1];
            const nextLegal = Array.from({ length: TOTAL_CELLS }, (_, i) => i).filter(
              (i) => !path.includes(i) && isKnightMove(nextHead, i),
            );
            if (nextLegal.length === 0) {
              statusLine.textContent = '走進死胡同囉！按「↩ 退回一步」調整前幾步（小秘訣：優先走邊角格！）';
            } else {
              statusLine.textContent = `還有 ${nextLegal.length} 個日字步可選`;
            }
          }
        });
      });
    }

    render();
    statusLine.textContent = '點擊標記「·」的合法日字格，挑戰走滿全部 25 格！';

    if (config.showTutorial) {
      const svg = `<div style="font-size:0.95rem;font-weight:600;color:#0072B2;">♞ 騎士走「日」字（直 2 橫 1 或 橫 2 直 1），優先走邊角比較不容易卡住！</div>`;
      const overlay = createTutorialOverlay('不重複走完 5×5 棋盤，善用「退回一步」修正策略', svg, () => {
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
