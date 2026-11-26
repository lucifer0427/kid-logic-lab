import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { StaircaseController } from '../../engine/dda/staircase';
import { SeededRng } from '../../worker/prng';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

const TOTAL_TRIALS = 12;

export const waitSignalGame: GameModule = {
  id: 'waitSignal',
  title: '耐心等待訊號（抗搶按）',
  subtitle: '能量環還在充能時忍住不按，等到變成「藍綠星星 ✓」再穩穩點一下',
  ageTier: 'junior',
  ageLabel: '低年級 6–8 歲・ADHD 特訓',
  evidenceBadge: '延遲滿足與衝動抑制（DRT 範式）',
  primaryAxis: 'impulseInhibition',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const rng = new SeededRng(config.seed);
    const staircase = new StaircaseController({
      initialLevel: config.level,
      minLevel: 1,
      maxLevel: 4,
    });

    const trials: TrialRecord[] = [];
    let currentIdx = 0;
    let disposed = false;
    let phase: 'charging' | 'ready' | 'cooldown' = 'cooldown';
    let readyStartMs = 0;
    let timerId: number | null = null;
    let rafId: number | null = null;
    let chargeStartMs = 0;
    let chargeDurationMs = 2000;

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const visualTimer = new VisualTimer('練習進度');

    const canvas = document.createElement('canvas');
    canvas.className = 'gonogo-canvas';
    canvas.width = 420;
    canvas.height = 280;
    canvas.setAttribute('role', 'button');
    canvas.setAttribute('tabindex', '0');
    canvas.setAttribute('aria-label', '耐心等待訊號區，等訊號變藍綠再點');

    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';
    statusLine.textContent = '深呼吸，等圓環充飽變藍綠色再點！';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(canvas);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    const ctx = canvas.getContext('2d')!;

    function drawFrame(progress: number, ready: boolean, message = ''): void {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const cx = canvas.width / 2;
      const cy = canvas.height / 2 - 10;
      const r = 68;

      // Track ring
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      // Active arc (Okabe-Ito Orange while waiting, Bluish Green when ready)
      ctx.strokeStyle = ready ? '#009E73' : '#E69F00';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, progress));
      ctx.stroke();

      // Center icon
      ctx.fillStyle = ready ? '#009E73' : '#475569';
      ctx.font = 'bold 28px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ready ? '✓ 點！' : '等等...', cx, cy);

      if (message) {
        ctx.fillStyle = '#0F172A';
        ctx.font = '600 17px system-ui, sans-serif';
        ctx.fillText(message, cx, canvas.height - 24);
      }
    }

    function animateCharge(): void {
      if (disposed || phase !== 'charging') return;
      const elapsed = performance.now() - chargeStartMs;
      const frac = Math.min(1, elapsed / chargeDurationMs);
      drawFrame(frac, false);

      if (frac >= 1) {
        phase = 'ready';
        readyStartMs = performance.now();
        audioGateway.playPentatonic(2);
        drawFrame(1, true, '現在可以點了！');

        const windowMs = Math.max(1200, 2200 - (staircase.currentLevel - 1) * 200);
        timerId = window.setTimeout(() => {
          if (disposed || phase !== 'ready') return;
          phase = 'cooldown';
          trials.push({ isTarget: true, correct: false, rtMs: null, errorType: 'omission' });
          staircase.record(false);
          statusLine.textContent = '錯過訊號了，下一輪專心看圓環喔';
          currentIdx += 1;
          timerId = window.setTimeout(startTrial, 550);
        }, windowMs);
      } else {
        rafId = window.requestAnimationFrame(animateCharge);
      }
    }

    function handleTap(): void {
      if (disposed || phase === 'cooldown') return;
      audioGateway.unlock();

      if (phase === 'charging') {
        // Premature impulsive tap (delay aversion)
        if (rafId !== null) window.cancelAnimationFrame(rafId);
        phase = 'cooldown';
        audioGateway.playTone('gentle');
        trials.push({ isTarget: false, correct: false, rtMs: null, errorType: 'commission' });
        staircase.record(false);
        drawFrame(0, false, '太早按囉！等變成藍綠色再點');
        statusLine.textContent = '差一點點，先深呼吸忍住，等「✓ 點！」出現';
        currentIdx += 1;
        timerId = window.setTimeout(startTrial, 750);
        return;
      }

      if (phase === 'ready') {
        if (timerId !== null) window.clearTimeout(timerId);
        phase = 'cooldown';
        const rtMs = Math.round(performance.now() - readyStartMs);
        audioGateway.playPentatonic(4);
        trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
        staircase.record(true);
        drawFrame(1, true, '太穩了！耐心等待成功！');
        statusLine.textContent = `穩定命中！（反應 ${rtMs} ms）`;
        currentIdx += 1;
        timerId = window.setTimeout(startTrial, 550);
      }
    }

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      handleTap();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        handleTap();
      }
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);

    function startTrial(): void {
      if (disposed) return;
      if (currentIdx >= TOTAL_TRIALS) {
        visualTimer.setProgress(1);
        audioGateway.playTone('complete');
        const metrics = computeSessionMetrics(trials);
        const premature = metrics.commissionErrors;
        const inhibitionScore = Math.max(0, Math.round((1 - premature / TOTAL_TRIALS) * 100));
        config.onSessionComplete({
          gameId: 'waitSignal',
          ageTier: 'junior',
          seed: config.seed,
          level: staircase.currentLevel,
          metrics,
          axisScores: {
            attentionStability: metrics.asi,
            impulseInhibition: inhibitionScore,
          },
        });
        return;
      }

      visualTimer.setProgress(currentIdx / TOTAL_TRIALS);
      header.innerHTML = `
        <div class="stage-meta">
          <span class="badge">第 ${currentIdx + 1} / ${TOTAL_TRIALS} 輪</span>
          <span class="badge">耐心階梯 Lv.${staircase.currentLevel}</span>
        </div>
      `;

      // Variable delay (1.4s to 3.4s + staircase offset) so rhythmic counting fails
      chargeDurationMs = 1400 + staircase.currentLevel * 250 + rng.int(0, 1400);
      chargeStartMs = performance.now();
      phase = 'charging';
      statusLine.textContent = '等圓環充飽變藍綠色...忍住不按喔！';
      rafId = window.requestAnimationFrame(animateCharge);
    }

    drawFrame(0, false);

    if (config.showTutorial) {
      const svg = `<div style="font-size:0.95rem;font-weight:600;color:#009E73;">橘色充能中 ⏳ 忍住 → 變成藍綠色 ✓ 再點！</div>`;
      const overlay = createTutorialOverlay('練習等待訊號：沒變藍綠色前先忍住不按喔', svg, () => {
        audioGateway.unlock();
        startTrial();
      });
      wrapper.appendChild(overlay);
    } else {
      startTrial();
    }

    return () => {
      disposed = true;
      if (timerId !== null) window.clearTimeout(timerId);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  },
};
