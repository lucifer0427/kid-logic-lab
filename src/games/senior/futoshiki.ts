import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { SeededRng } from '../../worker/prng';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

interface Inequality {
  a: number; // cell index a > b
  b: number;
}

interface FutoshikiPuzzle {
  given: number[]; // 16 cells (0 = blank)
  solution: number[];
  greaterThans: Inequality[]; // cell[a] > cell[b]
}

const VERIFIED_FUTOSHIKI: readonly FutoshikiPuzzle[] = [
  {
    given: [
      0, 0, 0, 4,
      0, 0, 0, 0,
      0, 0, 0, 0,
      1, 0, 0, 0,
    ],
    solution: [
      2, 3, 1, 4,
      4, 1, 2, 3,
      3, 2, 4, 1,
      1, 4, 3, 2,
    ],
    greaterThans: [
      { a: 1, b: 2 },   // 3 > 1
      { a: 4, b: 0 },   // 4 > 2
      { a: 4, b: 5 },   // 4 > 1
      { a: 10, b: 11 }, // 4 > 1
      { a: 13, b: 9 },  // 4 > 2
    ],
  },
  {
    given: [
      0, 0, 0, 0,
      0, 3, 0, 0,
      0, 0, 3, 0,
      0, 0, 0, 1,
    ],
    solution: [
      1, 2, 4, 3,
      2, 3, 1, 4,
      4, 1, 3, 2,
      3, 4, 2, 1,
    ],
    greaterThans: [
      { a: 2, b: 3 },   // 4 > 3
      { a: 7, b: 6 },   // 4 > 1
      { a: 8, b: 4 },   // 4 > 2
      { a: 13, b: 14 }, // 4 > 2
    ],
  },
];

