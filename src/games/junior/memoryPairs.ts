import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { SeededRng } from '../../worker/prng';
import { renderThemedTokenSvg } from '../../ui/theme/okabeIto';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

export const memoryPairsGame: GameModule = {
  id: 'memoryPairs',
  title: '記憶翻牌配對',
  subtitle: '記住每張卡片底下的圖形位置，翻出兩張一模一樣的圖形配對成功！',
  ageTier: 'junior',
  ageLabel: '低年級 6–8 歲',
  evidenceBadge: '視覺空間短期記憶（Memory Match）',
  primaryAxis: 'workingMemory',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const rng = new SeededRng(config.seed);
    const skin = config.themeSkin ?? 'geometry';
    const pairCount = config.level >= 2 ? 8 : 6; // 12 cards (4x3) or 16 cards (4x4)
    const deck = rng.shuffle(
      Array.from({ length: pairCount }, (_, i) => i % 6).flatMap((v) => [v, v]),
    );
    const matched = new Array<boolean>(deck.length).fill(false);
    let flipped: number[] = [];
    let locked = false;
    const trials: TrialRecord[] = [];
    let lastFlipMs = performance.now();
    let disposed = false;

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const visualTimer = new VisualTimer('配對進度');
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
      const donePairs = matched.filter(Boolean).length / 2;
      visualTimer.setProgress(donePairs / pairCount);

      header.innerHTML = `
        <div class="stage-meta">
          <span class="badge">已配對 ${donePairs} / ${pairCount} 組</span>
        </div>
      `;

      boardHost.innerHTML = `
        <div class="memory-grid" style="grid-template-columns: repeat(4, 68px);">
          ${deck
            .map((tokIdx, idx) => {
              const show = matched[idx] || flipped.includes(idx);
              return `
              <button type="button"
                class="memory-card ${show ? 'is-open' : ''} ${matched[idx] ? 'is-matched' : ''}"
                data-idx="${idx}"
                aria-label="第 ${idx + 1} 張卡片">
                ${show ? renderThemedTokenSvg(tokIdx, skin, 40) : '?'}
              </button>
            `;
            })
            .join('')}
        </div>
      `;

      boardHost.querySelectorAll<HTMLButtonElement>('.memory-card').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.dataset.idx);
          if (locked || matched[idx] || flipped.includes(idx) || disposed) return;
          audioGateway.unlock();
          flipped.push(idx);
          audioGateway.playPentatonic(flipped.length);
          render();

          if (flipped.length === 2) {
            locked = true;
            const rtMs = Math.round(performance.now() - lastFlipMs);
            lastFlipMs = performance.now();
            const [a, b] = flipped;
            if (deck[a] === deck[b]) {
              matched[a] = true;
              matched[b] = true;
              flipped = [];
              locked = false;
              audioGateway.playTone('success');
              trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
              statusLine.textContent = '配對成功！';
              render();

              if (matched.every(Boolean)) {
                audioGateway.playTone('complete');
                const metrics = computeSessionMetrics(trials);
                config.onSessionComplete({
                  gameId: 'memoryPairs',
                  ageTier: 'junior',
                  seed: config.seed,
                  level: config.level,
                  metrics,
                  axisScores: {
                    attentionStability: metrics.asi,
                    workingMemory: Math.round(metrics.accuracy * 100),
                  },
                });
              }
            } else {
              trials.push({ isTarget: true, correct: false, rtMs, errorType: 'commission' });
              statusLine.textContent = '記住這兩張的位置喔！';
              window.setTimeout(() => {
                if (disposed) return;
                flipped = [];
                locked = false;
                render();
              }, 650);
            }
          }
        });
      });
    }

    render();
    statusLine.textContent = '翻開兩張卡片，找出所有一模一樣的配對！';

    if (config.showTutorial) {
      const svg = `<div style="font-size:0.95rem;font-weight:600;color:#0072B2;">記住翻過的圖形位置，一次翻開兩張一樣的就得分！</div>`;
      const overlay = createTutorialOverlay('記憶卡片位置並完成全部配對', svg, () => {
        audioGateway.unlock();
        lastFlipMs = performance.now();
      });
      wrapper.appendChild(overlay);
    }

    return () => {
      disposed = true;
    };
  },
};
