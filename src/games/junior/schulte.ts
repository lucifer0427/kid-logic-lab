import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { StaircaseController } from '../../engine/dda/staircase';
import { SeededRng } from '../../worker/prng';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

interface SchulteItem {
  num: number;
  group: 'A' | 'B'; // A: Orange (#E69F00), B: Blue (#0072B2)
}

export const schulteGame: GameModule = {
  id: 'schulte',
  title: '舒爾特視覺尋序',
  subtitle: 'Lv.1 為 3×3 數字尋序；進階解鎖 4×4、5×5 與雙色交替挑戰',
  ageTier: 'junior',
  ageLabel: '低年級 6–8 歲',
  evidenceBadge: '設計推論（視覺掃描與注意力分配）',
  primaryAxis: 'attentionStability',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const rng = new SeededRng(config.seed);
    const staircase = new StaircaseController({
      initialLevel: config.level,
      minLevel: 1,
      maxLevel: 3, // Lv1: 3x3, Lv2: 4x4, Lv3: 5x5
    });

    const dim = staircase.currentLevel === 1 ? 3 : staircase.currentLevel === 2 ? 4 : 5;
    const total = dim * dim;
    let dualColorMode = staircase.currentLevel >= 2;

    let sequence: SchulteItem[] = [];
    let shuffled: SchulteItem[] = [];
    let nextIdx = 0;
    let lastTapMs = performance.now();
    const trials: TrialRecord[] = [];
    let disposed = false;

    function buildBoard(): void {
      if (dualColorMode) {
        const half = Math.ceil(total / 2);
        sequence = [];
        for (let i = 1; i <= half; i++) {
          sequence.push({ num: i, group: 'A' });
          if (sequence.length < total) sequence.push({ num: i, group: 'B' });
        }
      } else {
        sequence = Array.from({ length: total }, (_, i) => ({ num: i + 1, group: 'A' }));
      }
      shuffled = rng.shuffle([...sequence]);
      nextIdx = 0;
      lastTapMs = performance.now();
    }

    buildBoard();

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const visualTimer = new VisualTimer('尋序進度');
    const gridHost = document.createElement('div');
    const modeRow = document.createElement('div');
    modeRow.className = 'mode-row';
    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(gridHost);
    wrapper.appendChild(modeRow);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    function render(): void {
      if (disposed) return;
      const target = sequence[nextIdx];
      const targetLabel = target
        ? dualColorMode
          ? `${target.group === 'A' ? '橘' : '藍'} ${target.num}`
          : String(target.num)
        : '完成';

      header.innerHTML = `
        <div class="stage-meta">
          <span class="badge">${dim}×${dim} 方格 (Lv.${staircase.currentLevel})</span>
          <span class="badge">下一個目標：${targetLabel}</span>
        </div>
      `;
      visualTimer.setProgress(nextIdx / total);

      const cellSize = dim === 3 ? 82 : dim === 4 ? 66 : 54;
      const cells = shuffled
        .map((item) => {
          const itemOrder = sequence.findIndex((s) => s.num === item.num && s.group === item.group);
          const found = itemOrder < nextIdx;
          const colorClass = dualColorMode ? (item.group === 'A' ? 'schulte-a' : 'schulte-b') : '';
          return `
            <button type="button"
              class="schulte-cell ${colorClass} ${found ? 'is-found' : ''}"
              style="width:${cellSize}px;height:${cellSize}px;font-size:${dim >= 5 ? '1.25rem' : '1.55rem'};"
              data-num="${item.num}"
              data-group="${item.group}"
              aria-label="${dualColorMode ? (item.group === 'A' ? '橘色' : '藍色') : ''}數字 ${item.num}">
              ${item.num}
            </button>
          `;
        })
        .join('');

      gridHost.innerHTML = `
        <div class="schulte-grid" style="grid-template-columns: repeat(${dim}, ${cellSize}px);">
          ${cells}
        </div>
      `;

      modeRow.innerHTML = `
        <button type="button" class="btn btn-outline" id="toggle-dual-schulte">
          ${dualColorMode ? '🎨 目前：雙色交替（橘1→藍1→橘2...）' : '🔢 目前：單色依序（1→2→3...）'}
        </button>
      `;

      modeRow.querySelector('#toggle-dual-schulte')?.addEventListener('pointerdown', () => {
        dualColorMode = !dualColorMode;
        buildBoard();
        render();
      });

      gridHost.querySelectorAll<HTMLButtonElement>('.schulte-cell').forEach((btn) => {
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          audioGateway.unlock();
          const num = Number(btn.dataset.num);
          const group = btn.dataset.group as 'A' | 'B';
          const curTarget = sequence[nextIdx];
          if (!curTarget) return;

          const now = performance.now();
          const rtMs = Math.round(now - lastTapMs);
          lastTapMs = now;

          if (num === curTarget.num && group === curTarget.group) {
            audioGateway.playPentatonic(nextIdx);
            trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
            nextIdx += 1;
            const upcoming = sequence[nextIdx];
            statusLine.textContent = upcoming
              ? `很好！接下來找 ${dualColorMode ? (upcoming.group === 'A' ? '橘色 ' : '藍色 ') : ''}${upcoming.num}`
              : '全部找完囉！';
            render();

            if (nextIdx >= total) {
              audioGateway.playTone('complete');
              const metrics = computeSessionMetrics(trials);
              staircase.record(metrics.accuracy >= 0.85);
              config.onSessionComplete({
                gameId: 'schulte',
                ageTier: 'junior',
                seed: config.seed,
                level: staircase.currentLevel,
                metrics,
                axisScores: {
                  attentionStability: metrics.asi,
                },
              });
            }
          } else {
            audioGateway.playTone('gentle');
            trials.push({ isTarget: true, correct: false, rtMs, errorType: 'commission' });
            statusLine.textContent = `目標是 ${targetLabel} 喔，慢慢掃描畫面`;
          }
        });
      });
    }

    render();
    statusLine.textContent = dualColorMode ? '請交替點選：橘 1 → 藍 1 → 橘 2 → 藍 2...' : `請從 1 依序點到 ${total}`;

    if (config.showTutorial) {
      const svg = `<div style="font-size:1.25rem;font-weight:700;color:#0072B2;">1 → 2 → 3 ... → ${total}</div>`;
      const overlay = createTutorialOverlay('依照上方提示的目標數字與顏色依序點擊', svg, () => {
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
