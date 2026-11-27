import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { SeededRng } from '../../worker/prng';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

interface PathPuzzle {
  size: number;
  waypoints: number[]; // cell indices for 1, 2, 3, 4...
}

// Guaranteed-valid Hamiltonian-friendly waypoint puzzles on 4x4
const PATH_PUZZLES: readonly PathPuzzle[] = [
  { size: 4, waypoints: [0, 3, 15, 12] },  // Snake around perimeter or inner
  { size: 4, waypoints: [0, 5, 10, 15] },  // Diagonal checkpoints
  { size: 4, waypoints: [12, 8, 9, 3] },   // Bottom-left to top-right
  { size: 4, waypoints: [2, 6, 14, 12] },
];

export const pathFinderGame: GameModule = {
  id: 'pathFinder',
  title: '數字接龍路徑',
  subtitle: '從起點 1 出發，每次走上下左右相鄰一格，依序經過 2 → 3 → 4 不重複！',
  ageTier: 'middle',
  ageLabel: '中年級 8–10 歲',
  evidenceBadge: '空間序列規劃（Numberlink）',
  primaryAxis: 'strategicPlanning',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const rng = new SeededRng(config.seed);
    const puzzle = PATH_PUZZLES[rng.int(0, PATH_PUZZLES.length - 1)];
    const path: number[] = [puzzle.waypoints[0]];
    const trials: TrialRecord[] = [];
    let lastTapMs = performance.now();
    let disposed = false;

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const visualTimer = new VisualTimer('接龍進度');
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

    function isAdjacent(a: number, b: number): boolean {
      const r1 = Math.floor(a / puzzle.size);
      const c1 = a % puzzle.size;
      const r2 = Math.floor(b / puzzle.size);
      const c2 = b % puzzle.size;
      return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
    }

    function nextExpectedWaypointIdx(): number {
      let nextWp = 1;
      for (const cell of path) {
        if (nextWp < puzzle.waypoints.length && cell === puzzle.waypoints[nextWp]) {
          nextWp += 1;
        }
      }
      return nextWp;
    }

    function render(): void {
      if (disposed) return;
      const nextWp = nextExpectedWaypointIdx();
      visualTimer.setProgress((nextWp - 1) / (puzzle.waypoints.length - 1));

      header.innerHTML = `
        <div class="stage-meta">
          <span class="badge">目標：依序連到 ${puzzle.waypoints.length}</span>
          <span class="badge">目前步數：${path.length - 1}</span>
        </div>
      `;

      const head = path[path.length - 1];
      const cells = Array.from({ length: puzzle.size * puzzle.size }, (_, idx) => {
        const wpIdx = puzzle.waypoints.indexOf(idx);
        const inPath = path.includes(idx);
        const isHead = idx === head;
        const canStep = !inPath && isAdjacent(head, idx);
        return `
          <button type="button"
            class="maze-cell ${inPath ? 'is-visited' : ''} ${isHead ? 'is-head' : ''} ${canStep ? 'is-steppable' : ''}"
            data-idx="${idx}"
            aria-label="第 ${idx + 1} 格">
            ${wpIdx !== -1 ? `<strong>${wpIdx + 1}</strong>` : isHead ? '●' : inPath ? '·' : ''}
          </button>
        `;
      }).join('');

      boardHost.innerHTML = `
        <div class="maze-grid" style="grid-template-columns: repeat(${puzzle.size}, 58px);">
          ${cells}
        </div>
      `;

      controlsHost.innerHTML = `
        <button type="button" class="btn btn-outline" id="pf-undo">↩ 退回一步</button>
        <button type="button" class="btn btn-outline" id="pf-reset">↺ 重新開始</button>
      `;

      controlsHost.querySelector('#pf-undo')?.addEventListener('click', () => {
        if (path.length > 1) {
          path.pop();
          render();
        }
      });
      controlsHost.querySelector('#pf-reset')?.addEventListener('click', () => {
        path.length = 1;
        render();
      });

      boardHost.querySelectorAll<HTMLButtonElement>('.maze-cell').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.dataset.idx);
          handleCellClick(idx);
        });
      });
    }

    function handleCellClick(idx: number): void {
      if (disposed) return;
      audioGateway.unlock();
      const head = path[path.length - 1];
      if (!isAdjacent(head, idx) || path.includes(idx)) return;

      const rtMs = Math.round(performance.now() - lastTapMs);
      lastTapMs = performance.now();

      const wpIdx = puzzle.waypoints.indexOf(idx);
      const expectedWp = nextExpectedWaypointIdx();
      if (wpIdx !== -1 && wpIdx !== expectedWp) {
        audioGateway.playTone('gentle');
        trials.push({ isTarget: true, correct: false, rtMs, errorType: 'rule' });
        statusLine.textContent = `順序不對喔！下一個應該先經過數字 ${expectedWp + 1}`;
        return;
      }

      path.push(idx);
      audioGateway.playPentatonic(path.length);
      trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
      render();

      if (nextExpectedWaypointIdx() >= puzzle.waypoints.length) {
        audioGateway.playTone('complete');
        const metrics = computeSessionMetrics(trials);
        config.onSessionComplete({
          gameId: 'pathFinder',
          ageTier: 'middle',
          seed: config.seed,
          level: config.level,
          metrics,
          axisScores: {
            attentionStability: metrics.asi,
            strategicPlanning: Math.round(metrics.accuracy * 100),
          },
        });
      }
    }

    render();
    statusLine.textContent = '點擊相鄰的格子，從 1 依序走到最後一個數字！';

    if (config.showTutorial) {
      const svg = `<div style="font-size:0.95rem;font-weight:600;color:#0072B2;">從 1 出發 → 2 → 3 → 4，不能跳格或走重複的路！</div>`;
      const overlay = createTutorialOverlay('規劃路線，從 1 依序連到最後一個數字', svg, () => {
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
