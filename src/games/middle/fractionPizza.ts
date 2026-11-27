import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { SeededRng } from '../../worker/prng';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

const TOTAL_ROUNDS = 6;

function renderPizzaSvg(totalSlices: number, selectedSlices: boolean[]): string {
  const cx = 90;
  const cy = 90;
  const r = 76;
  const parts: string[] = [];

  for (let i = 0; i < totalSlices; i++) {
    const a1 = (i * 2 * Math.PI) / totalSlices - Math.PI / 2;
    const a2 = ((i + 1) * 2 * Math.PI) / totalSlices - Math.PI / 2;
    const x1 = cx + Math.cos(a1) * r;
    const y1 = cy + Math.sin(a1) * r;
    const x2 = cx + Math.cos(a2) * r;
    const y2 = cy + Math.sin(a2) * r;
    const large = totalSlices === 1 ? 1 : 0;
    const fill = selectedSlices[i] ? '#E69F00' : '#F8FAFC';
    parts.push(
      `<path d="M ${cx} ${cy} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z"
        fill="${fill}" stroke="#0F172A" stroke-width="2.5" class="pizza-slice" data-slice="${i}" style="cursor:pointer;"/>`,
    );
  }
  return `<svg viewBox="0 0 180 180" width="180" height="180" aria-label="分數披薩">${parts.join('')}</svg>`;
}

export const fractionPizzaGame: GameModule = {
  id: 'fractionPizza',
  title: '分數披薩師傅',
  subtitle: '看清楚題目要幾分之幾的披薩，點擊對應數量的披薩片塗上顏色！',
  ageTier: 'middle',
  ageLabel: '中年級 8–10 歲',
  evidenceBadge: '視覺比例與分數等值概念',
  primaryAxis: 'deductiveReasoning',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const rng = new SeededRng(config.seed);
    const trials: TrialRecord[] = [];
    let round = 0;
    let denom = 4;
    let targetNum = 1;
    let selected: boolean[] = [];
    let roundStartMs = performance.now();
    let disposed = false;

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const visualTimer = new VisualTimer('出餐進度');
    const promptHost = document.createElement('div');
    promptHost.className = 'fraction-prompt';
    const pizzaHost = document.createElement('div');
    const checkBtn = document.createElement('button');
    checkBtn.type = 'button';
    checkBtn.className = 'btn btn-primary btn-lg';
    checkBtn.textContent = '送出披薩 ✓';
    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(promptHost);
    wrapper.appendChild(pizzaHost);
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
          gameId: 'fractionPizza',
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
      const denoms = [2, 3, 4, 6, 8];
      denom = denoms[rng.int(0, denoms.length - 1)];
      targetNum = rng.int(1, denom - 1);
      selected = new Array<boolean>(denom).fill(false);
      roundStartMs = performance.now();
      render();
    }

    function render(): void {
      if (disposed) return;
      header.innerHTML = `<div class="stage-meta"><span class="badge">訂單 ${round + 1} / ${TOTAL_ROUNDS}</span></div>`;
      promptHost.innerHTML = `客人點了：<strong>${targetNum} / ${denom}</strong> 個披薩（分成 ${denom} 片，選 ${targetNum} 片）`;
      pizzaHost.innerHTML = renderPizzaSvg(denom, selected);

      pizzaHost.querySelectorAll<SVGPathElement>('.pizza-slice').forEach((el) => {
        el.addEventListener('click', () => {
          audioGateway.unlock();
          const idx = Number(el.dataset.slice);
          selected[idx] = !selected[idx];
          audioGateway.playPentatonic(idx);
          render();
        });
      });
    }

    checkBtn.addEventListener('click', () => {
      audioGateway.unlock();
      const rtMs = Math.round(performance.now() - roundStartMs);
      const count = selected.filter(Boolean).length;
      if (count === targetNum) {
        audioGateway.playTone('success');
        trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
        statusLine.textContent = `太棒了！這剛好是 ${targetNum}/${denom} 個披薩！`;
        round += 1;
        window.setTimeout(startRound, 380);
      } else {
        audioGateway.playTone('gentle');
        trials.push({ isTarget: true, correct: false, rtMs, errorType: 'rule' });
        statusLine.textContent = `現在選了 ${count} 片，客人要的是 ${targetNum} 片喔！`;
      }
    });

    if (config.showTutorial) {
      const svg = `<div style="font-size:0.95rem;font-weight:600;color:#0072B2;">分母是總共切成幾片，分子是要選幾片！</div>`;
      const overlay = createTutorialOverlay('點選對應數量的披薩片完成分數訂單', svg, () => {
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
