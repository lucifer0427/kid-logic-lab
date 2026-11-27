import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { SeededRng } from '../../worker/prng';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

interface NonogramPic {
  name: string;
  emoji: string;
  grid: number[]; // 25 cells (5x5), 1 = filled, 0 = empty
}

const PICS: readonly NonogramPic[] = [
  {
    name: '愛心',
    emoji: '❤️',
    grid: [
      0, 1, 0, 1, 0,
      1, 1, 1, 1, 1,
      1, 1, 1, 1, 1,
      0, 1, 1, 1, 0,
      0, 0, 1, 0, 0,
    ],
  },
  {
    name: '小屋',
    emoji: '🏠',
    grid: [
      0, 0, 1, 0, 0,
      0, 1, 1, 1, 0,
      1, 1, 1, 1, 1,
      0, 1, 0, 1, 0,
      0, 1, 1, 1, 0,
    ],
  },
  {
    name: '小火箭',
    emoji: '🚀',
    grid: [
      0, 0, 1, 0, 0,
      0, 1, 1, 1, 0,
      0, 1, 1, 1, 0,
      1, 0, 1, 0, 1,
      0, 1, 0, 1, 0,
    ],
  },
  {
    name: '小樹',
    emoji: '🌲',
    grid: [
      0, 0, 1, 0, 0,
      0, 1, 1, 1, 0,
      1, 1, 1, 1, 1,
      0, 0, 1, 0, 0,
      0, 1, 1, 1, 0,
    ],
  },
  {
    name: '笑臉',
    emoji: '😊',
    grid: [
      0, 1, 0, 1, 0,
      0, 1, 0, 1, 0,
      0, 0, 0, 0, 0,
      1, 0, 0, 0, 1,
      0, 1, 1, 1, 0,
    ],
  },
];

export function computeRuns(line: number[]): number[] {
  const runs: number[] = [];
  let cur = 0;
  for (const v of line) {
    if (v === 1) cur += 1;
    else if (cur > 0) {
      runs.push(cur);
      cur = 0;
    }
  }
  if (cur > 0) runs.push(cur);
  return runs.length > 0 ? runs : [0];
}

