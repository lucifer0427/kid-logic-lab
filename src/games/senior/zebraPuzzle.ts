import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { SeededRng } from '../../worker/prng';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

interface ZebraPuzzleSpec {
  names: string[];
  colors: string[];
  shapes: string[];
  /** colorOf[personIdx] = colorIdx, shapeOf[personIdx] = shapeIdx */
  colorOf: number[];
  shapeOf: number[];
  clues: string[];
}

export function generateZebraPuzzle(seed: number): ZebraPuzzleSpec {
  const rng = new SeededRng(seed);
  const names = ['小宇', '小晴', '阿哲'];
  const colors = ['橘色', '天藍', '藍綠'];
  const shapes = ['圓形', '方形', '三角'];

  const colorOf = rng.shuffle([0, 1, 2]);
  const shapeOf = rng.shuffle([0, 1, 2]);

  // Construct mathematically unique-solution clues:
  // Clue 1 pins Person 0 completely; Clue 2 links Person 1's color <-> shape;
  // Clue 3 eliminates Person 2's color from Person 1, forcing a unique assignment.
  const p0Color = colors[colorOf[0]];
  const p0Shape = shapes[shapeOf[0]];
  const p1Color = colors[colorOf[1]];
  const p1Shape = shapes[shapeOf[1]];
  const p2Color = colors[colorOf[2]];

  const clues = [
    `1. ${names[0]}喜歡的是【${p0Color}】，而且拿著【${p0Shape}】。`,
    `2. 喜歡【${p1Color}】的人拿著【${p1Shape}】。`,
    `3. ${names[1]}喜歡的不是【${p2Color}】。`,
  ];

  return { names, colors, shapes, colorOf, shapeOf, clues };
}

type CellMark = 0 | 1 | 2; // 0: blank, 1: ✓, 2: ✕

export const zebraPuzzleGame: GameModule = {
  id: 'zebraPuzzle',
  title: '斑馬邏輯推論表',
  subtitle: '閱讀線索並在表格標記 ✓ 與 ✕，最後選出每個人的配對組合',
  ageTier: 'senior',
  ageLabel: '高年級 10–12 歲',
  evidenceBadge: '設計推論（多維約束排除法）',
  primaryAxis: 'deductiveReasoning',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const spec = generateZebraPuzzle(config.seed);
    // Two 3x3 elimination grids: name-color and name-shape
    const markColor: CellMark[] = new Array<CellMark>(9).fill(0);
    const markShape: CellMark[] = new Array<CellMark>(9).fill(0);
    const trials: TrialRecord[] = [];
    let lastActionMs = performance.now();
    let disposed = false;

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    header.innerHTML = `
      <div class="stage-meta">
        <span class="badge">種子 #${config.seed}</span>
        <span class="badge">斑馬推論</span>
      </div>
    `;

    const visualTimer = new VisualTimer('推論完成度');
    const cluesBox = document.createElement('div');
    cluesBox.className = 'zebra-clues';
    cluesBox.innerHTML = spec.clues.map((c) => `<p>${c}</p>`).join('');

    const gridsHost = document.createElement('div');
    gridsHost.className = 'zebra-grids-host';

    const checkBtn = document.createElement('button');
    checkBtn.type = 'button';
    checkBtn.className = 'btn btn-primary btn-lg';
    checkBtn.textContent = '驗證我的推論 ✓';

    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';
    statusLine.textContent = '點擊格子切換「空白 → ✓ → ✕」，每行每列只能有一個 ✓';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(cluesBox);
    wrapper.appendChild(gridsHost);
    wrapper.appendChild(checkBtn);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    function markSymbol(m: CellMark): string {
      return m === 1 ? '✓' : m === 2 ? '✕' : '';
    }

    function renderGridTable(title: string, cols: string[], marks: CellMark[], gridKey: 'color' | 'shape'): string {
      const headerRow = `<tr><th>${title}</th>${cols.map((c) => `<th>${c}</th>`).join('')}</tr>`;
      const bodyRows = spec.names
        .map((name, r) => {
          const tds = cols
            .map((_, c) => {
              const idx = r * 3 + c;
              const m = marks[idx];
              return `<td>
                <button type="button" class="zebra-cell mark-${m}" data-grid="${gridKey}" data-idx="${idx}">
                  ${markSymbol(m)}
                </button>
              </td>`;
            })
            .join('');
          return `<tr><th>${name}</th>${tds}</tr>`;
        })
        .join('');

      return `<table class="zebra-table"><thead>${headerRow}</thead><tbody>${bodyRows}</tbody></table>`;
    }

    function render(): void {
      if (disposed) return;
      const checkCount = [...markColor, ...markShape].filter((m) => m === 1).length;
      visualTimer.setProgress(Math.min(1, checkCount / 6));

      gridsHost.innerHTML = `
        ${renderGridTable('人物 \\ 顏色', spec.colors, markColor, 'color')}
        ${renderGridTable('人物 \\ 形狀', spec.shapes, markShape, 'shape')}
      `;

      gridsHost.querySelectorAll<HTMLButtonElement>('.zebra-cell').forEach((btn) => {
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          audioGateway.unlock();
          const key = btn.dataset.grid as 'color' | 'shape';
          const idx = Number(btn.dataset.idx);
          const arr = key === 'color' ? markColor : markShape;
          arr[idx] = ((arr[idx] + 1) % 3) as CellMark;
          audioGateway.playPentatonic(idx);
          render();
        });
      });
    }

    checkBtn.addEventListener('pointerdown', () => {
      audioGateway.unlock();
      const rtMs = Math.round(performance.now() - lastActionMs);
      lastActionMs = performance.now();

      let colorOk = true;
      let shapeOk = true;
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const idx = r * 3 + c;
          const expectColor = spec.colorOf[r] === c;
          if ((markColor[idx] === 1) !== expectColor) colorOk = false;
          const expectShape = spec.shapeOf[r] === c;
          if ((markShape[idx] === 1) !== expectShape) shapeOk = false;
        }
      }

      if (colorOk && shapeOk) {
        audioGateway.playTone('complete');
        trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
        const metrics = computeSessionMetrics(trials);
        config.onSessionComplete({
          gameId: 'zebraPuzzle',
          ageTier: 'senior',
          seed: config.seed,
          level: config.level,
          metrics,
          axisScores: {
            attentionStability: metrics.asi,
            deductiveReasoning: Math.round(metrics.accuracy * 100),
          },
        });
      } else {
        audioGateway.playTone('gentle');
        trials.push({ isTarget: true, correct: false, rtMs, errorType: 'rule' });
        statusLine.textContent = '還有些地方不符合線索喔，再核對一下第 1～3 條線索！';
      }
    });

    render();

    if (config.showTutorial) {
      const svg = `<div style="font-size:0.95rem;font-weight:600;color:#0072B2;">先用 ✕ 排除不可能的選項，再把確定的格點成 ✓</div>`;
      const overlay = createTutorialOverlay('利用交叉排除法，幫每位朋友找出正確顏色與形狀', svg, () => {
        audioGateway.unlock();
        lastActionMs = performance.now();
      });
      wrapper.appendChild(overlay);
    }

    return () => {
      disposed = true;
    };
  },
};
