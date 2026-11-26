import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { StaircaseController } from '../../engine/dda/staircase';
import { SeededRng } from '../../worker/prng';
import { OKABE_ITO_PALETTE, drawTokenOnCanvas } from '../../ui/theme/okabeIto';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

const TOTAL_TRIALS = 20;

export const goNoGoGame: GameModule = {
  id: 'gonogo',
  title: '分形節奏守護者',
  subtitle: '看到目標圖形輕輕點一下，遇到禁制星形忍住不按',
  ageTier: 'junior',
  ageLabel: '低年級 6–8 歲',
  evidenceBadge: '已獲範式實證（優勢反應抑制）',
  primaryAxis: 'impulseInhibition',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const rng = new SeededRng(config.seed);
    const staircase = new StaircaseController({
      initialLevel: config.level,
      minLevel: 1,
      maxLevel: 5,
    });

    const targetToken = OKABE_ITO_PALETTE[0]; // Orange Circle (Go)
    const distractorTokens = OKABE_ITO_PALETTE.slice(1, 4); // SkyBlue Square, Green Triangle, Blue Diamond
    const noGoToken = OKABE_ITO_PALETTE[4]; // Vermilion Star (No-Go)

    const trials: TrialRecord[] = [];
    let currentTrialIdx = 0;
    let disposed = false;
    let activeTimerId: number | null = null;
    let stimulusStartMs = 0;
    let awaitingResponse = false;
    let respondedThisTrial = false;
    let currentIsTarget = true;
    let feedbackText = '';
    let feedbackColor = '#0F172A';

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    header.innerHTML = `
      <div class="stage-meta">
        <span class="badge">種子 #${config.seed}</span>
        <span class="badge" id="gonogo-lvl">階梯 Lv.${staircase.currentLevel}</span>
      </div>
      <div class="target-legend" aria-label="規則提示">
        <span>點擊：<strong>橘色圓形</strong></span>
        <span>忍住：<strong>朱紅星形</strong></span>
      </div>
    `;

    const visualTimer = new VisualTimer('試次進度');
    const canvas = document.createElement('canvas');
    canvas.className = 'gonogo-canvas';
    canvas.width = 480;
    canvas.height = 360;
    canvas.setAttribute('role', 'button');
    canvas.setAttribute('tabindex', '0');
    canvas.setAttribute('aria-label', '刺激反應區，看到橘色圓形請點擊或按空白鍵');

    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';
    statusLine.textContent = '準備好了嗎？看到橘色圓形輕輕點一下';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(canvas);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    const ctx = canvas.getContext('2d')!;
    const lvlBadge = header.querySelector('#gonogo-lvl') as HTMLElement;

    function clearCanvas(hint = ''): void {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Gentle fixation cross
      ctx.strokeStyle = '#94A3B8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(canvas.width / 2 - 12, canvas.height / 2);
      ctx.lineTo(canvas.width / 2 + 12, canvas.height / 2);
      ctx.moveTo(canvas.width / 2, canvas.height / 2 - 12);
      ctx.lineTo(canvas.width / 2, canvas.height / 2 + 12);
      ctx.stroke();

      if (hint) {
        ctx.fillStyle = feedbackColor;
        ctx.font = '600 20px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(hint, canvas.width / 2, canvas.height - 28);
      }
    }

    function handleResponse(): void {
      if (!awaitingResponse || respondedThisTrial || disposed) return;
      audioGateway.unlock();
      respondedThisTrial = true;
      const rtMs = Math.round(performance.now() - stimulusStartMs);

      if (currentIsTarget) {
        audioGateway.playTone('success');
        feedbackText = '穩定命中！';
        feedbackColor = '#009E73';
        trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
        staircase.record(true);
      } else {
        audioGateway.playTone('gentle');
        feedbackText = '這是禁制星形，下次忍住喔';
        feedbackColor = '#D55E00';
        trials.push({ isTarget: false, correct: false, rtMs, errorType: 'commission' });
        staircase.record(false);
      }
      lvlBadge.textContent = `階梯 Lv.${staircase.currentLevel}`;
      statusLine.textContent = feedbackText;
    }

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      handleResponse();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        handleResponse();
      }
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);

    function finishSession(): void {
      if (disposed) return;
      audioGateway.playTone('complete');
      const metrics = computeSessionMetrics(trials);
      const commissionRate =
        trials.filter((t) => !t.isTarget).length > 0
          ? metrics.commissionErrors / trials.filter((t) => !t.isTarget).length
          : 0;
      const inhibitionScore = Math.round((1 - commissionRate) * 100);

      config.onSessionComplete({
        gameId: 'gonogo',
        ageTier: 'junior',
        seed: config.seed,
        level: staircase.currentLevel,
        metrics,
        axisScores: {
          attentionStability: metrics.asi,
          impulseInhibition: inhibitionScore,
        },
      });
    }

    function runNextTrial(): void {
      if (disposed) return;
      if (currentTrialIdx >= TOTAL_TRIALS) {
        visualTimer.setProgress(1);
        finishSession();
        return;
      }

      visualTimer.setProgress(currentTrialIdx / TOTAL_TRIALS);
      currentTrialIdx += 1;

      // Fractal-like jittered ISI (700ms - 1450ms) to prevent rhythmic guessing
      const isi = 700 + rng.int(0, 750);
      clearCanvas();

      activeTimerId = window.setTimeout(() => {
        if (disposed) return;

        // Higher staircase level slightly increases No-Go ratio (25% -> 35%) and tightens window
        const noGoProb = 0.25 + (staircase.currentLevel - 1) * 0.025;
        currentIsTarget = rng.next() >= noGoProb;

        const token = currentIsTarget
          ? targetToken
          : rng.next() < 0.7
            ? noGoToken
            : distractorTokens[rng.int(0, distractorTokens.length - 1)];

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#F8FAFC';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        drawTokenOnCanvas(ctx, token, canvas.width / 2, canvas.height / 2, 68);

        stimulusStartMs = performance.now();
        awaitingResponse = true;
        respondedThisTrial = false;
        statusLine.textContent = `第 ${currentTrialIdx} / ${TOTAL_TRIALS} 次`;

        const responseWindowMs = Math.max(950, 1650 - (staircase.currentLevel - 1) * 140);

        activeTimerId = window.setTimeout(() => {
          if (disposed) return;
          awaitingResponse = false;

          if (!respondedThisTrial) {
            if (currentIsTarget) {
              trials.push({ isTarget: true, correct: false, rtMs: null, errorType: 'omission' });
              staircase.record(false);
              feedbackText = '漏掉了橘色圓形，專心看看喔';
              feedbackColor = '#D55E00';
            } else {
              audioGateway.playTone('success');
              trials.push({ isTarget: false, correct: true, rtMs: null, errorType: 'none' });
              staircase.record(true);
              feedbackText = '成功忍住！';
              feedbackColor = '#009E73';
            }
            lvlBadge.textContent = `階梯 Lv.${staircase.currentLevel}`;
            statusLine.textContent = feedbackText;
          }

          clearCanvas(feedbackText);
          activeTimerId = window.setTimeout(runNextTrial, 420);
        }, responseWindowMs);
      }, isi);
    }

    if (config.showTutorial) {
      const tutorialSvg = `
        <svg viewBox="0 0 240 120" width="240" height="120" aria-hidden="true">
          <circle cx="65" cy="55" r="28" fill="#E69F00" stroke="#0F172A" stroke-width="3"/>
          <text x="65" y="106" text-anchor="middle" font-size="14" fill="#009E73" font-weight="bold">✓ 輕點</text>
          <polygon points="175,27 183,46 204,46 187,58 193,78 175,66 157,78 163,58 146,46 167,46" fill="#D55E00" stroke="#0F172A" stroke-width="3"/>
          <text x="175" y="106" text-anchor="middle" font-size="14" fill="#D55E00" font-weight="bold">✕ 忍住不按</text>
        </svg>
      `;
      const overlay = createTutorialOverlay('看到橘色圓形點一下，看到朱紅星形忍住！', tutorialSvg, () => {
        audioGateway.unlock();
        runNextTrial();
      });
      wrapper.appendChild(overlay);
    } else {
      runNextTrial();
    }

    return () => {
      disposed = true;
      if (activeTimerId !== null) window.clearTimeout(activeTimerId);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  },
};
