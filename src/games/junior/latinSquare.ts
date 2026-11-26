import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { StaircaseController } from '../../engine/dda/staircase';
import { requestLatinSquare } from '../../worker/client';
import { LatinSquarePuzzle } from '../../worker/solvers/latinSquare';
import { OKABE_ITO_PALETTE, renderThemedTokenSvg, renderTokenSvg } from '../../ui/theme/okabeIto';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

export const latinSquareGame: GameModule = {
  id: 'latinSquare',
  title: '圖形拉丁方陣',
  subtitle: '每一行與每一列都放入不同的圖形，不重複就能過關',
  ageTier: 'junior',
  ageLabel: '低年級 6–8 歲',
  evidenceBadge: '設計推論（具體運思期行列排除）',
  primaryAxis: 'deductiveReasoning',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const staircase = new StaircaseController({
      initialLevel: config.level,
      minLevel: 1,
      maxLevel: 3, // Lv1: 3x3, Lv2-3: 4x4
    });

    let disposed = false;
    let puzzleData: LatinSquarePuzzle | null = null;
    let grid: number[] = [];
    let fixed: boolean[] = [];
    let selectedIdx: number | null = null;
    let lastActionMs = performance.now();
    const trials: TrialRecord[] = [];

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    header.innerHTML = `
      <div class="stage-meta">
        <span class="badge">種子 #${config.seed}</span>
        <span class="badge">階梯 Lv.${staircase.currentLevel}</span>
      </div>
    `;

    const visualTimer = new VisualTimer('解題進度');
    const boardHost = document.createElement('div');
    boardHost.className = 'latin-host';
    boardHost.innerHTML = '<p class="loading-text">正在生成唯一解拉丁方陣...</p>';

    const pickerHost = document.createElement('div');
    pickerHost.className = 'numpad-row';

    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';
    statusLine.textContent = '載入中...';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(boardHost);
    wrapper.appendChild(pickerHost);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    function hasConflict(idx: number, val: number): boolean {
      if (!puzzleData || val === 0) return false;
      const size = puzzleData.size;
      const r = Math.floor(idx / size);
      const c = idx % size;
      for (let i = 0; i < size; i++) {
        if (r * size + i !== idx && grid[r * size + i] === val) return true;
        if (i * size + c !== idx && grid[i * size + c] === val) return true;
      }
      return false;
    }

    function render(): void {
      if (disposed || !puzzleData) return;
      const size = puzzleData.size;
      const totalBlanks = fixed.filter((f) => !f).length;
      const filled = grid.filter((v, i) => !fixed[i] && v !== 0 && !hasConflict(i, v)).length;
      visualTimer.setProgress(totalBlanks > 0 ? filled / totalBlanks : 1);

      const skin = config.themeSkin ?? 'geometry';
      const cells = grid
        .map((val, idx) => {
          const isFixed = fixed[idx];
          const isSelected = selectedIdx === idx;
          const conflict = val !== 0 && hasConflict(idx, val);
          const token = val > 0 ? OKABE_ITO_PALETTE[val - 1] : null;
          return `
            <button type="button"
              class="latin-cell ${isFixed ? 'is-fixed' : ''} ${isSelected ? 'is-selected' : ''} ${conflict ? 'is-conflict' : ''}"
              data-idx="${idx}"
              aria-label="${token ? token.nameZh : '空格'}">
              ${token ? renderThemedTokenSvg(val - 1, skin, 42) : ''}
            </button>
          `;
        })
        .join('');

      boardHost.innerHTML = `
        <div class="latin-grid" style="grid-template-columns: repeat(${size}, 64px);">
          ${cells}
        </div>
      `;

      boardHost.querySelectorAll<HTMLButtonElement>('.latin-cell').forEach((btn) => {
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          audioGateway.unlock();
          const idx = Number(btn.dataset.idx);
          if (!fixed[idx]) {
            selectedIdx = idx;
            render();
          }
        });
      });

      const tokensHtml = Array.from({ length: size }, (_, i) => {
        const token = OKABE_ITO_PALETTE[i];
        return `
          <button type="button" class="btn btn-outline token-pick-btn" data-val="${i + 1}" aria-label="填入${token.nameZh}">
            ${renderThemedTokenSvg(i, skin, 34)}
          </button>
        `;
      }).join('');

      pickerHost.innerHTML = `${tokensHtml}
        <button type="button" class="btn btn-outline" id="latin-hint">💡 線索</button>
        <button type="button" class="btn btn-outline" id="latin-clear">清除</button>`;

      pickerHost.querySelectorAll<HTMLButtonElement>('.token-pick-btn').forEach((btn) => {
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          applyValue(Number(btn.dataset.val));
        });
      });

      pickerHost.querySelector('#latin-hint')?.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (!puzzleData) return;
        for (let i = 0; i < puzzleData.size * puzzleData.size; i++) {
          if (grid[i] !== 0) continue;
          let cands = 0;
          for (let v = 1; v <= puzzleData.size; v++) {
            if (!hasConflict(i, v)) cands += 1;
          }
          if (cands === 1) {
            selectedIdx = i;
            statusLine.textContent = '💡 這一格觀察同行同列後，只剩 1 個圖形可以放喔！';
            render();
            return;
          }
        }
      });

      pickerHost.querySelector('#latin-clear')?.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        applyValue(0);
      });
    }

    function applyValue(val: number): void {
      if (disposed || !puzzleData || selectedIdx === null || fixed[selectedIdx]) return;
      audioGateway.unlock();
      const now = performance.now();
      const rtMs = Math.round(now - lastActionMs);
      lastActionMs = now;

      grid[selectedIdx] = val;
      if (val === 0) {
        render();
        return;
      }

      if (hasConflict(selectedIdx, val)) {
        audioGateway.playTone('gentle');
        trials.push({ isTarget: true, correct: false, rtMs, errorType: 'rule' });
        statusLine.textContent = '同一行或同一列已經有這個圖形囉！';
      } else {
        audioGateway.playTone('success');
        trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
        statusLine.textContent = '放得很好！繼續檢查下一格';
      }
      render();

      const solved = grid.every((v, i) => v !== 0 && v === puzzleData!.solution[i]);
      if (solved) {
        audioGateway.playTone('complete');
        const metrics = computeSessionMetrics(trials);
        staircase.record(metrics.accuracy >= 0.8);
        config.onSessionComplete({
          gameId: 'latinSquare',
          ageTier: 'junior',
          seed: config.seed,
          level: staircase.currentLevel,
          metrics,
          axisScores: {
            attentionStability: metrics.asi,
            deductiveReasoning: Math.round(metrics.accuracy * 100),
          },
        });
      }
    }

    void requestLatinSquare(config.seed, staircase.currentLevel).then((data) => {
      if (disposed) return;
      puzzleData = data;
      grid = [...data.puzzle];
      fixed = data.puzzle.map((v) => v !== 0);
      lastActionMs = performance.now();
      statusLine.textContent = '點選空格，再選下方圖形填入（每行每列不重複）';
      render();
    });

    if (config.showTutorial) {
      const t0 = renderTokenSvg(OKABE_ITO_PALETTE[0], 32);
      const t1 = renderTokenSvg(OKABE_ITO_PALETTE[1], 32);
      const t2 = renderTokenSvg(OKABE_ITO_PALETTE[2], 32);
      const tutorialSvg = `<div style="display:flex;gap:8px;align-items:center;">${t0}${t1}${t2}</div>`;
      const overlay = createTutorialOverlay('每一橫列與直行都要有不同圖形', tutorialSvg, () => {
        audioGateway.unlock();
        lastActionMs = performance.now();
      });
      wrapper.appendChild(overlay);
    }

    return () => {
      disposed = true;
    };
  },
};
