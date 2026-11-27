import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { SeededRng } from '../../worker/prng';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

const TOTAL_ROUNDS = 8;

function renderClockSvg(hour: number, minute: number): string {
  const cx = 80;
  const cy = 80;
  const minAngle = (minute * 6 - 90) * (Math.PI / 180);
  const hourAngle = (((hour % 12) + minute / 60) * 30 - 90) * (Math.PI / 180);

  const hx = cx + Math.cos(hourAngle) * 36;
  const hy = cy + Math.sin(hourAngle) * 36;
  const mx = cx + Math.cos(minAngle) * 54;
  const my = cy + Math.sin(minAngle) * 54;

  const numbers = Array.from({ length: 12 }, (_, i) => {
    const n = i + 1;
    const a = (n * 30 - 90) * (Math.PI / 180);
    const x = cx + Math.cos(a) * 60;
    const y = cy + Math.sin(a) * 60 + 4;
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" font-size="11" font-weight="700" fill="#334155">${n}</text>`;
  }).join('');

  return `
    <svg viewBox="0 0 160 160" width="160" height="160" aria-label="時鐘">
      <circle cx="${cx}" cy="${cy}" r="74" fill="#FFFFFF" stroke="#0F172A" stroke-width="3"/>
      ${numbers}
      <line x1="${cx}" y1="${cy}" x2="${hx.toFixed(1)}" y2="${hy.toFixed(1)}" stroke="#D55E00" stroke-width="5" stroke-linecap="round"/>
      <line x1="${cx}" y1="${cy}" x2="${mx.toFixed(1)}" y2="${my.toFixed(1)}" stroke="#0072B2" stroke-width="3.5" stroke-linecap="round"/>
      <circle cx="${cx}" cy="${cy}" r="5" fill="#0F172A"/>
    </svg>
  `;
}

export const clockMatchGame: GameModule = {
  id: 'clockMatch',
  title: '時鐘小達人',
  subtitle: '看短針（橘色時針）與長針（藍色分針），選出正確的時間！',
  ageTier: 'junior',
  ageLabel: '低年級 6–8 歲',
  evidenceBadge: '時間空間對應（整點與半點）',
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
    const visualTimer = new VisualTimer('讀鐘進度');
    const clockHost = document.createElement('div');
    const choicesHost = document.createElement('div');
    choicesHost.className = 'numpad-row';
    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(clockHost);
    wrapper.appendChild(choicesHost);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    function fmt(h: number, m: number): string {
      return `${h}:${String(m).padStart(2, '0')}`;
    }

    function nextRound(): void {
      if (disposed) return;
      if (round >= TOTAL_ROUNDS) {
        visualTimer.setProgress(1);
        audioGateway.playTone('complete');
        const metrics = computeSessionMetrics(trials);
        config.onSessionComplete({
          gameId: 'clockMatch',
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
      const hour = rng.int(1, 12);
      const minute = round < 4 ? 0 : rng.next() < 0.5 ? 0 : 30;
      const ans = fmt(hour, minute);

      const distractors = new Set<string>([ans]);
      while (distractors.size < 4) {
        const dh = rng.int(1, 12);
        const dm = minute === 0 ? (rng.next() < 0.5 ? 0 : 30) : (rng.next() < 0.5 ? 30 : 0);
        distractors.add(fmt(dh, dm));
      }
      const options = rng.shuffle(Array.from(distractors));

      header.innerHTML = `<div class="stage-meta"><span class="badge">第 ${round + 1} / ${TOTAL_ROUNDS} 題</span></div>`;
      clockHost.innerHTML = renderClockSvg(hour, minute);
      choicesHost.innerHTML = options
        .map((opt) => `<button type="button" class="btn btn-outline btn-lg clock-opt" data-t="${opt}">${opt}</button>`)
        .join('');

      let roundResolved = false;
      choicesHost.querySelectorAll<HTMLButtonElement>('.clock-opt').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (roundResolved || disposed) return;
          audioGateway.unlock();
          const chosen = btn.dataset.t!;
          const rtMs = Math.round(performance.now() - roundStartMs);
          if (chosen === ans) {
            roundResolved = true;
            audioGateway.playPentatonic(round);
            trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
            statusLine.textContent = `答對了！現在是 ${ans}`;
            round += 1;
            window.setTimeout(nextRound, 320);
          } else {
            audioGateway.playTone('gentle');
            trials.push({ isTarget: true, correct: false, rtMs, errorType: 'rule' });
            statusLine.textContent = '先看橘色短針指著幾點，再看藍色長針指著 12(00) 還是 6(30) 喔';
          }
        });
      });

      roundStartMs = performance.now();
    }

    if (config.showTutorial) {
      const svg = `<div style="font-size:0.95rem;font-weight:600;color:#0072B2;">橘色短針看小時，藍色長針看分鐘（指 12 是 :00，指 6 是 :30）</div>`;
      const overlay = createTutorialOverlay('認出時鐘顯示的時間', svg, () => {
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
