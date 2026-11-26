import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { SeededRng } from '../../worker/prng';
import { OKABE_ITO_PALETTE } from '../../ui/theme/okabeIto';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

const TOTAL_ITEMS = 6;

interface MatrixCellSpec {
  rotationDeg: number;
  count: number;
  colorIdx: number;
}

function renderMatrixCellSvg(spec: MatrixCellSpec, size = 72): string {
  const color = OKABE_ITO_PALETTE[spec.colorIdx % OKABE_ITO_PALETTE.length].hex;
  const shapes: string[] = [];
  const step = 18;
  const startX = size / 2 - ((spec.count - 1) * step) / 2;

  for (let i = 0; i < spec.count; i++) {
    const cx = startX + i * step;
    const cy = size / 2;
    shapes.push(
      `<polygon points="${cx},${cy - 9} ${cx + 8},${cy + 7} ${cx - 8},${cy + 7}"
        fill="${color}" stroke="#0F172A" stroke-width="1.5"
        transform="rotate(${spec.rotationDeg} ${cx} ${cy})"/>`,
    );
  }
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">${shapes.join('')}</svg>`;
}

export const matrixPatternGame: GameModule = {
  id: 'matrixPattern',
  title: '矩陣規律推演',
  subtitle: '觀察旋轉角度、數量與顏色的變化規律，選出問號處的正確圖案',
  ageTier: 'middle',
  ageLabel: '中年級 8–10 歲',
  evidenceBadge: '評估範式延伸（Raven 矩陣推理）',
  primaryAxis: 'deductiveReasoning',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const rng = new SeededRng(config.seed);
    const trials: TrialRecord[] = [];
    let currentIdx = 0;
    let disposed = false;
    let trialStartMs = performance.now();

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const visualTimer = new VisualTimer('推演進度');
    const matrixHost = document.createElement('div');
    const optionsHost = document.createElement('div');
    optionsHost.className = 'numpad-row';
    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(matrixHost);
    wrapper.appendChild(optionsHost);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    function nextPuzzle(): void {
      if (disposed) return;
      if (currentIdx >= TOTAL_ITEMS) {
        visualTimer.setProgress(1);
        audioGateway.playTone('complete');
        const metrics = computeSessionMetrics(trials);
        config.onSessionComplete({
          gameId: 'matrixPattern',
          ageTier: 'middle',
          seed: config.seed,
          level: config.level,
          metrics,
          axisScores: {
            attentionStability: metrics.asi,
            deductiveReasoning: Math.round(metrics.accuracy * 100),
          },
        });
        return;
      }

      visualTimer.setProgress(currentIdx / TOTAL_ITEMS);
      const gridDim = config.level >= 2 || currentIdx >= 3 ? 3 : 2;
      const baseRot = rng.int(0, 3) * 90;
      const rotStep = 90;
      const baseColor = rng.int(0, 3);

      const cells: MatrixCellSpec[] = [];
      for (let r = 0; r < gridDim; r++) {
        for (let c = 0; c < gridDim; c++) {
          cells.push({
            rotationDeg: (baseRot + c * rotStep) % 360,
            count: r + 1,
            colorIdx: (baseColor + r) % 4,
          });
        }
      }

      const answer = cells[cells.length - 1];
      const distractors: MatrixCellSpec[] = [
        { ...answer, rotationDeg: (answer.rotationDeg + 90) % 360 },
        { ...answer, count: Math.max(1, answer.count === 1 ? 2 : answer.count - 1) },
        { ...answer, colorIdx: (answer.colorIdx + 1) % 4 },
      ];
      const options = rng.shuffle([
        { spec: answer, isCorrect: true },
        ...distractors.map((spec) => ({ spec, isCorrect: false })),
      ]);

      header.innerHTML = `
        <div class="stage-meta">
          <span class="badge">種子 #${config.seed}</span>
          <span class="badge">${gridDim}×${gridDim} 矩陣（${currentIdx + 1}/${TOTAL_ITEMS}）</span>
        </div>
      `;

      const gridHtml = cells
        .map((cell, i) => {
          if (i === cells.length - 1) {
            return `<div class="matrix-cell is-missing">?</div>`;
          }
          return `<div class="matrix-cell">${renderMatrixCellSvg(cell, 72)}</div>`;
        })
        .join('');

      matrixHost.innerHTML = `
        <div class="matrix-grid" style="grid-template-columns: repeat(${gridDim}, 76px);">
          ${gridHtml}
        </div>
      `;

      optionsHost.innerHTML = options
        .map(
          (opt, i) => `
          <button type="button" class="btn btn-outline matrix-opt-btn" data-opt="${i}" aria-label="選項 ${i + 1}">
            ${renderMatrixCellSvg(opt.spec, 64)}
          </button>
        `,
        )
        .join('');

      optionsHost.querySelectorAll<HTMLButtonElement>('.matrix-opt-btn').forEach((btn) => {
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          audioGateway.unlock();
          const chosen = options[Number(btn.dataset.opt)];
          const rtMs = Math.round(performance.now() - trialStartMs);

          if (chosen.isCorrect) {
            audioGateway.playTone('success');
            trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
            statusLine.textContent = '規律推演完全正確！';
          } else {
            audioGateway.playTone('gentle');
            trials.push({ isTarget: true, correct: false, rtMs, errorType: 'rule' });
            statusLine.textContent = '再觀察一下橫列（方向）與直行（數量）的變化規律喔';
          }
          currentIdx += 1;
          window.setTimeout(nextPuzzle, 360);
        });
      });

      trialStartMs = performance.now();
    }

    if (config.showTutorial) {
      const svg = `<div style="font-size:1rem;font-weight:600;color:#0072B2;">橫列看旋轉 ↻，直行看數量 1→2→3</div>`;
      const overlay = createTutorialOverlay('找出橫列與直行的變化規律，補上問號圖形', svg, () => {
        audioGateway.unlock();
        nextPuzzle();
      });
      wrapper.appendChild(overlay);
    } else {
      nextPuzzle();
    }

    return () => {
      disposed = true;
    };
  },
};
