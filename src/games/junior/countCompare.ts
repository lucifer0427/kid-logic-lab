import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { SeededRng } from '../../worker/prng';
import { OKABE_ITO_PALETTE, renderThemedTokenSvg } from '../../ui/theme/okabeIto';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

const TOTAL_ROUNDS = 10;

export const countCompareGame: GameModule = {
  id: 'countCompare',
  title: '數量比一比',
  subtitle: '不要被圖形大小或排列方式影響，快速判斷哪一邊數量比較多（或一樣多）',
  ageTier: 'junior',
  ageLabel: '低年級 6–8 歲',
  evidenceBadge: '數量守恆與視覺估數（Subitizing）',
  primaryAxis: 'attentionStability',

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
    const visualTimer = new VisualTimer('比對進度');
    const compareHost = document.createElement('div');
    compareHost.className = 'compare-host';
    const btnHost = document.createElement('div');
    btnHost.className = 'mode-row';
    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(compareHost);
    wrapper.appendChild(btnHost);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    function nextRound(): void {
      if (disposed) return;
      if (round >= TOTAL_ROUNDS) {
        visualTimer.setProgress(1);
        audioGateway.playTone('complete');
        const metrics = computeSessionMetrics(trials);
        config.onSessionComplete({
          gameId: 'countCompare',
          ageTier: 'junior',
          seed: config.seed,
          level: config.level,
          metrics,
          axisScores: {
            attentionStability: metrics.asi,
            impulseInhibition: Math.round(metrics.accuracy * 100),
          },
        });
        return;
      }

      visualTimer.setProgress(round / TOTAL_ROUNDS);
      const leftN = rng.int(3, 8);
      const roll = rng.next();
      const rightN = roll < 0.2 ? leftN : roll < 0.6 ? Math.max(2, leftN - rng.int(1, 2)) : Math.min(9, leftN + rng.int(1, 2));
      const answer: 'left' | 'right' | 'equal' = leftN > rightN ? 'left' : rightN > leftN ? 'right' : 'equal';

      const tokL = rng.int(0, 3);
      const tokR = rng.int(0, 3);
      // Vary icon sizes to train conservation (small items can still outnumber big items!)
      const sizeL = leftN <= 4 ? 38 : 28;
      const sizeR = rightN <= 4 ? 38 : 28;

      header.innerHTML = `<div class="stage-meta"><span class="badge">第 ${round + 1} / ${TOTAL_ROUNDS} 題</span></div>`;

      compareHost.innerHTML = `
        <div class="compare-box">${Array.from({ length: leftN }, () => renderThemedTokenSvg(tokL, skin, sizeL)).join('')}</div>
        <div class="vs-badge">VS</div>
        <div class="compare-box">${Array.from({ length: rightN }, () => renderThemedTokenSvg(tokR, skin, sizeR)).join('')}</div>
      `;

      btnHost.innerHTML = `
        <button type="button" class="btn btn-outline btn-lg cmp-btn" data-ans="left">⬅ 左邊多</button>
        <button type="button" class="btn btn-outline btn-lg cmp-btn" data-ans="equal">＝ 一樣多</button>
        <button type="button" class="btn btn-outline btn-lg cmp-btn" data-ans="right">右邊多 ➡</button>
      `;

      btnHost.querySelectorAll<HTMLButtonElement>('.cmp-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          audioGateway.unlock();
          const chosen = btn.dataset.ans as 'left' | 'right' | 'equal';
          const rtMs = Math.round(performance.now() - roundStartMs);
          if (chosen === answer) {
            audioGateway.playPentatonic(round);
            trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
            statusLine.textContent = `答對了！左邊 ${leftN} 個、右邊 ${rightN} 個`;
          } else {
            audioGateway.playTone('gentle');
            trials.push({ isTarget: true, correct: false, rtMs, errorType: 'commission' });
            statusLine.textContent = `數數看喔：左邊 ${leftN} 個、右邊 ${rightN} 個`;
          }
          round += 1;
          window.setTimeout(nextRound, 320);
        });
      });

      roundStartMs = performance.now();
    }

    void OKABE_ITO_PALETTE;

    if (config.showTutorial) {
      const svg = `<div style="font-size:0.95rem;font-weight:600;color:#0072B2;">只數「個數」，不要被圖形大小騙到喔！</div>`;
      const overlay = createTutorialOverlay('比較左右兩邊哪一邊數量比較多', svg, () => {
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
