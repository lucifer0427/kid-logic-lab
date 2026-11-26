import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { StaircaseController } from '../../engine/dda/staircase';
import { SeededRng } from '../../worker/prng';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

const TOTAL_TRIALS = 20;

export interface FlankerTrialSpec {
  centerDir: 'left' | 'right';
  flankDir: 'left' | 'right';
  congruent: boolean;
}

export function generateFlankerTrial(rng: SeededRng, incongruentProb = 0.55): FlankerTrialSpec {
  const centerDir = rng.next() < 0.5 ? 'left' : 'right';
  const congruent = rng.next() >= incongruentProb;
  const flankDir = congruent ? centerDir : centerDir === 'left' ? 'right' : 'left';
  return { centerDir, flankDir, congruent };
}

export const flankerFishGame: GameModule = {
  id: 'flankerFish',
  title: '魚群領袖方向（抗干擾）',
  subtitle: '五隻小魚一起游，忽略旁邊干擾的魚，只看「正中間」那隻游向哪邊！',
  ageTier: 'middle',
  ageLabel: '中年級 8–10 歲・ADHD 特訓',
  evidenceBadge: '已獲範式實證（Eriksen Flanker 干擾抑制）',
  primaryAxis: 'impulseInhibition',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const rng = new SeededRng(config.seed);
    const staircase = new StaircaseController({
      initialLevel: config.level,
      minLevel: 1,
      maxLevel: 3,
    });

    const trials: TrialRecord[] = [];
    let currentIdx = 0;
    let disposed = false;
    let currentSpec: FlankerTrialSpec = { centerDir: 'left', flankDir: 'left', congruent: true };
    let trialStartMs = 0;
    let awaiting = false;

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const visualTimer = new VisualTimer('練習進度');

    const canvas = document.createElement('canvas');
    canvas.className = 'gonogo-canvas';
    canvas.width = 500;
    canvas.height = 200;

    const btnRow = document.createElement('div');
    btnRow.className = 'conflict-btn-row';
    btnRow.innerHTML = `
      <button type="button" class="btn btn-outline btn-lg flanker-btn" data-dir="left">⬅ 中間魚向左</button>
      <button type="button" class="btn btn-outline btn-lg flanker-btn" data-dir="right">中間魚向右 ➡</button>
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

    function drawFish(cx: number, cy: number, dir: 'left' | 'right', isCenter: boolean): void {
      ctx.save();
      ctx.translate(cx, cy);
      if (dir === 'left') ctx.scale(-1, 1);

      // Highlight ring around center target at Lv1 to scaffold attention
      if (isCenter && staircase.currentLevel === 1) {
        ctx.strokeStyle = '#94A3B8';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(-34, -28, 68, 56);
        ctx.setLineDash([]);
      }

      ctx.fillStyle = isCenter ? '#0072B2' : '#E69F00';
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 2;

      // Body
      ctx.beginPath();
      ctx.ellipse(4, 0, 20, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Tail
      ctx.beginPath();
      ctx.moveTo(-14, 0);
      ctx.lineTo(-27, -11);
      ctx.lineTo(-27, 11);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Eye (always near the front/right after scale)
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(14, -4, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawRow(spec: FlankerTrialSpec): void {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const xs = [75, 162, 250, 338, 425];
      const cy = canvas.height / 2;
      xs.forEach((x, i) => {
        const isCenter = i === 2;
        drawFish(x, cy, isCenter ? spec.centerDir : spec.flankDir, isCenter);
      });
    }

    function nextTrial(): void {
      if (disposed) return;
      if (currentIdx >= TOTAL_TRIALS) {
        visualTimer.setProgress(1);
        audioGateway.playTone('complete');
        const metrics = computeSessionMetrics(trials);
        config.onSessionComplete({
          gameId: 'flankerFish',
          ageTier: 'middle',
          seed: config.seed,
          level: staircase.currentLevel,
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
          <span class="badge">第 ${currentIdx + 1} / ${TOTAL_TRIALS} 題</span>
          <span class="badge">專注階梯 Lv.${staircase.currentLevel}</span>
        </div>
      `;

      const incongProb = 0.45 + (staircase.currentLevel - 1) * 0.1;
      currentSpec = generateFlankerTrial(rng, incongProb);
      drawRow(currentSpec);
      awaiting = true;
      trialStartMs = performance.now();
    }

    function handleChoice(dir: 'left' | 'right'): void {
      if (!awaiting || disposed) return;
      awaiting = false;
      audioGateway.unlock();
      const rtMs = Math.round(performance.now() - trialStartMs);
      const correct = dir === currentSpec.centerDir;

      if (correct) {
        audioGateway.playPentatonic(currentIdx);
        trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
        staircase.record(true);
        statusLine.textContent = '鎖定中間魚成功！不被旁邊干擾';
      } else {
        audioGateway.playTone('gentle');
        trials.push({ isTarget: true, correct: false, rtMs, errorType: 'commission' });
        staircase.record(false);
        statusLine.textContent = '哎呀，被旁邊的橘色魚干擾囉！只看正中間那隻藍色魚';
      }

      currentIdx += 1;
      window.setTimeout(nextTrial, 320);
    }

    btnRow.querySelectorAll<HTMLButtonElement>('.flanker-btn').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        handleChoice(btn.dataset.dir as 'left' | 'right');
      });
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); handleChoice('left'); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); handleChoice('right'); }
    };
    window.addEventListener('keydown', onKeyDown);

    if (config.showTutorial) {
      const svg = `<div style="font-size:0.95rem;font-weight:600;color:#0072B2;">旁邊的橘魚往左或右都沒關係，只看「正中間」藍色魚游向哪裡！</div>`;
      const overlay = createTutorialOverlay('鎖定正中間的魚，忽略左右干擾', svg, () => {
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
