import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { StaircaseController } from '../../engine/dda/staircase';
import { SeededRng } from '../../worker/prng';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

const TOTAL_ROUNDS = 4;

export const symmetryGridGame: GameModule = {
  id: 'symmetryGrid',
  title: '鏡像對稱畫板',
  subtitle: '觀察左半邊的圖案，在右半邊點出完全左右鏡像對稱的格子',
  ageTier: 'junior',
  ageLabel: '低年級 6–8 歲',
  evidenceBadge: '空間認知延伸（心像翻轉與對稱）',
  primaryAxis: 'deductiveReasoning',

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
    let rows = 4;
    let halfCols = 3;
    let leftPattern: boolean[] = [];
    let rightGrid: boolean[] = [];
    let lastTapMs = performance.now();

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const visualTimer = new VisualTimer('對稱進度');
    const boardHost = document.createElement('div');
    const checkBtn = document.createElement('button');
    checkBtn.type = 'button';
    checkBtn.className = 'btn btn-primary btn-lg';
    checkBtn.textContent = '檢查對稱 ✓';
    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(boardHost);
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
          gameId: 'symmetryGrid',
          ageTier: 'junior',
          seed: config.seed,
          level: staircase.currentLevel,
          metrics,
          axisScores: {
            attentionStability: metrics.asi,
            deductiveReasoning: Math.round(metrics.accuracy * 100),
          },
        });
        return;
      }

      visualTimer.setProgress(round / TOTAL_ROUNDS);
      rows = staircase.currentLevel >= 2 ? 5 : 4;
      halfCols = staircase.currentLevel >= 3 ? 4 : 3;
      const totalHalf = rows * halfCols;
      const activeCount = Math.min(totalHalf - 2, 3 + staircase.currentLevel + round);
      const picks = new Set(rng.shuffle(Array.from({ length: totalHalf }, (_, i) => i)).slice(0, activeCount));

      leftPattern = Array.from({ length: totalHalf }, (_, i) => picks.has(i));
      rightGrid = new Array<boolean>(totalHalf).fill(false);
      transitioning = false;
      lastTapMs = performance.now();
      render();
    }

    let transitioning = false;

    function render(): void {
      if (disposed) return;
      header.innerHTML = `
        <div class="stage-meta">
          <span class="badge">第 ${round + 1} / ${TOTAL_ROUNDS} 關</span>
          <span class="badge">${rows}×${halfCols * 2} 鏡像畫板</span>
        </div>
      `;

      const leftHtml = leftPattern
        .map((on) => `<div class="sym-cell sym-fixed ${on ? 'is-on' : ''}"></div>`)
        .join('');

      const rightHtml = rightGrid
        .map(
          (on, idx) =>
            `<button type="button" class="sym-cell sym-btn ${on ? 'is-on' : ''}" data-idx="${idx}" aria-label="右半邊第 ${idx + 1} 格"></button>`,
        )
        .join('');

      boardHost.innerHTML = `
        <div class="sym-split">
          <div class="sym-half" style="grid-template-columns: repeat(${halfCols}, 44px);">${leftHtml}</div>
          <div class="sym-axis" aria-hidden="true"></div>
          <div class="sym-half" style="grid-template-columns: repeat(${halfCols}, 44px);">${rightHtml}</div>
        </div>
      `;

      boardHost.querySelectorAll<HTMLButtonElement>('.sym-btn').forEach((btn) => {
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          audioGateway.unlock();
          const idx = Number(btn.dataset.idx);
          rightGrid[idx] = !rightGrid[idx];
          audioGateway.playPentatonic(idx);
          render();
        });
      });
    }

    checkBtn.addEventListener('click', () => {
      if (transitioning || disposed) return;
      audioGateway.unlock();
      const rtMs = Math.round(performance.now() - lastTapMs);
      lastTapMs = performance.now();

      let allMatch = true;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < halfCols; c++) {
          const leftVal = leftPattern[r * halfCols + c];
          const mirrorCol = halfCols - 1 - c;
          const rightVal = rightGrid[r * halfCols + mirrorCol];
          if (leftVal !== rightVal) allMatch = false;
        }
      }

      if (allMatch) {
        transitioning = true;
        audioGateway.playTone('success');
        trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
        staircase.record(true);
        statusLine.textContent = '完美鏡像對稱！';
        round += 1;
        window.setTimeout(startRound, 400);
      } else {
        audioGateway.playTone('gentle');
        trials.push({ isTarget: true, correct: false, rtMs, errorType: 'rule' });
        staircase.record(false);
        statusLine.textContent = '還差一點點喔！想像沿著中間虛線對摺看看';
      }
    });

    if (config.showTutorial) {
      const svg = `<div style="font-size:0.95rem;font-weight:600;color:#0072B2;">沿著中間紅線對摺，左右兩邊要一模一樣喔！</div>`;
      const overlay = createTutorialOverlay('在右半邊點出與左邊左右相反的對稱圖案', svg, () => {
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
