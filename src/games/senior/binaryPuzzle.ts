import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { SeededRng } from '../../worker/prng';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

// Valid 6x6 Takuzu (Binary Puzzle) solved boards (no 3 consecutive, 3 zeros & 3 ones per row/col, unique rows/cols)
const VALID_TAKUZU_6X6: readonly number[][] = [
  [
    0, 1, 0, 1, 1, 0,
    1, 0, 1, 0, 0, 1,
    1, 1, 0, 0, 1, 0,
    0, 0, 1, 1, 0, 1,
    1, 0, 0, 1, 0, 1,
    0, 1, 1, 0, 1, 0,
  ],
  [
    1, 0, 1, 0, 0, 1,
    0, 1, 0, 1, 1, 0,
    0, 0, 1, 1, 0, 1,
    1, 1, 0, 0, 1, 0,
    0, 1, 1, 0, 1, 0,
    1, 0, 0, 1, 0, 1,
  ],
];

export function isValidTakuzuBoard(board: number[]): boolean {
  for (let r = 0; r < 6; r++) {
    let zeros = 0;
    let ones = 0;
    for (let c = 0; c < 6; c++) {
      const v = board[r * 6 + c];
      if (v === 0) zeros++;
      else if (v === 1) ones++;
      if (c >= 2 && v !== -1 && v === board[r * 6 + c - 1] && v === board[r * 6 + c - 2]) return false;
    }
    if (zeros > 3 || ones > 3) return false;
  }
  for (let c = 0; c < 6; c++) {
    let zeros = 0;
    let ones = 0;
    for (let r = 0; r < 6; r++) {
      const v = board[r * 6 + c];
      if (v === 0) zeros++;
      else if (v === 1) ones++;
      if (r >= 2 && v !== -1 && v === board[(r - 1) * 6 + c] && v === board[(r - 2) * 6 + c]) return false;
    }
    if (zeros > 3 || ones > 3) return false;
  }
  return true;
}

export const binaryPuzzleGame: GameModule = {
  id: 'binaryPuzzle',
  title: '二進位邏輯方陣',
  subtitle: '每行每列只能填 0 與 1（各 3 個），不可連續三個相同，且任意兩行／列不完全相同',
  ageTier: 'senior',
  ageLabel: '高年級 10–12 歲',
  evidenceBadge: '二進位約束推論（Takuzu）',
  primaryAxis: 'deductiveReasoning',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const rng = new SeededRng(config.seed);
    const solution = [...VALID_TAKUZU_6X6[rng.int(0, VALID_TAKUZU_6X6.length - 1)]];
    const blanks = Math.min(20, 14 + config.level * 2);
    const blankIndices = new Set(rng.shuffle(Array.from({ length: 36 }, (_, i) => i)).slice(0, blanks));

    const grid = solution.map((v, i) => (blankIndices.has(i) ? -1 : v));
    const fixed = solution.map((_, i) => !blankIndices.has(i));
    const trials: TrialRecord[] = [];
    let lastTapMs = performance.now();
    let disposed = false;

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const visualTimer = new VisualTimer('解題進度');
    const boardHost = document.createElement('div');
    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(boardHost);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    function render(): void {
      if (disposed) return;
      const totalBlanks = fixed.filter((f) => !f).length;
      const filled = grid.filter((v, i) => !fixed[i] && v !== -1).length;
      visualTimer.setProgress(totalBlanks > 0 ? filled / totalBlanks : 1);

      header.innerHTML = `
        <div class="stage-meta">
          <span class="badge">6×6 二進位方陣</span>
          <span class="badge">種子 #${config.seed}</span>
        </div>
      `;

      const boardValid = isValidTakuzuBoard(grid);
      const cells = grid
        .map((v, idx) => {
          const isFixed = fixed[idx];
          return `
            <button type="button"
              class="sudoku-cell ${isFixed ? 'is-fixed' : ''} ${!boardValid && !isFixed && v !== -1 ? 'is-conflict' : ''}"
              data-idx="${idx}"
              aria-label="第 ${idx + 1} 格">
              ${v === -1 ? '' : v}
            </button>
          `;
        })
        .join('');

      boardHost.innerHTML = `<div class="sudoku-grid">${cells}</div>`;

      boardHost.querySelectorAll<HTMLButtonElement>('.sudoku-cell').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.dataset.idx);
          if (fixed[idx] || disposed) return;
          audioGateway.unlock();
          const now = performance.now();
          const rtMs = Math.round(now - lastTapMs);
          lastTapMs = now;

          // Cycle: -1 -> 0 -> 1 -> -1
          grid[idx] = grid[idx] === -1 ? 0 : grid[idx] === 0 ? 1 : -1;
          if (grid[idx] !== -1) {
            const valid = isValidTakuzuBoard(grid);
            if (valid) {
              audioGateway.playPentatonic(idx);
              trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
              statusLine.textContent = '推論正確！繼續觀察連續兩格或已滿 3 個的行列';
            } else {
              audioGateway.playTone('gentle');
              trials.push({ isTarget: true, correct: false, rtMs, errorType: 'rule' });
              statusLine.textContent = '違反規則囉：不可連續 3 個相同，或該行／列已超過 3 個！';
            }
          }
          render();

          const solved = grid.every((v, i) => v === solution[i]);
          if (solved) {
            audioGateway.playTone('complete');
            const metrics = computeSessionMetrics(trials);
            config.onSessionComplete({
              gameId: 'binaryPuzzle',
              ageTier: 'senior',
              seed: config.seed,
              level: config.level,
              metrics,
              axisScores: {
                attentionStability: metrics.asi,
                deductiveReasoning: Math.round(metrics.accuracy * 100),
              },
            });
          }
        });
      });
    }

    render();
    statusLine.textContent = '點擊空格切換「空白 → 0 → 1」，每行每列各有 3 個 0 與 3 個 1';

    if (config.showTutorial) {
      const svg = `<div style="font-size:0.95rem;font-weight:600;color:#0072B2;">看到 0 0 就知道旁邊一定是 1！每行每列 0 和 1 各三個</div>`;
      const overlay = createTutorialOverlay('利用「不連三」與「各半」規則推導 0 與 1', svg, () => {
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
