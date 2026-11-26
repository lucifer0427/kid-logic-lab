import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { FuzzyDdaController } from '../../engine/dda/fuzzyLogic';
import { SeededRng } from '../../worker/prng';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

const TOTAL_TRIALS = 18;

export const nbackGame: GameModule = {
  id: 'nback',
  title: '自適應 N-Back 工作記憶',
  subtitle: '觀察方塊出現的位置，若與「前第 N 步」相同就按下相同按鈕',
  ageTier: 'senior',
  ageLabel: '高年級 10–12 歲',
  evidenceBadge: '已獲近遷移實證（工作記憶更新）',
  primaryAxis: 'workingMemory',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const rng = new SeededRng(config.seed);
    const fuzzy = new FuzzyDdaController();
    const nLevel = config.level >= 2 ? 2 : 1; // Lv1 = 1-Back, Lv2+ = 2-Back
    let isiMs = 1500;

    const sequence: number[] = [];
    const trials: TrialRecord[] = [];
    let currentIdx = 0;
    let disposed = false;
    let timerId: number | null = null;
    let stimStartMs = 0;
    let awaiting = false;
    let responded = false;

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const visualTimer = new VisualTimer('練習進度');

    const canvas = document.createElement('canvas');
    canvas.className = 'gonogo-canvas';
    canvas.width = 300;
    canvas.height = 300;

    const matchBtn = document.createElement('button');
    matchBtn.type = 'button';
    matchBtn.className = 'btn btn-primary btn-lg';
    matchBtn.textContent = `位置與前第 ${nLevel} 步相同！（空白鍵）`;

    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(canvas);
    wrapper.appendChild(matchBtn);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    const ctx = canvas.getContext('2d')!;

    function drawGrid(activeCell: number | null): void {
      ctx.clearRect(0, 0, 300, 300);
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(0, 0, 300, 300);

      const cellSize = 86;
      const gap = 10;
      const offset = 11;

      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const idx = r * 3 + c;
          const x = offset + c * (cellSize + gap);
          const y = offset + r * (cellSize + gap);
          ctx.fillStyle = activeCell === idx ? '#0072B2' : '#E2E8F0';
          ctx.strokeStyle = '#94A3B8';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(x, y, cellSize, cellSize, 12);
          ctx.fill();
          ctx.stroke();
        }
      }
    }

    function isMatchTrial(idx: number): boolean {
      return idx >= nLevel && sequence[idx] === sequence[idx - nLevel];
    }

    function handleMatchPress(): void {
      if (!awaiting || responded || disposed) return;
      audioGateway.unlock();
      responded = true;
      const rtMs = Math.round(performance.now() - stimStartMs);
      const match = isMatchTrial(currentIdx);

      if (match) {
        audioGateway.playTone('success');
        trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
        statusLine.textContent = '命中！工作記憶更新精準';
      } else {
        audioGateway.playTone('gentle');
        trials.push({ isTarget: false, correct: false, rtMs, errorType: 'commission' });
        statusLine.textContent = '這一步位置不同喔';
      }
    }

    matchBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      handleMatchPress();
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        handleMatchPress();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    function adjustFuzzyIsi(): void {
      const recent = trials.slice(-6);
      if (recent.length < 4) return;
      const targets = recent.filter((t) => t.isTarget);
      const nonTargets = recent.filter((t) => !t.isTarget);
      const hitRate = targets.length > 0 ? targets.filter((t) => t.correct).length / targets.length : 0.8;
      const faRate = nonTargets.length > 0 ? nonTargets.filter((t) => !t.correct).length / nonTargets.length : 0;
      const delta = fuzzy.evaluateAdjustment({ hitRate, falseAlarmRate: faRate });
      isiMs = Math.round(Math.max(1050, Math.min(2000, isiMs - delta * 140)));
    }

    function runStep(): void {
      if (disposed) return;
      if (currentIdx >= TOTAL_TRIALS) {
        visualTimer.setProgress(1);
        audioGateway.playTone('complete');
        const metrics = computeSessionMetrics(trials);
        const nextLevel = metrics.accuracy >= 0.8 ? 2 : 1;
        config.onSessionComplete({
          gameId: 'nback',
          ageTier: 'senior',
          seed: config.seed,
          level: nextLevel,
          metrics,
          axisScores: {
            attentionStability: metrics.asi,
            workingMemory: Math.round(metrics.accuracy * 100),
          },
        });
        return;
      }

      visualTimer.setProgress(currentIdx / TOTAL_TRIALS);
      header.innerHTML = `
        <div class="stage-meta">
          <span class="badge">${nLevel}-Back 模式</span>
          <span class="badge">第 ${currentIdx + 1} / ${TOTAL_TRIALS} 步</span>
        </div>
      `;

      // ~35% match probability once past nLevel
      let cell = rng.int(0, 8);
      if (currentIdx >= nLevel && rng.next() < 0.35) {
        cell = sequence[currentIdx - nLevel];
      }
      sequence.push(cell);

      drawGrid(cell);
      stimStartMs = performance.now();
      awaiting = currentIdx >= nLevel;
      responded = false;

      timerId = window.setTimeout(() => {
        if (disposed) return;
        drawGrid(null);

        timerId = window.setTimeout(() => {
          if (disposed) return;
          awaiting = false;
          if (currentIdx >= nLevel && !responded) {
            const match = isMatchTrial(currentIdx);
            if (match) {
              trials.push({ isTarget: true, correct: false, rtMs: null, errorType: 'omission' });
              statusLine.textContent = '漏掉了相同位置喔';
            } else {
              trials.push({ isTarget: false, correct: true, rtMs: null, errorType: 'none' });
            }
          }
          adjustFuzzyIsi();
          currentIdx += 1;
          runStep();
        }, Math.round(isiMs * 0.45));
      }, Math.round(isiMs * 0.55));
    }

    drawGrid(null);

    if (config.showTutorial) {
      const svg = `<div style="font-size:1rem;font-weight:600;color:#0072B2;">記住前第 ${nLevel} 步的藍色方塊位置，相同就按按鈕！</div>`;
      const overlay = createTutorialOverlay(`比較目前位置與前第 ${nLevel} 步是否相同`, svg, () => {
        audioGateway.unlock();
        runStep();
      });
      wrapper.appendChild(overlay);
    } else {
      runStep();
    }

    return () => {
      disposed = true;
      if (timerId !== null) window.clearTimeout(timerId);
      window.removeEventListener('keydown', onKeyDown);
    };
  },
};
