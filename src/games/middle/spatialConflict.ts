import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { SeededRng } from '../../worker/prng';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

const TOTAL_TRIALS = 18;

export const spatialConflictGame: GameModule = {
  id: 'spatialConflict',
  title: '空間衝突方向判別',
  subtitle: '不管圖形出現在左邊還是右邊，只依「箭頭指的方向」點擊對應按鈕',
  ageTier: 'middle',
  ageLabel: '中年級 8–10 歲',
  evidenceBadge: '已獲範式實證（Simon / Dots 空間衝突）',
  primaryAxis: 'impulseInhibition',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const rng = new SeededRng(config.seed);
    const trials: TrialRecord[] = [];
    let currentIdx = 0;
    let disposed = false;
    let arrowDir: 'left' | 'right' = 'left';
    let trialStartMs = performance.now();
    let awaiting = false;

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const visualTimer = new VisualTimer('練習進度');

    const canvas = document.createElement('canvas');
    canvas.className = 'gonogo-canvas';
    canvas.width = 480;
    canvas.height = 240;

    const btnRow = document.createElement('div');
    btnRow.className = 'conflict-btn-row';
    btnRow.innerHTML = `
      <button type="button" class="btn btn-outline btn-lg conflict-btn" data-dir="left">⬅ 左邊方向</button>
      <button type="button" class="btn btn-outline btn-lg conflict-btn" data-dir="right">右邊方向 ➡</button>
    `;

    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(canvas);
    wrapper.appendChild(btnRow);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    const ctx = canvas.getContext('2d')!;

    function drawArrow(side: 'left' | 'right', dir: 'left' | 'right'): void {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Center fixation line
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(canvas.width / 2, 20);
      ctx.lineTo(canvas.width / 2, canvas.height - 20);
      ctx.stroke();
      ctx.setLineDash([]);

      const cx = side === 'left' ? 120 : 360;
      const cy = canvas.height / 2;
      const isIncongruent = side !== dir;

      ctx.save();
      ctx.fillStyle = isIncongruent ? '#D55E00' : '#0072B2';
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 3;
      ctx.beginPath();
      if (dir === 'right') {
        ctx.moveTo(cx - 38, cy - 16);
        ctx.lineTo(cx + 8, cy - 16);
        ctx.lineTo(cx + 8, cy - 34);
        ctx.lineTo(cx + 44, cy);
        ctx.lineTo(cx + 8, cy + 34);
        ctx.lineTo(cx + 8, cy + 16);
        ctx.lineTo(cx - 38, cy + 16);
      } else {
        ctx.moveTo(cx + 38, cy - 16);
        ctx.lineTo(cx - 8, cy - 16);
        ctx.lineTo(cx - 8, cy - 34);
        ctx.lineTo(cx - 44, cy);
        ctx.lineTo(cx - 8, cy + 34);
        ctx.lineTo(cx - 8, cy + 16);
        ctx.lineTo(cx + 38, cy + 16);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    function nextTrial(): void {
      if (disposed) return;
      if (currentIdx >= TOTAL_TRIALS) {
        visualTimer.setProgress(1);
        audioGateway.playTone('complete');
        const metrics = computeSessionMetrics(trials);
        config.onSessionComplete({
          gameId: 'spatialConflict',
          ageTier: 'middle',
          seed: config.seed,
          level: config.level,
          metrics,
          axisScores: {
            attentionStability: metrics.asi,
            impulseInhibition: Math.round(metrics.accuracy * 100),
          },
        });
        return;
      }

      visualTimer.setProgress(currentIdx / TOTAL_TRIALS);
      header.innerHTML = `
        <div class="stage-meta">
          <span class="badge">種子 #${config.seed}</span>
          <span class="badge">第 ${currentIdx + 1} / ${TOTAL_TRIALS} 題</span>
        </div>
      `;

      const side: 'left' | 'right' = rng.next() < 0.5 ? 'left' : 'right';
      // 55% incongruent trials to train interference suppression
      const incongruent = rng.next() < 0.55;
      arrowDir = incongruent ? (side === 'left' ? 'right' : 'left') : side;

      drawArrow(side, arrowDir);
      awaiting = true;
      trialStartMs = performance.now();
    }

    function handleAnswer(dir: 'left' | 'right'): void {
      if (!awaiting || disposed) return;
      awaiting = false;
      audioGateway.unlock();
      const rtMs = Math.round(performance.now() - trialStartMs);
      const correct = dir === arrowDir;

      if (correct) {
        audioGateway.playTone('success');
        trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
        statusLine.textContent = '方向正確！不被位置干擾';
      } else {
        audioGateway.playTone('gentle');
        trials.push({ isTarget: true, correct: false, rtMs, errorType: 'commission' });
        statusLine.textContent = '別被箭頭「出現的位置」騙了，要看「箭頭指的方向」喔';
      }

      currentIdx += 1;
      window.setTimeout(nextTrial, 320);
    }

    btnRow.querySelectorAll<HTMLButtonElement>('.conflict-btn').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        handleAnswer(btn.dataset.dir as 'left' | 'right');
      });
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleAnswer('left');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleAnswer('right');
      }
    };
    window.addEventListener('keydown', onKeyDown);

    if (config.showTutorial) {
      const svg = `<div style="font-size:1.1rem;font-weight:700;color:#D55E00;">位置在左邊，但箭頭指右邊 ➡ 選右！</div>`;
      const overlay = createTutorialOverlay('只看「箭頭指向」，忽略它出現在左邊還是右邊', svg, () => {
        audioGateway.unlock();
        nextTrial();
      });
      wrapper.appendChild(overlay);
    } else {
      nextTrial();
    }

    return () => {
      disposed = true;
      window.removeEventListener('keydown', onKeyDown);
    };
  },
};
