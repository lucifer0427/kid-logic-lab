import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { SeededRng } from '../../worker/prng';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

export const schulteGame: GameModule = {
  id: 'schulte',
  title: '3×3 舒爾特視覺尋序',
  subtitle: '由 1 到 9 依序找出每個數字並輕點，訓練穩定視覺掃描',
  ageTier: 'junior',
  ageLabel: '低年級 6–8 歲',
  evidenceBadge: '設計推論（視覺掃描練習）',
  primaryAxis: 'attentionStability',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const rng = new SeededRng(config.seed);
    const numbers = rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    let nextTarget = 1;
    let lastTapMs = performance.now();
    const trials: TrialRecord[] = [];
    let disposed = false;

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const visualTimer = new VisualTimer('尋序進度');
    const gridHost = document.createElement('div');
    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(gridHost);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    function render(): void {
      if (disposed) return;
      header.innerHTML = `
        <div class="stage-meta">
          <span class="badge">種子 #${config.seed}</span>
          <span class="badge">下一個目標：${nextTarget <= 9 ? nextTarget : '完成'}</span>
        </div>
      `;
      visualTimer.setProgress((nextTarget - 1) / 9);

      const cells = numbers
        .map((n) => {
          const found = n < nextTarget;
          return `
            <button type="button"
              class="schulte-cell ${found ? 'is-found' : ''}"
              data-num="${n}"
              aria-label="數字 ${n}${found ? '，已找到' : ''}">
              ${n}
            </button>
          `;
        })
        .join('');

      gridHost.innerHTML = `<div class="schulte-grid">${cells}</div>`;

      gridHost.querySelectorAll<HTMLButtonElement>('.schulte-cell').forEach((btn) => {
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          audioGateway.unlock();
          const num = Number(btn.dataset.num);
          const now = performance.now();
          const rtMs = Math.round(now - lastTapMs);
          lastTapMs = now;

          if (num === nextTarget) {
            audioGateway.playTone('success');
            trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
            nextTarget += 1;
            statusLine.textContent = nextTarget <= 9 ? `太棒了！接下來找 ${nextTarget}` : '全部找完囉！';
            render();

            if (nextTarget > 9) {
              audioGateway.playTone('complete');
              const metrics = computeSessionMetrics(trials);
              config.onSessionComplete({
                gameId: 'schulte',
                ageTier: 'junior',
                seed: config.seed,
                level: config.level,
                metrics,
                axisScores: {
                  attentionStability: metrics.asi,
                },
              });
            }
          } else if (num > nextTarget) {
            audioGateway.playTone('gentle');
            trials.push({ isTarget: true, correct: false, rtMs, errorType: 'commission' });
            statusLine.textContent = `要找的是 ${nextTarget} 喔，慢慢掃描畫面`;
          }
        });
      });
    }

    render();
    statusLine.textContent = '請從 1 開始依序點到 9';

    if (config.showTutorial) {
      const svg = `<div style="font-size:1.5rem;font-weight:700;color:#0072B2;">1 → 2 → 3 ... → 9</div>`;
      const overlay = createTutorialOverlay('依照順序從 1 點到 9', svg, () => {
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
