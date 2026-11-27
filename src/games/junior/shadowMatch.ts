import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { SeededRng } from '../../worker/prng';
import { OKABE_ITO_PALETTE } from '../../ui/theme/okabeIto';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

const TOTAL_ROUNDS = 8;

interface PolyShadowSpec {
  cells: [number, number][]; // coordinates on 3x3
  colorIdx: number;
}

const SHADOW_SHAPES: readonly [number, number][][] = [
  [[0, 0], [1, 0], [2, 0], [2, 1]], // L
  [[0, 1], [1, 1], [2, 1], [2, 0]], // J
  [[0, 0], [0, 1], [0, 2], [1, 1]], // T
  [[0, 0], [0, 1], [1, 1], [1, 2]], // Z
  [[0, 1], [0, 2], [1, 0], [1, 1]], // S
  [[0, 0], [0, 1], [1, 0], [1, 1]], // O
];

function renderPolySvg(spec: PolyShadowSpec, silhouette: boolean): string {
  const fill = silhouette ? '#1E293B' : OKABE_ITO_PALETTE[spec.colorIdx].hex;
  const rects = spec.cells
    .map(
      ([r, c]) =>
        `<rect x="${c * 24 + 8}" y="${r * 24 + 8}" width="22" height="22" rx="4" fill="${fill}" stroke="#0F172A" stroke-width="1.5"/>`,
    )
    .join('');
  return `<svg viewBox="0 0 88 88" width="82" height="82" aria-hidden="true">${rects}</svg>`;
}

export const shadowMatchGame: GameModule = {
  id: 'shadowMatch',
  title: '影子配對偵探',
  subtitle: '觀察上方的黑色剪影形狀，從下方選出唯一完全吻合的彩色方塊圖形！',
  ageTier: 'junior',
  ageLabel: '低年級 6–8 歲',
  evidenceBadge: '視覺形狀恆常與輪廓辨識',
  primaryAxis: 'deductiveReasoning',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const rng = new SeededRng(config.seed);
    const trials: TrialRecord[] = [];
    let round = 0;
    let disposed = false;
    let roundStartMs = performance.now();

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const visualTimer = new VisualTimer('偵探進度');
    const shadowHost = document.createElement('div');
    const choicesHost = document.createElement('div');
    choicesHost.className = 'numpad-row';
    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(shadowHost);
    wrapper.appendChild(choicesHost);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    function nextRound(): void {
      if (disposed) return;
      if (round >= TOTAL_ROUNDS) {
        visualTimer.setProgress(1);
        audioGateway.playTone('complete');
        const metrics = computeSessionMetrics(trials);
        config.onSessionComplete({
          gameId: 'shadowMatch',
          ageTier: 'junior',
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

      visualTimer.setProgress(round / TOTAL_ROUNDS);
      const pickedShapes = rng.shuffle(Array.from({ length: SHADOW_SHAPES.length }, (_, i) => i)).slice(0, 4);
      const targetShapeIdx = pickedShapes[0];
      const targetSpec: PolyShadowSpec = { cells: SHADOW_SHAPES[targetShapeIdx], colorIdx: rng.int(0, 4) };
      const options = rng.shuffle(
        pickedShapes.map((sIdx, i) => ({
          spec: { cells: SHADOW_SHAPES[sIdx], colorIdx: (targetSpec.colorIdx + i) % 5 },
          isCorrect: sIdx === targetShapeIdx,
        })),
      );

      header.innerHTML = `<div class="stage-meta"><span class="badge">第 ${round + 1} / ${TOTAL_ROUNDS} 題</span></div>`;
      shadowHost.innerHTML = `<div class="shadow-box">${renderPolySvg(targetSpec, true)}</div>`;
      choicesHost.innerHTML = options
        .map(
          (o, idx) =>
            `<button type="button" class="btn btn-outline matrix-opt-btn" data-idx="${idx}">${renderPolySvg(o.spec, false)}</button>`,
        )
        .join('');

      let roundResolved = false;
      choicesHost.querySelectorAll<HTMLButtonElement>('.matrix-opt-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (roundResolved || disposed) return;
          audioGateway.unlock();
          const chosen = options[Number(btn.dataset.idx)];
          const rtMs = Math.round(performance.now() - roundStartMs);
          if (chosen.isCorrect) {
            roundResolved = true;
            audioGateway.playPentatonic(round);
            trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
            statusLine.textContent = '賓果！影子完全符合！';
            round += 1;
            window.setTimeout(nextRound, 300);
          } else {
            audioGateway.playTone('gentle');
            trials.push({ isTarget: true, correct: false, rtMs, errorType: 'commission' });
            statusLine.textContent = '形狀方向不太一樣喔，再比對一下轉角';
          }
        });
      });

      roundStartMs = performance.now();
    }

    if (config.showTutorial) {
      const svg = `<div style="font-size:0.95rem;font-weight:600;color:#0072B2;">仔細看黑色影子的輪廓，選出形狀一模一樣的彩色方塊！</div>`;
      const overlay = createTutorialOverlay('幫影子找出原本的彩色圖形', svg, () => {
        audioGateway.unlock();
        nextRound();
      });
      wrapper.appendChild(overlay);
    } else {
      nextRound();
    }

    return () => {
      disposed = true;
    };
  },
};