export const nonogramGame: GameModule = {
  id: 'nonogram',
  title: '邏輯繪圖（數織）',
  subtitle: '依每行每列的連續方塊提示填色，全部解開就會浮現隱藏像素畫！',
  ageTier: 'senior',
  ageLabel: '高年級 10–12 歲',
  evidenceBadge: '數字約束繪圖（Nonogram）',
  primaryAxis: 'deductiveReasoning',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const rng = new SeededRng(config.seed);
    const pic = PICS[rng.int(0, PICS.length - 1)];
    // cell state: 0 = blank, 1 = filled, 2 = crossed (✕)
    const cells = new Array<number>(25).fill(0);
    let crossMode = false;
    let lastTapMs = performance.now();
    const trials: TrialRecord[] = [];
    let disposed = false;
    let completed = false;

    const rowClues = Array.from({ length: 5 }, (_, r) => computeRuns(pic.grid.slice(r * 5, r * 5 + 5)));
    const colClues = Array.from({ length: 5 }, (_, c) =>
      computeRuns([0, 1, 2, 3, 4].map((r) => pic.grid[r * 5 + c])),
    );

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const visualTimer = new VisualTimer('繪圖進度');
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
      const targetFilled = pic.grid.filter((v) => v === 1).length;
      const correctFilled = cells.filter((v, i) => v === 1 && pic.grid[i] === 1).length;
      visualTimer.setProgress(targetFilled > 0 ? correctFilled / targetFilled : 0);

      header.innerHTML = `
        <div class="stage-meta">
          <span class="badge">5×5 數織謎題</span>
          <span class="badge">種子 #${config.seed}</span>
        </div>
      `;

      const colHeaderHtml = `
        <tr>
          <th class="nono-corner"></th>
          ${colClues.map((cl) => `<th class="nono-col-clue">${cl.join('<br>')}</th>`).join('')}
        </tr>
      `;

      const rowsHtml = rowClues
        .map((cl, r) => {
          const rowCells = Array.from({ length: 5 }, (_, c) => {
            const idx = r * 5 + c;
            const st = cells[idx];
            return `
              <td>
                <button type="button"
                  class="nono-cell ${st === 1 ? 'is-filled' : st === 2 ? 'is-crossed' : ''}"
                  data-idx="${idx}"
                  aria-label="第 ${r + 1} 列第 ${c + 1} 行">
                  ${st === 2 ? '✕' : ''}
                </button>
              </td>
            `;
          }).join('');
          return `<tr><th class="nono-row-clue">${cl.join(' ')}</th>${rowCells}</tr>`;
        })
        .join('');

      boardHost.innerHTML = `<table class="nono-table"><thead>${colHeaderHtml}</thead><tbody>${rowsHtml}</tbody></table>`;

      modeHost.innerHTML = `
        <button type="button" class="btn ${!crossMode ? 'btn-primary' : 'btn-outline'}" id="nono-fill">🟦 塗色方塊</button>
        <button type="button" class="btn ${crossMode ? 'btn-primary' : 'btn-outline'}" id="nono-cross">✕ 標記空白</button>
      `;

      modeHost.querySelector('#nono-fill')?.addEventListener('click', () => {
        crossMode = false;
        render();
      });
      modeHost.querySelector('#nono-cross')?.addEventListener('click', () => {
        crossMode = true;
        render();
      });

      boardHost.querySelectorAll<HTMLButtonElement>('.nono-cell').forEach((btn) => {
        btn.addEventListener('click', () => {
          handleTap(Number(btn.dataset.idx));
        });
      });
    }

    function handleTap(idx: number): void {
      if (disposed || completed) return;
      audioGateway.unlock();
      const now = performance.now();
      const rtMs = Math.round(now - lastTapMs);
      lastTapMs = now;

      if (crossMode) {
        cells[idx] = cells[idx] === 2 ? 0 : 2;
        render();
        return;
      }

      if (cells[idx] === 1) {
        cells[idx] = 0;
        render();
        return;
      }

      cells[idx] = 1;
      if (pic.grid[idx] === 1) {
        audioGateway.playPentatonic(trials.length);
        trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
        statusLine.textContent = '塗對了！繼續推論下一行';
      } else {
        audioGateway.playTone('gentle');
        trials.push({ isTarget: true, correct: false, rtMs, errorType: 'rule' });
        statusLine.textContent = '這格依照提示應該留空喔（可切換 ✕ 標記）';
      }
      render();

      const solved = pic.grid.every((expected, i) => (expected === 1) === (cells[i] === 1));
      if (solved) {
        completed = true;
        audioGateway.playTone('complete');
        statusLine.textContent = `揭曉像素畫：${pic.emoji} ${pic.name}！`;
        const metrics = computeSessionMetrics(trials);
        window.setTimeout(() => {
          if (disposed) return;
          config.onSessionComplete({
            gameId: 'nonogram',
            ageTier: 'senior',
            seed: config.seed,
            level: config.level,
            metrics,
            axisScores: {
              attentionStability: metrics.asi,
              deductiveReasoning: Math.round(metrics.accuracy * 100),
            },
          });
        }, 700);
      }
    }

    render();
    statusLine.textContent = '數字代表該行／列連續塗色的方塊數（例如 2 1 表示先 2 格、空至少 1 格再 1 格）';

    if (config.showTutorial) {
      const svg = `<div style="font-size:0.95rem;font-weight:600;color:#0072B2;">先找數字「5」或較大的數字開始填，就能慢慢推出整張圖！</div>`;
      const overlay = createTutorialOverlay('依照邊緣數字線索填色，揭曉隱藏像素畫', svg, () => {
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
