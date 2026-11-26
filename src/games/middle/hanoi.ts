import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { StaircaseController } from '../../engine/dda/staircase';
import { OKABE_ITO_PALETTE } from '../../ui/theme/okabeIto';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

export const hanoiGame: GameModule = {
  id: 'hanoi',
  title: '階梯式漢諾塔',
  subtitle: '大圓盤不可放在小圓盤上，先在心中預演 2–3 步再移動',
  ageTier: 'middle',
  ageLabel: '中年級 8–10 歲',
  evidenceBadge: '已獲教育實證延伸（計畫能力）',
  primaryAxis: 'strategicPlanning',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const staircase = new StaircaseController({
      initialLevel: config.level,
      minLevel: 1,
      maxLevel: 2, // Level 1 = 3 discs, Level 2 = 4 discs
    });

    let discCount = staircase.currentLevel === 1 ? 3 : 4;
    let optimalMoves = 2 ** discCount - 1;
    let pegs: number[][] = [[], [], []];
    let selectedPeg: number | null = null;
    let moves = 0;
    let lastMoveMs = performance.now();
    const trials: TrialRecord[] = [];
    let disposed = false;

    function resetBoard(): void {
      discCount = staircase.currentLevel === 1 ? 3 : 4;
      optimalMoves = 2 ** discCount - 1;
      pegs = [
        Array.from({ length: discCount }, (_, i) => discCount - i),
        [],
        [],
      ];
      selectedPeg = null;
      moves = 0;
      lastMoveMs = performance.now();
    }

    resetBoard();
    container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';
    const visualTimer = new VisualTimer('移動進展');

    const boardHost = document.createElement('div');
    boardHost.className = 'hanoi-board-host';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(boardHost);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    function render(): void {
      if (disposed) return;
      header.innerHTML = `
        <div class="stage-meta">
          <span class="badge">${discCount} 層圓盤</span>
          <span class="badge">目前步數：${moves} / 最佳 ${optimalMoves} 步</span>
        </div>
      `;

      // Progress based on discs stacked onto target peg (rightmost)
      visualTimer.setProgress(pegs[2].length / discCount);

      const svgWidth = 540;
      const svgHeight = 280;
      const pegX = [95, 270, 445];
      const baseY = 240;

      const pegElements = pegs
        .map((stack, pIdx) => {
          const isSelected = selectedPeg === pIdx;
          const discsSvg = stack
            .map((discSize, depthIdx) => {
              const w = 44 + discSize * 26;
              const h = 28;
              const x = pegX[pIdx] - w / 2;
              const y = baseY - (depthIdx + 1) * (h + 4);
              const color = OKABE_ITO_PALETTE[(discSize - 1) % OKABE_ITO_PALETTE.length].hex;
              const isTop = depthIdx === stack.length - 1;
              const lift = isSelected && isTop ? -12 : 0;
              return `
                <rect x="${x}" y="${y + lift}" width="${w}" height="${h}" rx="10"
                  fill="${color}" stroke="${isSelected && isTop ? '#0F172A' : '#1E293B'}"
                  stroke-width="${isSelected && isTop ? 4 : 2}" />
                <text x="${pegX[pIdx]}" y="${y + lift + 19}" text-anchor="middle"
                  font-size="14" font-weight="700" fill="#FFFFFF">${discSize}</text>
              `;
            })
            .join('');

          return `
            <g class="hanoi-peg-hit" data-peg="${pIdx}" role="button" tabindex="0"
               aria-label="第 ${pIdx + 1} 根柱子，目前有 ${stack.length} 個圓盤">
              <rect x="${pegX[pIdx] - 72}" y="30" width="144" height="225" fill="transparent" />
              <rect x="${pegX[pIdx] - 7}" y="60" width="14" height="180" rx="6"
                fill="${isSelected ? '#0072B2' : '#CBD5E1'}" />
              <rect x="${pegX[pIdx] - 65}" y="${baseY}" width="130" height="12" rx="6" fill="#64748B" />
              ${discsSvg}
            </g>
          `;
        })
        .join('');

      boardHost.innerHTML = `
        <svg viewBox="0 0 ${svgWidth} ${svgHeight}" class="hanoi-svg" aria-label="漢諾塔遊戲盤面">
          ${pegElements}
        </svg>
      `;

      boardHost.querySelectorAll<SVGGElement>('.hanoi-peg-hit').forEach((el) => {
        el.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          const idx = Number(el.dataset.peg);
          handlePegSelect(idx);
        });
      });
    }

    function handlePegSelect(pegIdx: number): void {
      if (disposed) return;
      audioGateway.unlock();

      if (selectedPeg === null) {
        if (pegs[pegIdx].length === 0) {
          statusLine.textContent = '這根柱子目前沒有圓盤喔，請選有圓盤的柱子';
          return;
        }
        selectedPeg = pegIdx;
        statusLine.textContent = '請點選要放置的目標柱子';
        render();
        return;
      }

      if (selectedPeg === pegIdx) {
        selectedPeg = null;
        statusLine.textContent = '已取消選取';
        render();
        return;
      }

      const fromStack = pegs[selectedPeg];
      const toStack = pegs[pegIdx];
      const movingDisc = fromStack[fromStack.length - 1];
      const topTarget = toStack[toStack.length - 1];
      const now = performance.now();
      const rtMs = Math.round(now - lastMoveMs);
      lastMoveMs = now;

      if (topTarget !== undefined && movingDisc > topTarget) {
        audioGateway.playTone('gentle');
        trials.push({ isTarget: true, correct: false, rtMs, errorType: 'rule' });
        selectedPeg = null;
        statusLine.textContent = '大圓盤不能放在小圓盤上面喔！換個方向試試';
        render();
        return;
      }

      fromStack.pop();
      toStack.push(movingDisc);
      moves += 1;
      selectedPeg = null;
      audioGateway.playTone('success');
      trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
      statusLine.textContent = `移動成功！已走 ${moves} 步`;
      render();

      if (pegs[2].length === discCount) {
        audioGateway.playTone('complete');
        const efficiency = Math.min(1, optimalMoves / Math.max(1, moves));
        const efficientWin = efficiency >= 0.85;
        staircase.record(efficientWin);

        const metrics = computeSessionMetrics(trials);
        config.onSessionComplete({
          gameId: 'hanoi',
          ageTier: 'middle',
          seed: config.seed,
          level: staircase.currentLevel,
          metrics,
          axisScores: {
            attentionStability: metrics.asi,
            strategicPlanning: Math.round(efficiency * 100),
          },
        });
      }
    }

    render();
    statusLine.textContent = '請把所有圓盤從左邊移到最右邊的柱子';

    if (config.showTutorial) {
      const tutorialSvg = `
        <svg viewBox="0 0 240 110" width="240" height="110" aria-hidden="true">
          <rect x="30" y="75" width="70" height="16" rx="6" fill="#E69F00" stroke="#0F172A" stroke-width="2"/>
          <rect x="42" y="55" width="46" height="16" rx="6" fill="#56B4E9" stroke="#0F172A" stroke-width="2"/>
          <path d="M 85 45 Q 130 15 170 45" fill="none" stroke="#0072B2" stroke-width="3" stroke-dasharray="5 4"/>
          <polygon points="170,45 160,40 164,50" fill="#0072B2"/>
          <rect x="145" y="75" width="70" height="16" rx="6" fill="#009E73" stroke="#0F172A" stroke-width="2"/>
        </svg>
      `;
      const overlay = createTutorialOverlay('點選柱子拿起最上面的圓盤，大盤不可壓在小盤上', tutorialSvg, () => {
        audioGateway.unlock();
        lastMoveMs = performance.now();
      });
      wrapper.appendChild(overlay);
    }

    return () => {
      disposed = true;
    };
  },
};
