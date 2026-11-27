import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { SeededRng } from '../../worker/prng';
import { OKABE_ITO_PALETTE } from '../../ui/theme/okabeIto';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

const TOTAL_ITEMS = 6;

interface DualCellSpec {
  shapeIdx: number; // 0: circle, 1: square, 2: triangle
  colorIdx: number;
  count: number;
  ring: boolean;
}

function renderDualCellSvg(spec: DualCellSpec, size = 74): string {
  const color = OKABE_ITO_PALETTE[spec.colorIdx % 4].hex;
  const parts: string[] = [];
  if (spec.ring) {
    parts.push(
      `<rect x="6" y="6" width="${size - 12}" height="${size - 12}" rx="10" fill="none" stroke="#0F172A" stroke-width="2" stroke-dasharray="4 3"/>`,
    );
  }

  const step = 18;
  const startX = size / 2 - ((spec.count - 1) * step) / 2;
  for (let i = 0; i < spec.count; i++) {
    const cx = startX + i * step;
    const cy = size / 2;
    if (spec.shapeIdx === 0) {
      parts.push(`<circle cx="${cx}" cy="${cy}" r="7" fill="${color}" stroke="#0F172A" stroke-width="1.5"/>`);
    } else if (spec.shapeIdx === 1) {
      parts.push(`<rect x="${cx - 7}" y="${cy - 7}" width="14" height="14" rx="2" fill="${color}" stroke="#0F172A" stroke-width="1.5"/>`);
    } else {
      parts.push(`<polygon points="${cx},${cy - 8} ${cx + 7},${cy + 6} ${cx - 7},${cy + 6}" fill="${color}" stroke="#0F172A" stroke-width="1.5"/>`);
    }
  }
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">${parts.join('')}</svg>`;
}

export const dualMatrixGame: GameModule = {
  id: 'dualMatrix',
  title: '雙重邏輯矩陣',
  subtitle: '同時追蹤「形狀＋顏色＋外框」多重邏輯運算規則，推導右下角缺漏圖形',
  ageTier: 'senior',
  ageLabel: '高年級 10–12 歲',
  evidenceBadge: '設計推論（跨維度邏輯運算）',
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
    const visualTimer = new VisualTimer('推論進度');
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
          gameId: 'dualMatrix',
          ageTier: 'senior',
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
      const shapeOrder = rng.shuffle([0, 1, 2]);
      const colorOrder = rng.shuffle([0, 1, 2, 3]).slice(0, 3);

      const cells: DualCellSpec[] = [];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          cells.push({
            shapeIdx: shapeOrder[(r + c) % 3],
            colorIdx: colorOrder[(r * 2 + c) % 3],
            count: c + 1,
            ring: (r + c) % 2 === 0,
          });
        }
      }

      const ans = cells[8];
      const distractors: DualCellSpec[] = [
        { ...ans, shapeIdx: (ans.shapeIdx + 1) % 3 },
        { ...ans, ring: !ans.ring },
        { ...ans, count: ans.count === 3 ? 2 : 3 },
      ];
      const options = rng.shuffle([
        { spec: ans, isCorrect: true },
        ...distractors.map((spec) => ({ spec, isCorrect: false })),
      ]);

      header.innerHTML = `
        <div class="stage-meta">
          <span class="badge">種子 #${config.seed}</span>
          <span class="badge">第 ${currentIdx + 1} / ${TOTAL_ITEMS} 題</span>
        </div>
      `;

      matrixHost.innerHTML = `
        <div class="matrix-grid" style="grid-template-columns: repeat(3, 76px);">
          ${cells
            .map((cell, i) =>
              i === 8
                ? `<div class="matrix-cell is-missing">?</div>`
                : `<div class="matrix-cell">${renderDualCellSvg(cell, 72)}</div>`,
            )
            .join('')}
        </div>
      `;

      optionsHost.innerHTML = options
        .map(
          (opt, i) => `
          <button type="button" class="btn btn-outline matrix-opt-btn" data-opt="${i}" aria-label="選項 ${i + 1}">
            ${renderDualCellSvg(opt.spec, 64)}
          </button>
        `,
        )
        .join('');

      let roundResolved = false;
      optionsHost.querySelectorAll<HTMLButtonElement>('.matrix-opt-btn').forEach((btn) => {
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          if (roundResolved || disposed) return;
          roundResolved = true;
          audioGateway.unlock();
          const chosen = options[Number(btn.dataset.opt)];
          const rtMs = Math.round(performance.now() - trialStartMs);
          if (chosen.isCorrect) {
            audioGateway.playTone('success');
            trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
            statusLine.textContent = '多重維度推論正確！';
          } else {
            audioGateway.playTone('gentle');
            trials.push({ isTarget: true, correct: false, rtMs, errorType: 'rule' });
            statusLine.textContent = '請同時核對形狀、顏色、數量與虛線外框喔';
          }
          currentIdx += 1;
          window.setTimeout(nextPuzzle, 360);
        });
      });

      trialStartMs = performance.now();
    }

    if (config.showTutorial) {
      const svg = `<div style="font-size:0.95rem;font-weight:600;color:#0072B2;">每行每列：形狀、顏色各不重複，外框交錯出現</div>`;
      const overlay = createTutorialOverlay('綜合分析形狀、顏色、數量與外框規律', svg, () => {
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