export const futoshikiGame: GameModule = {
  id: 'futoshiki',
  title: '不等號數獨（Futoshiki）',
  subtitle: '每行每列填入 1–4 不重複，並同時遵守格子間的「＞ / ＜」大小關係！',
  ageTier: 'senior',
  ageLabel: '高年級 10–12 歲',
  evidenceBadge: '數值傳遞演繹（Futoshiki）',
  primaryAxis: 'deductiveReasoning',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const rng = new SeededRng(config.seed);
    const puzzle = VERIFIED_FUTOSHIKI[rng.int(0, VERIFIED_FUTOSHIKI.length - 1)];
    const grid = [...puzzle.given];
    const fixed = puzzle.given.map((v) => v !== 0);
    let selectedIdx: number | null = null;
    const trials: TrialRecord[] = [];
    let lastTapMs = performance.now();
    let disposed = false;

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const visualTimer = new VisualTimer('推演進度');
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

    function hasConflict(idx: number, val: number): boolean {
      if (val === 0) return false;
      const r = Math.floor(idx / 4);
      const c = idx % 4;
      for (let i = 0; i < 4; i++) {
        if (r * 4 + i !== idx && grid[r * 4 + i] === val) return true;
        if (i * 4 + c !== idx && grid[i * 4 + c] === val) return true;
      }
      for (const gt of puzzle.greaterThans) {
        if (gt.a === idx && grid[gt.b] !== 0 && val <= grid[gt.b]) return true;
        if (gt.b === idx && grid[gt.a] !== 0 && grid[gt.a] <= val) return true;
      }
      return false;
    }

    function horizSign(r: number, c: number): string {
      const left = r * 4 + c;
      const right = r * 4 + c + 1;
      if (puzzle.greaterThans.some((g) => g.a === left && g.b === right)) return '＞';
      if (puzzle.greaterThans.some((g) => g.a === right && g.b === left)) return '＜';
      return '';
    }

    function vertSign(r: number, c: number): string {
      const top = r * 4 + c;
      const bot = (r + 1) * 4 + c;
      if (puzzle.greaterThans.some((g) => g.a === top && g.b === bot)) return '∨';
      if (puzzle.greaterThans.some((g) => g.a === bot && g.b === top)) return '∧';
      return '';
    }

    function render(): void {
      if (disposed) return;
      const totalBlanks = fixed.filter((f) => !f).length;
      const filled = grid.filter((v, i) => !fixed[i] && v !== 0 && !hasConflict(i, v)).length;
      visualTimer.setProgress(totalBlanks > 0 ? filled / totalBlanks : 1);

      header.innerHTML = `<div class="stage-meta"><span class="badge">4×4 不等號數獨</span></div>`;

      const rowsHtml: string[] = [];
      for (let r = 0; r < 4; r++) {
        const cellRow: string[] = [];
        for (let c = 0; c < 4; c++) {
          const idx = r * 4 + c;
          const v = grid[idx];
          const conflict = v !== 0 && hasConflict(idx, v);
          cellRow.push(`
            <button type="button"
              class="futo-cell ${fixed[idx] ? 'is-fixed' : ''} ${selectedIdx === idx ? 'is-selected' : ''} ${conflict ? 'is-conflict' : ''}"
              data-idx="${idx}">
              ${v === 0 ? '' : v}
            </button>
          `);
          if (c < 3) {
            cellRow.push(`<div class="futo-sign">${horizSign(r, c)}</div>`);
          }
        }
        rowsHtml.push(`<div class="futo-row">${cellRow.join('')}</div>`);
        if (r < 3) {
          const vSigns = [0, 1, 2, 3].map((c) => `<div class="futo-vsign">${vertSign(r, c)}</div><div class="futo-gap"></div>`).slice(0, 7).join('');
          rowsHtml.push(`<div class="futo-vrow">${vSigns}</div>`);
        }
      }

      boardHost.innerHTML = `<div class="futo-board">${rowsHtml.join('')}</div>`;
      boardHost.querySelectorAll<HTMLButtonElement>('.futo-cell').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.dataset.idx);
          if (!fixed[idx]) {
            selectedIdx = idx;
            render();
          }
        });
      });

      pickerHost.innerHTML = `
        ${[1, 2, 3, 4].map((n) => `<button type="button" class="btn num-btn" data-n="${n}">${n}</button>`).join('')}
        <button type="button" class="btn btn-outline" id="futo-clear">清除</button>
      `;

      pickerHost.querySelectorAll<HTMLButtonElement>('.num-btn').forEach((btn) => {
        btn.addEventListener('click', () => applyNum(Number(btn.dataset.n)));
      });
      pickerHost.querySelector('#futo-clear')?.addEventListener('click', () => applyNum(0));
    }

    function applyNum(n: number): void {
      if (disposed || selectedIdx === null || fixed[selectedIdx]) return;
      audioGateway.unlock();
      const rtMs = Math.round(performance.now() - lastTapMs);
      lastTapMs = performance.now();

      grid[selectedIdx] = n;
      if (n !== 0) {
        if (hasConflict(selectedIdx, n)) {
          audioGateway.playTone('gentle');
          trials.push({ isTarget: true, correct: false, rtMs, errorType: 'rule' });
          statusLine.textContent = '違反行／列不重複或不等號方向喔！';
        } else {
          audioGateway.playPentatonic(n);
          trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
          statusLine.textContent = '符合所有大小與不重複條件！';
        }
      }
      render();

      const solved = grid.every((v, i) => v !== 0 && !hasConflict(i, v));
      if (solved) {
        audioGateway.playTone('complete');
        const metrics = computeSessionMetrics(trials);
        config.onSessionComplete({
          gameId: 'futoshiki',
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
    }

    render();
    statusLine.textContent = '點選空格後填入 1–4，同時滿足不等號大小關係！';

    if (config.showTutorial) {
      const svg = `<div style="font-size:0.95rem;font-weight:600;color:#0072B2;">開口大的那邊數字大（4 ＞ 1），每行每列 1–4 不重複！</div>`;
      const overlay = createTutorialOverlay('利用不等號與排除法填滿 4×4 方陣', svg, () => {
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
