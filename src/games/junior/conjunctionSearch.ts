import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { StaircaseController } from '../../engine/dda/staircase';
import { SeededRng } from '../../worker/prng';
import { OKABE_ITO_PALETTE, renderTokenSvg } from '../../ui/theme/okabeIto';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

const TOTAL_ROUNDS = 10;

export const conjunctionSearchGame: GameModule = {
  id: 'conjunctionSearch',
  title: '特徵聯集搜尋',
  subtitle: '在滿滿的干擾圖形中，找出唯一同時符合「指定顏色＋指定形狀」的目標',
  ageTier: 'junior',
  ageLabel: '低年級 6–8 歲',
  evidenceBadge: '注意心理學經典（Conjunction Search）',
  primaryAxis: 'attentionStability',

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
    let roundStartMs = performance.now();

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const visualTimer = new VisualTimer('尋寶進度');
    const targetBanner = document.createElement('div');
    targetBanner.className = 'conjunction-target-banner';
    const boardHost = document.createElement('div');
    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(targetBanner);
    wrapper.appendChild(boardHost);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    function nextRound(): void {
      if (disposed) return;
      if (round >= TOTAL_ROUNDS) {
        visualTimer.setProgress(1);
        audioGateway.playTone('complete');
        const metrics = computeSessionMetrics(trials);
        config.onSessionComplete({
          gameId: 'conjunctionSearch',
          ageTier: 'junior',
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

      visualTimer.setProgress(round / TOTAL_ROUNDS);
      const gridDim = staircase.currentLevel === 1 ? 3 : staircase.currentLevel === 2 ? 4 : 5;
      const total = gridDim * gridDim;

      const cIdx = rng.int(0, 2);
      const sIdx = rng.int(0, 2);
      const altCIdx = (cIdx + 1) % 3;
      const altSIdx = (sIdx + 1) % 3;

      const targetToken = {
        ...OKABE_ITO_PALETTE[cIdx],
        shape: OKABE_ITO_PALETTE[sIdx].shape,
      };
      // Conjunction distractors share EITHER color OR shape, never both
      const distA = { ...OKABE_ITO_PALETTE[cIdx], shape: OKABE_ITO_PALETTE[altSIdx].shape };
      const distB = { ...OKABE_ITO_PALETTE[altCIdx], shape: OKABE_ITO_PALETTE[sIdx].shape };

      const targetPos = rng.int(0, total - 1);
      const items = Array.from({ length: total }, (_, i) =>
        i === targetPos ? { tok: targetToken, isTarget: true } : { tok: i % 2 === 0 ? distA : distB, isTarget: false },
      );

      header.innerHTML = `
        <div class="stage-meta">
          <span class="badge">第 ${round + 1} / ${TOTAL_ROUNDS} 題</span>
          <span class="badge">${gridDim}×${gridDim} 搜尋區</span>
        </div>
      `;

      targetBanner.innerHTML = `
        <span>請找出唯一的目標：</span>
        ${renderTokenSvg(targetToken, 44)}
      `;

      const cellSize = gridDim === 3 ? 72 : gridDim === 4 ? 58 : 48;
      boardHost.innerHTML = `
        <div class="conjunction-grid" style="grid-template-columns: repeat(${gridDim}, ${cellSize}px);">
          ${items
            .map(
              (item, idx) => `
            <button type="button" class="conjunction-cell" style="width:${cellSize}px;height:${cellSize}px;" data-idx="${idx}">
              ${renderTokenSvg(item.tok, Math.round(cellSize * 0.72))}
            </button>
          `,
            )
            .join('')}
        </div>
      `;

      boardHost.querySelectorAll<HTMLButtonElement>('.conjunction-cell').forEach((btn) => {
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          audioGateway.unlock();
          const idx = Number(btn.dataset.idx);
          const rtMs = Math.round(performance.now() - roundStartMs);

          if (idx === targetPos) {
            audioGateway.playPentatonic(round);
            trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
            staircase.record(true);
            statusLine.textContent = '找到了！眼神好銳利！';
            round += 1;
            window.setTimeout(nextRound, 260);
          } else {
            audioGateway.playTone('gentle');
            trials.push({ isTarget: true, correct: false, rtMs, errorType: 'commission' });
            staircase.record(false);
            statusLine.textContent = '這個只對了一半喔，要顏色和形狀都一樣才算！';
          }
        });
      });

      roundStartMs = performance.now();
    }

    if (config.showTutorial) {
      const svg = `<div style="font-size:0.95rem;font-weight:600;color:#0072B2;">仔細比對顏色＋形狀，找出唯一完全相同的目標！</div>`;
      const overlay = createTutorialOverlay('同時核對顏色和形狀，點出唯一的目標圖形', svg, () => {
        audioGateway.unlock();
        nextRound();
      });
      wrapper.appendChild(overlay);
    } else {
      nextRound();
    }

    return () => {
      disposed = true;
    };
  },
};
