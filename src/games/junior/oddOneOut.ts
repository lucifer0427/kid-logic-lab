import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { SeededRng } from '../../worker/prng';
import { OKABE_ITO_PALETTE, renderTokenSvg } from '../../ui/theme/okabeIto';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

const TOTAL_ROUNDS = 10;

export const oddOneOutGame: GameModule = {
  id: 'oddOneOut',
  title: '找出不一樣',
  subtitle: '觀察所有圖形的顏色、形狀或邊框，找出唯一不同類的那一個',
  ageTier: 'junior',
  ageLabel: '低年級 6–8 歲',
  evidenceBadge: '具體運思分類歸納（Odd One Out）',
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
    const visualTimer = new VisualTimer('分類進度');
    const boardHost = document.createElement('div');
    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(boardHost);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    function nextRound(): void {
      if (disposed) return;
      if (round >= TOTAL_ROUNDS) {
        visualTimer.setProgress(1);
        audioGateway.playTone('complete');
        const metrics = computeSessionMetrics(trials);
        config.onSessionComplete({
          gameId: 'oddOneOut',
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
      const count = round >= 5 || config.level >= 2 ? 6 : 4;
      const baseColorIdx = rng.int(0, 3);
      const baseShapeIdx = rng.int(0, 3);
      const diffMode = rng.int(0, 2); // 0: diff color, 1: diff shape, 2: diff size
      const oddPos = rng.int(0, count - 1);

      const items = Array.from({ length: count }, (_, i) => {
        const isOdd = i === oddPos;
        const cIdx = isOdd && diffMode === 0 ? (baseColorIdx + 1) % 4 : baseColorIdx;
        const sIdx = isOdd && diffMode === 1 ? (baseShapeIdx + 1) % 4 : baseShapeIdx;
        const size = isOdd && diffMode === 2 ? 30 : 54;
        const tok = { ...OKABE_ITO_PALETTE[cIdx], shape: OKABE_ITO_PALETTE[sIdx].shape };
        return { tok, size, isOdd };
      });

      header.innerHTML = `
        <div class="stage-meta">
          <span class="badge">第 ${round + 1} / ${TOTAL_ROUNDS} 題</span>
        </div>
      `;

      boardHost.innerHTML = `
        <div class="odd-grid" style="grid-template-columns: repeat(${count === 4 ? 2 : 3}, 96px);">
          ${items
            .map(
              (item, idx) => `
            <button type="button" class="odd-cell" data-idx="${idx}" aria-label="圖形 ${idx + 1}">
              ${renderTokenSvg(item.tok, item.size)}
            </button>
          `,
            )
            .join('')}
        </div>
      `;

      boardHost.querySelectorAll<HTMLButtonElement>('.odd-cell').forEach((btn) => {
        btn.addEventListener('click', () => {
          audioGateway.unlock();
          const idx = Number(btn.dataset.idx);
          const rtMs = Math.round(performance.now() - roundStartMs);
          if (idx === oddPos) {
            audioGateway.playPentatonic(round);
            trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
            statusLine.textContent = '眼力真好！馬上看出不一樣的地方';
            round += 1;
            window.setTimeout(nextRound, 280);
          } else {
            audioGateway.playTone('gentle');
            trials.push({ isTarget: true, correct: false, rtMs, errorType: 'commission' });
            statusLine.textContent = '這個跟大部分一樣喔，再比比看顏色、形狀或大小';
          }
        });
      });

      roundStartMs = performance.now();
    }

    if (config.showTutorial) {
      const svg = `<div style="font-size:0.95rem;font-weight:600;color:#0072B2;">仔細比對顏色、形狀、大小，找出唯一不同的那一個！</div>`;
      const overlay = createTutorialOverlay('點出和大家不一樣的圖形', svg, () => {
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
