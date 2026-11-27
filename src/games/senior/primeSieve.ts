import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

export function isPrime(n: number): boolean {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) {
    if (n % d === 0) return false;
  }
  return true;
}

export const primeSieveGame: GameModule = {
  id: 'primeSieve',
  title: '質數獵人（篩法）',
  subtitle: '從 2 到 29 之中，找出並點選所有「只能被 1 和自己整除」的質數！',
  ageTier: 'senior',
  ageLabel: '高年級 10–12 歲',
  evidenceBadge: '數論篩法與因數排除',
  primaryAxis: 'deductiveReasoning',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const numbers = Array.from({ length: 28 }, (_, i) => i + 2); // 2..29
    const totalPrimes = numbers.filter(isPrime).length; // 10 primes
    const found = new Set<number>();
    const trials: TrialRecord[] = [];
    let lastTapMs = performance.now();
    let disposed = false;

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const visualTimer = new VisualTimer('質數進度');
    const boardHost = document.createElement('div');
    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(boardHost);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    function render(): void {
      if (disposed) return;
      visualTimer.setProgress(found.size / totalPrimes);
      header.innerHTML = `
        <div class="stage-meta">
          <span class="badge">2–29 質數篩選</span>
          <span class="badge">已找到 ${found.size} / ${totalPrimes} 個質數</span>
        </div>
      `;

      boardHost.innerHTML = `
        <div class="prime-grid">
          ${numbers
            .map((n) => {
              const isFound = found.has(n);
              return `
              <button type="button" class="schulte-cell ${isFound ? 'is-found' : ''}"
                style="width:54px;height:54px;font-size:1.15rem;"
                data-n="${n}" ${isFound ? 'disabled' : ''}>
                ${n}
              </button>
            `;
            })
            .join('')}
        </div>
      `;

      boardHost.querySelectorAll<HTMLButtonElement>('.schulte-cell').forEach((btn) => {
        btn.addEventListener('click', () => {
          const n = Number(btn.dataset.n);
          if (found.has(n) || disposed) return;
          audioGateway.unlock();
          const rtMs = Math.round(performance.now() - lastTapMs);
          lastTapMs = performance.now();

          if (isPrime(n)) {
            found.add(n);
            audioGateway.playPentatonic(found.size);
            trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
            statusLine.textContent = `${n} 是質數！`;
            render();

            if (found.size >= totalPrimes) {
              audioGateway.playTone('complete');
              const metrics = computeSessionMetrics(trials);
              config.onSessionComplete({
                gameId: 'primeSieve',
                ageTier: 'senior',
                seed: config.seed,
                level: config.level,
                metrics,
                axisScores: {
                  attentionStability: metrics.asi,
                  deductiveReasoning: Math.round(metrics.accuracy * 100),
                },
              });
            }
          } else {
            audioGateway.playTone('gentle');
            trials.push({ isTarget: false, correct: false, rtMs, errorType: 'commission' });
            statusLine.textContent = `${n} 是合數喔（除了 1 和自己外還有其他因數）`;
          }
        });
      });
    }

    render();
    statusLine.textContent = '找出所有 2–29 的質數（共 10 個）';

    if (config.showTutorial) {
      const svg = `<div style="font-size:0.95rem;font-weight:600;color:#0072B2;">小秘訣：除了 2 以外，所有偶數都不是質數；再排除 3、5 的倍數！</div>`;
      const overlay = createTutorialOverlay('點出所有質數，避開合數！', svg, () => {
        audioGateway.unlock();
        lastTapMs = performance.now();
      });
      wrapper.appendChild(overlay);
    }

    return () => {
      disposed = true;
    };
  },
};
