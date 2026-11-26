import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { StaircaseController } from '../../engine/dda/staircase';
import { SeededRng } from '../../worker/prng';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

const TOTAL_ROUNDS = 5;

export const fireflyMemoryGame: GameModule = {
  id: 'fireflyMemory',
  title: '路徑記憶螢火蟲',
  subtitle: '記住發光石頭亮起的順序，等光芒停下後依序點出來',
  ageTier: 'junior',
  ageLabel: '低年級 6–8 歲',
  evidenceBadge: '範式實證延伸（Corsi 視覺空間記憶）',
  primaryAxis: 'workingMemory',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const rng = new SeededRng(config.seed);
    const staircase = new StaircaseController({
      initialLevel: config.level,
      minLevel: 1,
      maxLevel: 3,
    });

    const trials: TrialRecord[] = [];
    let round = 0;
    let disposed = false;
    let isShowing = true;
    let sequence: number[] = [];
    let userStep = 0;
    let litIdx: number | null = null;
    let lastTapMs = performance.now();

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const visualTimer = new VisualTimer('記憶關卡進度');
    const boardHost = document.createElement('div');
    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(boardHost);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    function gridDim(): number {
      return staircase.currentLevel >= 3 ? 4 : 3;
    }

    function render(): void {
      if (disposed) return;
      const dim = gridDim();
      header.innerHTML = `
        <div class="stage-meta">
          <span class="badge">第 ${Math.min(round + 1, TOTAL_ROUNDS)} / ${TOTAL_ROUNDS} 關</span>
          <span class="badge">階梯 Lv.${staircase.currentLevel}（記憶 ${sequence.length} 顆）</span>
        </div>
      `;

      const cells = Array.from({ length: dim * dim }, (_, i) => {
        const isLit = litIdx === i;
        return `
          <button type="button"
            class="firefly-stone ${isLit ? 'is-lit' : ''}"
            data-idx="${i}"
            aria-label="石頭 ${i + 1}">
            ${isLit ? '✨' : '●'}
          </button>
        `;
      }).join('');

      boardHost.innerHTML = `
        <div class="firefly-grid" style="grid-template-columns: repeat(${dim}, 74px);">
          ${cells}
        </div>
      `;

      boardHost.querySelectorAll<HTMLButtonElement>('.firefly-stone').forEach((btn) => {
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          if (isShowing || disposed) return;
          handleStoneTap(Number(btn.dataset.idx));
        });
      });
    }

    async function playRound(): Promise<void> {
      if (disposed) return;
      if (round >= TOTAL_ROUNDS) {
        visualTimer.setProgress(1);
        audioGateway.playTone('complete');
        const metrics = computeSessionMetrics(trials);
        config.onSessionComplete({
          gameId: 'fireflyMemory',
          ageTier: 'junior',
          seed: config.seed,
          level: staircase.currentLevel,
          metrics,
          axisScores: {
            attentionStability: metrics.asi,
            workingMemory: Math.round(metrics.accuracy * 100),
          },
        });
        return;
      }

      visualTimer.setProgress(round / TOTAL_ROUNDS);
      const dim = gridDim();
      const seqLen = Math.min(6, 2 + staircase.currentLevel + Math.floor(round / 2));
      const pool = rng.shuffle(Array.from({ length: dim * dim }, (_, i) => i));
      sequence = pool.slice(0, seqLen);
      userStep = 0;
      isShowing = true;
      statusLine.textContent = '專心看螢火蟲飛過哪些石頭喔...';
      render();

      await new Promise((r) => window.setTimeout(r, 500));

      for (let i = 0; i < sequence.length; i++) {
        if (disposed) return;
        litIdx = sequence[i];
        audioGateway.playPentatonic(i);
        render();
        await new Promise((r) => window.setTimeout(r, 520));
        litIdx = null;
        render();
        await new Promise((r) => window.setTimeout(r, 220));
      }

      if (disposed) return;
      isShowing = false;
      lastTapMs = performance.now();
      statusLine.textContent = '換你點點看！照剛剛的順序點出來';
    }

    function handleStoneTap(idx: number): void {
      audioGateway.unlock();
      const now = performance.now();
      const rtMs = Math.round(now - lastTapMs);
      lastTapMs = now;

      if (idx === sequence[userStep]) {
        audioGateway.playPentatonic(userStep);
        litIdx = idx;
        render();
        window.setTimeout(() => {
          if (!disposed && !isShowing) {
            litIdx = null;
            render();
          }
        }, 200);

        userStep += 1;
        if (userStep >= sequence.length) {
          trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
          staircase.record(true);
          statusLine.textContent = '記憶完全正確！準備下一關';
          round += 1;
          isShowing = true;
          window.setTimeout(() => void playRound(), 600);
        }
      } else {
        audioGateway.playTone('gentle');
        trials.push({ isTarget: true, correct: false, rtMs, errorType: 'rule' });
        staircase.record(false);
        statusLine.textContent = '差一點點！我們來看下一組路徑';
        round += 1;
        isShowing = true;
        window.setTimeout(() => void playRound(), 700);
      }
    }

    if (config.showTutorial) {
      const svg = `<div style="font-size:1rem;font-weight:600;color:#0072B2;">✨ 亮燈 1 → 亮燈 2 → 依序點出來！</div>`;
      const overlay = createTutorialOverlay('先看螢火蟲依序停在哪裡，再跟著點出來', svg, () => {
        audioGateway.unlock();
        void playRound();
      });
      wrapper.appendChild(overlay);
    } else {
      void playRound();
    }

    return () => {
      disposed = true;
    };
  },
};
