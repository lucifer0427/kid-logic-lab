import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { SeededRng } from '../../worker/prng';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

const TOTAL_ROUNDS = 4;

export const numberPyramidGame: GameModule = {
  id: 'numberPyramid',
  title: '數字金字塔',
  subtitle: '每一格數字等於「正下方相鄰兩格之和」，推算出問號格子的正確數字！',
  ageTier: 'middle',
  ageLabel: '中年級 8–10 歲',
  evidenceBadge: '逆向加減與結構推理',
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
    const visualTimer = new VisualTimer('金字塔進度');
    const pyrHost = document.createElement('div');
    const choicesHost = document.createElement('div');
    choicesHost.className = 'numpad-row';
    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(pyrHost);
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
          gameId: 'numberPyramid',
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

      visualTimer.setProgress(round / TOTAL_ROUNDS);
      // 3-tier pyramid: bottom [b0, b1, b2], mid [m0, m1], top [t0]
      const b0 = rng.int(2, 9);
      const b1 = rng.int(2, 9);
      const b2 = rng.int(2, 9);
      const m0 = b0 + b1;
      const m1 = b1 + b2;
      const t0 = m0 + m1;

      // Hide either m0, b1, or t0 depending on round
      const missingKey = round < 2 ? 't0' : round === 2 ? 'm0' : 'b1';
      const answer = missingKey === 't0' ? t0 : missingKey === 'm0' ? m0 : b1;

      header.innerHTML = `<div class="stage-meta"><span class="badge">第 ${round + 1} / ${TOTAL_ROUNDS} 座</span></div>`;

      const cell = (val: number, isMissing: boolean) =>
        `<div class="pyr-cell ${isMissing ? 'is-missing' : ''}">${isMissing ? '?' : val}</div>`;

      pyrHost.innerHTML = `
        <div class="pyr-wrap">
          <div class="pyr-row">${cell(t0, missingKey === 't0')}</div>
          <div class="pyr-row">${cell(m0, missingKey === 'm0')}${cell(m1, false)}</div>
          <div class="pyr-row">${cell(b0, false)}${cell(b1, missingKey === 'b1')}${cell(b2, false)}</div>
        </div>
      `;

      const opts = new Set<number>([answer]);
      while (opts.size < 4) {
        opts.add(Math.max(1, answer + rng.int(-4, 5)));
      }
      choicesHost.innerHTML = rng
        .shuffle(Array.from(opts))
        .map((n) => `<button type="button" class="btn btn-outline btn-lg pyr-opt" data-v="${n}">${n}</button>`)
        .join('');

      let roundResolved = false;
      choicesHost.querySelectorAll<HTMLButtonElement>('.pyr-opt').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (roundResolved || disposed) return;
          audioGateway.unlock();
          const chosen = Number(btn.dataset.v);
          const rtMs = Math.round(performance.now() - roundStartMs);
          if (chosen === answer) {
            roundResolved = true;
            audioGateway.playPentatonic(round);
            trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
            statusLine.textContent = `算對了！答案就是 ${answer}`;
            round += 1;
            window.setTimeout(nextRound, 350);
          } else {
            audioGateway.playTone('gentle');
            trials.push({ isTarget: true, correct: false, rtMs, errorType: 'rule' });
            statusLine.textContent = '記得：上面那格 ＝ 下面兩格加起來喔！';
          }
        });
      });

      roundStartMs = performance.now();
    }

    if (config.showTutorial) {
      const svg = `<div style="font-size:0.95rem;font-weight:600;color:#0072B2;">例如底下是 3 和 5，上面那格就是 3 ＋ 5 ＝ 8！</div>`;
      const overlay = createTutorialOverlay('利用「上 ＝ 左下 ＋ 右下」找出問號的數字', svg, () => {
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
