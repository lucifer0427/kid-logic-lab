import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { SeededRng } from '../../worker/prng';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

interface HitoriPuzzle {
  numbers: number[]; // 16 cells (4x4)
  shaded: boolean[]; // 16 cells, true = must be shaded black
}

// Verified 4x4 Hitori puzzles (no adjacent shaded, all white cells connected, no duplicate white per row/col)
const HITORI_PUZZLES: readonly HitoriPuzzle[] = [
  {
    numbers: [
      1, 2, 3, 2,
      2, 1, 4, 3,
      3, 4, 2, 1,
      4, 3, 1, 1,
    ],
    // Row 0 has two 2s: shade (0,3)=2; Row 3 has two 1s: shade (3,3)=1? Wait: (0,3) and (3,3) not adjacent!
    // Check Col 3: remaining are (1,3)=3, (2,3)=1 -> distinct!
    // Check Col 0: 1,2,3,4; Col 1: 2,1,4,3; Col 2: 3,4,2,1! All distinct and white connected!
    shaded: [
      false, false, false, true,
      false, false, false, false,
      false, false, false, false,
      false, false, false, true,
    ],
  },
  {
    numbers: [
      4, 1, 2, 3,
      1, 4, 3, 2,
      2, 3, 1, 1,
      3, 2, 4, 4,
    ],
    // Row 2 has two 1s -> shade (2,2)=1? Then Col 2 has 2,3,4. Row 3 has two 4s -> shade (3,3)=4?
    // Wait: (2,2) and (3,3) are diagonal (valid!), Col 2 has 2,3,4, Col 3 has 3,2,1!
    shaded: [
      false, false, false, false,
      false, false, false, false,
      false, false, true, false,
      false, false, false, true,
    ],
  },
];

export const hitoriGame: GameModule = {
  id: 'hitori',
  title: '數字消除（Hitori）',
  subtitle: '點擊重複的數字將它塗黑消除，使每行每列無重複數字，且黑格不可上下左右相鄰！',
  ageTier: 'senior',
  ageLabel: '高年級 10–12 歲',
  evidenceBadge: '多重約束排除（Hitori）',
  primaryAxis: 'deductiveReasoning',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const rng = new SeededRng(config.seed);
    const puzzle = HITORI_PUZZLES[rng.int(0, HITORI_PUZZLES.length - 1)];
    const userShaded = new Array<boolean>(16).fill(false);
    const trials: TrialRecord[] = [];
    let lastTapMs = performance.now();
    let disposed = false;

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const visualTimer = new VisualTimer('消除進度');
    const boardHost = document.createElement('div');
    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(boardHost);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    function hasAdjacentShade(): boolean {
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          if (!userShaded[r * 4 + c]) continue;
          if (r + 1 < 4 && userShaded[(r + 1) * 4 + c]) return true;
          if (c + 1 < 4 && userShaded[r * 4 + c + 1]) return true;
        }
      }
      return false;
    }

    function hasDuplicateWhites(): boolean {
      for (let r = 0; r < 4; r++) {
        const rowSeen = new Set<number>();
        const colSeen = new Set<number>();
        for (let c = 0; c < 4; c++) {
          if (!userShaded[r * 4 + c]) {
            const v = puzzle.numbers[r * 4 + c];
            if (rowSeen.has(v)) return true;
            rowSeen.add(v);
          }
          if (!userShaded[c * 4 + r]) {
            const v = puzzle.numbers[c * 4 + r];
            if (colSeen.has(v)) return true;
            colSeen.add(v);
          }
        }
      }
      return false;
    }

    function areWhiteCellsConnected(): boolean {
      const firstWhite = userShaded.findIndex((s) => !s);
      if (firstWhite === -1) return false;
      const whiteTotal = userShaded.filter((s) => !s).length;
      const seen = new Set<number>([firstWhite]);
      const queue = [firstWhite];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        const r = Math.floor(cur / 4);
        const c = cur % 4;
        for (const [nr, nc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
          if (nr >= 0 && nr < 4 && nc >= 0 && nc < 4) {
            const nIdx = nr * 4 + nc;
            if (!userShaded[nIdx] && !seen.has(nIdx)) {
              seen.add(nIdx);
              queue.push(nIdx);
            }
          }
        }
      }
      return seen.size === whiteTotal;
    }

    function render(): void {
      if (disposed) return;
      const targetShades = puzzle.shaded.filter(Boolean).length;
      const currentShades = userShaded.filter(Boolean).length;
      visualTimer.setProgress(Math.min(1, currentShades / Math.max(1, targetShades)));

      header.innerHTML = `<div class="stage-meta"><span class="badge">4×4 Hitori 消除</span></div>`;

      boardHost.innerHTML = `
        <div class="latin-grid" style="grid-template-columns: repeat(4, 58px);">
          ${puzzle.numbers
            .map((num, idx) => {
              const shaded = userShaded[idx];
              return `
              <button type="button" class="latin-cell ${shaded ? 'is-hitori-shaded' : ''}"
                style="width:58px;height:58px;font-size:1.3rem;font-weight:700;"
                data-idx="${idx}">
                ${num}
              </button>
            `;
            })
            .join('')}
        </div>
      `;

      boardHost.querySelectorAll<HTMLButtonElement>('.latin-cell').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (disposed) return;
          audioGateway.unlock();
          const idx = Number(btn.dataset.idx);
          userShaded[idx] = !userShaded[idx];
          const rtMs = Math.round(performance.now() - lastTapMs);
          lastTapMs = performance.now();

          if (hasAdjacentShade()) {
            audioGateway.playTone('gentle');
            trials.push({ isTarget: true, correct: false, rtMs, errorType: 'rule' });
            statusLine.textContent = '塗黑的格子不能上下左右相鄰喔！';
          } else {
            audioGateway.playPentatonic(idx);
            trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
            statusLine.textContent = '繼續檢查每行每列是否還有重複數字';
          }
          render();

          if (!hasAdjacentShade() && !hasDuplicateWhites() && areWhiteCellsConnected()) {
            audioGateway.playTone('complete');
            const metrics = computeSessionMetrics(trials);
            config.onSessionComplete({
              gameId: 'hitori',
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
    statusLine.textContent = '找出每行每列重複出現的數字，點一下將它塗黑消除！';

    if (config.showTutorial) {
      const svg = `<div style="font-size:0.95rem;font-weight:600;color:#0072B2;">把多出來的重複數字塗黑，且兩個黑格不能貼在一起！</div>`;
      const overlay = createTutorialOverlay('消除重複數字，遵守黑格不相鄰規則', svg, () => {
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
