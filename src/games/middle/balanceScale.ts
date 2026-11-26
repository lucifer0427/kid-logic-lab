import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { SeededRng } from '../../worker/prng';
import { OKABE_ITO_PALETTE, renderTokenSvg } from '../../ui/theme/okabeIto';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

export interface BalancePuzzleSpec {
  wA: number; // weight of token 0
  wB: number; // weight of token 1
  wC: number; // weight of token 2 (unused at Lv1)
  useThree: boolean;
}

export function generateBalancePuzzle(seed: number, level: number): BalancePuzzleSpec {
  const rng = new SeededRng(seed);
  const wA = rng.int(2, 6);
  let wB = rng.int(1, 7);
  if (wB === wA) wB += 1;
  let wC = rng.int(1, 8);
  if (wC === wA || wC === wB) wC += 2;
  return { wA, wB, wC, useThree: level >= 2 };
}

const TOTAL_ROUNDS = 4;

export const balanceScaleGame: GameModule = {
  id: 'balanceScale',
  title: '天平秤重推論',
  subtitle: '觀察天平兩邊的圖形與重量，用等量代換推算出每種圖形代表多重',
  ageTier: 'middle',
  ageLabel: '中年級 8–10 歲',
  evidenceBadge: '具體運思代數（等量代換與消去）',
  primaryAxis: 'deductiveReasoning',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const trials: TrialRecord[] = [];
    let round = 0;
    let disposed = false;
    let spec: BalancePuzzleSpec = generateBalancePuzzle(config.seed, config.level);
    let guessA = 1;
    let guessB = 1;
    let guessC = 1;
    let roundStartMs = performance.now();

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const visualTimer = new VisualTimer('推算進度');
    const scalesHost = document.createElement('div');
    scalesHost.className = 'scales-host';
    const inputsHost = document.createElement('div');
    inputsHost.className = 'scales-inputs';
    const checkBtn = document.createElement('button');
    checkBtn.type = 'button';
    checkBtn.className = 'btn btn-primary btn-lg';
    checkBtn.textContent = '送出重量答案 ✓';
    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(scalesHost);
    wrapper.appendChild(inputsHost);
    wrapper.appendChild(checkBtn);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    function startRound(): void {
      if (disposed) return;
      if (round >= TOTAL_ROUNDS) {
        visualTimer.setProgress(1);
        audioGateway.playTone('complete');
        const metrics = computeSessionMetrics(trials);
        config.onSessionComplete({
          gameId: 'balanceScale',
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
      spec = generateBalancePuzzle(config.seed + round * 97, config.level + (round >= 2 ? 1 : 0));
      guessA = 1;
      guessB = 1;
      guessC = 1;
      roundStartMs = performance.now();
      render();
    }

    function render(): void {
      if (disposed) return;
      header.innerHTML = `
        <div class="stage-meta">
          <span class="badge">第 ${round + 1} / ${TOTAL_ROUNDS} 題</span>
          <span class="badge">圖形等量代換</span>
        </div>
      `;

      const t0 = renderTokenSvg(OKABE_ITO_PALETTE[0], 34);
      const t1 = renderTokenSvg(OKABE_ITO_PALETTE[1], 34);
      const t2 = renderTokenSvg(OKABE_ITO_PALETTE[2], 34);

      const eq1Sum = spec.wA * 2;
      const eq2Sum = spec.wA + spec.wB;
      const eq3Sum = spec.wB + spec.wC;

      scalesHost.innerHTML = `
        <div class="scale-eq">
          <span class="scale-pan">${t0} + ${t0}</span>
          <span class="scale-eq-sign">＝</span>
          <span class="scale-weight">${eq1Sum}</span>
        </div>
        <div class="scale-eq">
          <span class="scale-pan">${t0} + ${t1}</span>
          <span class="scale-eq-sign">＝</span>
          <span class="scale-weight">${eq2Sum}</span>
        </div>
        ${
          spec.useThree
            ? `<div class="scale-eq">
                <span class="scale-pan">${t1} + ${t2}</span>
                <span class="scale-eq-sign">＝</span>
                <span class="scale-weight">${eq3Sum}</span>
              </div>`
            : ''
        }
      `;

      const renderStepper = (tokHtml: string, val: number, key: 'A' | 'B' | 'C') => `
        <div class="weight-stepper">
          ${tokHtml}
          <button type="button" class="btn btn-outline step-btn" data-key="${key}" data-delta="-1">−</button>
          <strong class="step-val">${val}</strong>
          <button type="button" class="btn btn-outline step-btn" data-key="${key}" data-delta="1">＋</button>
        </div>
      `;

      inputsHost.innerHTML = `
        ${renderStepper(t0, guessA, 'A')}
        ${renderStepper(t1, guessB, 'B')}
        ${spec.useThree ? renderStepper(t2, guessC, 'C') : ''}
      `;

      inputsHost.querySelectorAll<HTMLButtonElement>('.step-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          audioGateway.unlock();
          const key = btn.dataset.key as 'A' | 'B' | 'C';
          const delta = Number(btn.dataset.delta);
          if (key === 'A') guessA = Math.max(1, Math.min(15, guessA + delta));
          if (key === 'B') guessB = Math.max(1, Math.min(15, guessB + delta));
          if (key === 'C') guessC = Math.max(1, Math.min(15, guessC + delta));
          audioGateway.playPentatonic(delta > 0 ? 3 : 1);
          render();
        });
      });
    }

    checkBtn.addEventListener('click', () => {
      audioGateway.unlock();
      const rtMs = Math.round(performance.now() - roundStartMs);
      const ok = guessA === spec.wA && guessB === spec.wB && (!spec.useThree || guessC === spec.wC);

      if (ok) {
        audioGateway.playTone('success');
        trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
        statusLine.textContent = '完全正確！等量代換推算成功！';
        round += 1;
        window.setTimeout(startRound, 400);
      } else {
        audioGateway.playTone('gentle');
        trials.push({ isTarget: true, correct: false, rtMs, errorType: 'rule' });
        statusLine.textContent = '再檢查一下第一條天平（兩個相同圖形）喔！';
      }
    });

    if (config.showTutorial) {
      const svg = `<div style="font-size:0.95rem;font-weight:600;color:#0072B2;">先從「兩個相同圖形」的天平算出第一個重量，再代換下一條！</div>`;
      const overlay = createTutorialOverlay('利用等量代換，推算出每個圖形代表多少', svg, () => {
        audioGateway.unlock();
        startRound();
      });
      wrapper.appendChild(overlay);
    } else {
      startRound();
    }

    return () => {
      disposed = true;
    };
  },
};
