import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { SeededRng } from '../../worker/prng';
import { OKABE_ITO_PALETTE, renderThemedTokenSvg } from '../../ui/theme/okabeIto';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

const TOTAL_ROUNDS = 8;

export const sequenceSortGame: GameModule = {
  id: 'sequenceSort',
  title: '規律接龍列車',
  subtitle: '觀察列車車廂的排列規律（ABAB、AAB、ABC），幫最後一節接上正確車廂',
  ageTier: 'junior',
  ageLabel: '低年級 6–8 歲',
  evidenceBadge: '具體運思序列化與週期規律',
  primaryAxis: 'deductiveReasoning',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const rng = new SeededRng(config.seed);
    const skin = config.themeSkin ?? 'geometry';
    const trials: TrialRecord[] = [];
    let round = 0;
    let disposed = false;
    let roundStartMs = performance.now();

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const visualTimer = new VisualTimer('接龍進度');
    const trainHost = document.createElement('div');
    trainHost.className = 'train-host';
    const choicesHost = document.createElement('div');
    choicesHost.className = 'numpad-row';
    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(trainHost);
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
          gameId: 'sequenceSort',
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
      const tokens = rng.shuffle([0, 1, 2, 3]);
      const [a, b, c] = tokens;
      const patternKind = round < 3 ? 0 : round < 6 ? 1 : 2;
      const cycle =
        patternKind === 0
          ? [a, b] // ABAB
          : patternKind === 1
            ? [a, a, b] // AABAAB
            : [a, b, c]; // ABCABC

      const seqLen = 6;
      const fullSeq = Array.from({ length: seqLen }, (_, i) => cycle[i % cycle.length]);
      const answer = fullSeq[seqLen - 1];
      const shown = fullSeq.slice(0, seqLen - 1);

      header.innerHTML = `
        <div class="stage-meta">
          <span class="badge">第 ${round + 1} / ${TOTAL_ROUNDS} 列</span>
        </div>
      `;

      trainHost.innerHTML = `
        <div class="train-row">
          ${shown.map((t) => `<div class="train-car">${renderThemedTokenSvg(t, skin, 40)}</div>`).join('')}
          <div class="train-car is-missing">?</div>
        </div>
      `;

      const options = rng.shuffle([0, 1, 2, 3]);
      choicesHost.innerHTML = options
        .map(
          (tokIdx) => `
        <button type="button" class="btn btn-outline token-pick-btn" data-tok="${tokIdx}" aria-label="${OKABE_ITO_PALETTE[tokIdx].nameZh}">
          ${renderThemedTokenSvg(tokIdx, skin, 40)}
        </button>
      `,
        )
        .join('');

      let roundResolved = false;
      choicesHost.querySelectorAll<HTMLButtonElement>('.token-pick-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (roundResolved || disposed) return;
          audioGateway.unlock();
          const chosen = Number(btn.dataset.tok);
          const rtMs = Math.round(performance.now() - roundStartMs);
          if (chosen === answer) {
            roundResolved = true;
            audioGateway.playPentatonic(round);
            trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
            statusLine.textContent = '接對了！規律找得真準！';
            round += 1;
            window.setTimeout(nextRound, 280);
          } else {
            audioGateway.playTone('gentle');
            trials.push({ isTarget: true, correct: false, rtMs, errorType: 'rule' });
            statusLine.textContent = '再唸一遍前面的順序看看下一個是什麼喔！';
          }
        });
      });

      roundStartMs = performance.now();
    }

    if (config.showTutorial) {
      const svg = `<div style="font-size:0.95rem;font-weight:600;color:#0072B2;">念念看：橘、藍、橘、藍、橘 → 下一個是 藍！</div>`;
      const overlay = createTutorialOverlay('找出車廂重複排列的規律，選中最後一節車廂', svg, () => {
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
