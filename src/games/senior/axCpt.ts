import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { SeededRng } from '../../worker/prng';
import { OKABE_ITO_PALETTE, drawTokenOnCanvas } from '../../ui/theme/okabeIto';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

/**
 * AX-CPT (Continuous Performance Test) adapted for 10–12yo ADHD vigilance & proactive control.
 * Rule: Press ONLY when Cue (Star, idx 4) is immediately followed by Probe (Diamond, idx 3).
 * Inhibit on Star -> Circle (AY lure), Square -> Diamond (BX lure), or Square -> Circle (BY).
 */
export type CptSymbol = 'A' | 'X' | 'B' | 'Y';

export function isAxTarget(prev: CptSymbol | null, current: CptSymbol): boolean {
  return prev === 'A' && current === 'X';
}

const TOTAL_STEPS = 24;

export const axCptGame: GameModule = {
  id: 'axCpt',
  title: '雙步線索巡邏員（AX-CPT）',
  subtitle: '記住前一個線索：只有「朱紅星形 ★」緊接著「深藍菱形 ◆」時才點擊！',
  ageTier: 'senior',
  ageLabel: '高年級 10–12 歲・ADHD 特訓',
  evidenceBadge: '已獲臨床範式實證（AX-CPT 持續警覺與脈絡維持）',
  primaryAxis: 'attentionStability',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const rng = new SeededRng(config.seed);
    const trials: TrialRecord[] = [];
    let stepIdx = 0;
    let prevSym: CptSymbol | null = null;
    let curSym: CptSymbol = 'B';
    let disposed = false;
    let timerId: number | null = null;
    let stimStartMs = 0;
    let awaiting = false;
    let responded = false;

    const SYMBOL_TOKEN_IDX: Record<CptSymbol, number> = {
      A: 4, // Vermilion Star (Cue A)
      X: 3, // Blue Diamond (Probe X)
      B: 1, // SkyBlue Square (Non-A cue)
      Y: 0, // Orange Circle (Non-X probe)
    };

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    header.innerHTML = `
      <div class="stage-meta">
        <span class="badge">AX-CPT 持續專注</span>
        <span class="badge">目標組合：★ 接著 ◆</span>
      </div>
    `;

    const visualTimer = new VisualTimer('巡邏進度');
    const canvas = document.createElement('canvas');
    canvas.className = 'gonogo-canvas';
    canvas.width = 400;
    canvas.height = 260;
    canvas.setAttribute('role', 'button');
    canvas.setAttribute('tabindex', '0');

    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';
    statusLine.textContent = '看到 ★ 後緊接著出現 ◆ 時輕點畫面（或按空白鍵）';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(canvas);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    const ctx = canvas.getContext('2d')!;

    function clearStage(): void {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#94A3B8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(canvas.width / 2 - 10, canvas.height / 2);
      ctx.lineTo(canvas.width / 2 + 10, canvas.height / 2);
      ctx.moveTo(canvas.width / 2, canvas.height / 2 - 10);
      ctx.lineTo(canvas.width / 2, canvas.height / 2 + 10);
      ctx.stroke();
    }

    function handlePress(): void {
      if (!awaiting || responded || disposed) return;
      audioGateway.unlock();
      responded = true;
      const rtMs = Math.round(performance.now() - stimStartMs);
      const target = isAxTarget(prevSym, curSym);

      if (target) {
        audioGateway.playPentatonic(4);
        trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
        statusLine.textContent = '精準命中 ★ → ◆ 組合！';
      } else {
        audioGateway.playTone('gentle');
        trials.push({ isTarget: false, correct: false, rtMs, errorType: 'commission' });
        statusLine.textContent = '這是干擾誘餌喔，必須「前一個是 ★」且「這一個是 ◆」才按！';
      }
    }

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      handlePress();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        handlePress();
      }
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);

    function nextStep(): void {
      if (disposed) return;
      if (stepIdx >= TOTAL_STEPS) {
        visualTimer.setProgress(1);
        audioGateway.playTone('complete');
        const metrics = computeSessionMetrics(trials);
        config.onSessionComplete({
          gameId: 'axCpt',
          ageTier: 'senior',
          seed: config.seed,
          level: config.level,
          metrics,
          axisScores: {
            attentionStability: metrics.asi,
            workingMemory: Math.round(metrics.accuracy * 100),
          },
        });
        return;
      }

      visualTimer.setProgress(stepIdx / TOTAL_STEPS);

      // Generate alternating Cue (even steps) -> Probe (odd steps) pairs
      if (stepIdx % 2 === 0) {
        prevSym = null;
        curSym = rng.next() < 0.65 ? 'A' : 'B';
      } else {
        // Probe step following Cue
        const roll = rng.next();
        if (prevSym === 'A') {
          curSym = roll < 0.65 ? 'X' : 'Y'; // AX (target) or AY (lure)
        } else {
          curSym = roll < 0.5 ? 'X' : 'Y'; // BX (lure) or BY
        }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const token = OKABE_ITO_PALETTE[SYMBOL_TOKEN_IDX[curSym]];
      drawTokenOnCanvas(ctx, token, canvas.width / 2, canvas.height / 2, 62);

      stimStartMs = performance.now();
      awaiting = true;
      responded = false;

      const stimDurationMs = 950;
      const isiMs = 550;

      timerId = window.setTimeout(() => {
        if (disposed) return;
        clearStage();
        timerId = window.setTimeout(() => {
          if (disposed) return;
          awaiting = false;
          const target = isAxTarget(prevSym, curSym);
          if (!responded) {
            if (target) {
              trials.push({ isTarget: true, correct: false, rtMs: null, errorType: 'omission' });
              statusLine.textContent = '漏掉了 ★ → ◆ 組合喔！';
            } else {
              trials.push({ isTarget: false, correct: true, rtMs: null, errorType: 'none' });
            }
          }
          prevSym = curSym;
          stepIdx += 1;
          nextStep();
        }, isiMs);
      }, stimDurationMs);
    }

    clearStage();

    if (config.showTutorial) {
      const svg = `<div style="font-size:0.95rem;font-weight:600;color:#0072B2;">只有「朱紅星形 ★」→ 緊接著「深藍菱形 ◆」時才點擊！</div>`;
      const overlay = createTutorialOverlay('記住前一個圖形，只有 ★ 接 ◆ 才點擊，其他誘餌忍住不按', svg, () => {
        audioGateway.unlock();
        nextStep();
      });
      wrapper.appendChild(overlay);
    } else {
      nextStep();
    }

    return () => {
      disposed = true;
      if (timerId !== null) window.clearTimeout(timerId);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  },
};
