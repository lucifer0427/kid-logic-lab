import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { requestSudoku9x9 } from '../../worker/client';
import { Sudoku9x9Puzzle } from '../../worker/solvers/sudoku9x9';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

export const sudoku9x9Game: GameModule = {
  id: 'sudoku9x9',
  title: '9×9 進階數獨',
  subtitle: '標準 9×9 盤面，善用候選筆記進行假設與排除演繹',
  ageTier: 'senior',
  ageLabel: '高年級 10–12 歲',
  evidenceBadge: '設計推論（高階約束滿足）',
  primaryAxis: 'deductiveReasoning',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    let disposed = false;
    let puzzleData: Sudoku9x9Puzzle | null = null;
    let grid: number[] = [];
    let fixed: boolean[] = [];
    const notes: Set<number>[] = Array.from({ length: 81 }, () => new Set<number>());
    let selectedIdx: number | null = null;
    let noteMode = false;
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
        <span class="badge">9×9 唯一解</span>
      </div>
    `;

    const visualTimer = new VisualTimer('解題進度');
    const gridHost = document.createElement('div');
    gridHost.innerHTML = '<p class="loading-text">Web Worker 正在生成 9×9 唯一解題盤...</p>';
    const controlsHost = document.createElement('div');
    controlsHost.className = 'sudoku-controls';
    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(gridHost);
    wrapper.appendChild(controlsHost);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    function hasConflict(idx: number, val: number): boolean {
      if (val === 0) return false;
      const r = Math.floor(idx / 9);
      const c = idx % 9;
      const br = Math.floor(r / 3) * 3;
      const bc = Math.floor(c / 3) * 3;
      for (let i = 0; i < 9; i++) {
        if (r * 9 + i !== idx && grid[r * 9 + i] === val) return true;
        if (i * 9 + c !== idx && grid[i * 9 + c] === val) return true;
      }
      for (let dr = 0; dr < 3; dr++) {
        for (let dc = 0; dc < 3; dc++) {
          const boxIdx = (br + dr) * 9 + (bc + dc);
          if (boxIdx !== idx && grid[boxIdx] === val) return true;
        }
      }
      return false;
    }

    function render(): void {
      if (disposed || !puzzleData) return;
      const totalBlanks = fixed.filter((f) => !f).length;
      const filled = grid.filter((v, i) => !fixed[i] && v !== 0 && !hasConflict(i, v)).length;
      visualTimer.setProgress(totalBlanks > 0 ? filled / totalBlanks : 1);

      const cellsHtml = grid
        .map((val, idx) => {
          const r = Math.floor(idx / 9);
          const c = idx % 9;
          const isFixed = fixed[idx];
          const isSelected = selectedIdx === idx;
          const conflict = val !== 0 && hasConflict(idx, val);
          const boxRight = c === 2 || c === 5 ? 'box-right' : '';
          const boxBottom = r === 2 || r === 5 ? 'box-bottom' : '';

          let inner = '';
          if (val !== 0) {
            inner = `<span class="cell-val">${val}</span>`;
          } else if (notes[idx].size > 0) {
            const noteItems = [1, 2, 3, 4, 5, 6, 7, 8, 9]
              .map((n) => `<span>${notes[idx].has(n) ? n : ''}</span>`)
              .join('');
            inner = `<div class="cell-notes cell-notes-9">${noteItems}</div>`;
          }

          return `
            <button type="button"
              class="sudoku-cell sudoku-cell-9 ${isFixed ? 'is-fixed' : ''} ${isSelected ? 'is-selected' : ''} ${conflict ? 'is-conflict' : ''} ${boxRight} ${boxBottom}"
              data-idx="${idx}"
              aria-label="第 ${r + 1} 列第 ${c + 1} 行">
              ${inner}
            </button>
          `;
        })
        .join('');

      gridHost.innerHTML = `<div class="sudoku-grid sudoku-grid-9" role="grid">${cellsHtml}</div>`;
      gridHost.querySelectorAll<HTMLButtonElement>('.sudoku-cell').forEach((btn) => {
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          audioGateway.unlock();
          selectedIdx = Number(btn.dataset.idx);
          render();
        });
      });

      const numButtons = [1, 2, 3, 4, 5, 6, 7, 8, 9]
        .map((n) => `<button type="button" class="btn num-btn" data-num="${n}">${n}</button>`)
        .join('');

      controlsHost.innerHTML = `
        <div class="numpad-row">${numButtons}</div>
        <div class="mode-row">
          <button type="button" class="btn ${noteMode ? 'btn-primary' : 'btn-outline'}" id="toggle-note-9">
            ${noteMode ? '✎ 筆記模式：開啟' : '✎ 筆記模式：關閉'}
          </button>
          <button type="button" class="btn btn-outline" id="smart-hint-9">💡 給我一條線索</button>
          <button type="button" class="btn btn-outline" id="clear-cell-9">清除此格</button>
        </div>
      `;

      controlsHost.querySelectorAll<HTMLButtonElement>('.num-btn').forEach((btn) => {
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          applyNumber(Number(btn.dataset.num));
        });
      });
      controlsHost.querySelector('#toggle-note-9')?.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        noteMode = !noteMode;
        render();
      });
      controlsHost.querySelector('#smart-hint-9')?.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        giveSmartHint();
      });
      controlsHost.querySelector('#clear-cell-9')?.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        applyNumber(0);
      });
    }

    function giveSmartHint(): void {
      if (disposed || !puzzleData) return;
      let bestIdx = -1;
      let minCands = 10;
      for (let i = 0; i < 81; i++) {
        if (grid[i] !== 0) continue;
        let candCount = 0;
        for (let n = 1; n <= 9; n++) {
          if (!hasConflict(i, n)) candCount += 1;
        }
        if (candCount > 0 && candCount < minCands) {
          minCands = candCount;
          bestIdx = i;
          if (minCands === 1) break;
        }
      }
      if (bestIdx !== -1) {
        selectedIdx = bestIdx;
        const r = Math.floor(bestIdx / 9) + 1;
        const c = (bestIdx % 9) + 1;
        statusLine.textContent =
          minCands === 1
            ? `💡 看看第 ${r} 列第 ${c} 行：這格只剩下 1 個可能的數字囉！`
            : `💡 可以先觀察第 ${r} 列第 ${c} 行，它只剩 ${minCands} 個候選數字`;
        render();
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (disposed || !puzzleData) return;
      if (e.key >= '1' && e.key <= '9') {
        applyNumber(Number(e.key));
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        applyNumber(0);
      } else if (selectedIdx !== null && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const delta = e.key === 'ArrowUp' ? -9 : e.key === 'ArrowDown' ? 9 : e.key === 'ArrowLeft' ? -1 : 1;
        selectedIdx = Math.max(0, Math.min(80, selectedIdx + delta));
        render();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    function applyNumber(num: number): void {
      if (disposed || !puzzleData || selectedIdx === null || fixed[selectedIdx]) return;
      audioGateway.unlock();
      const now = performance.now();
      const rtMs = Math.round(now - lastActionMs);
      lastActionMs = now;

      if (num === 0) {
        grid[selectedIdx] = 0;
        notes[selectedIdx].clear();
        render();
        return;
      }

      if (noteMode) {
        if (notes[selectedIdx].has(num)) notes[selectedIdx].delete(num);
        else notes[selectedIdx].add(num);
        render();
        return;
      }

      grid[selectedIdx] = num;
      notes[selectedIdx].clear();
      if (hasConflict(selectedIdx, num)) {
        audioGateway.playTone('gentle');
        trials.push({ isTarget: true, correct: false, rtMs, errorType: 'rule' });
        statusLine.textContent = '同行、列或 3×3 九宮格已有相同數字囉';
      } else {
        audioGateway.playTone('success');
        trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
        statusLine.textContent = '繼續推論下一格！';
      }
      render();

      const solved = grid.every((val, i) => val !== 0 && val === puzzleData!.solution[i]);
      if (solved) {
        audioGateway.playTone('complete');
        const metrics = computeSessionMetrics(trials);
        config.onSessionComplete({
          gameId: 'sudoku9x9',
          ageTier: 'senior',
          seed: config.seed,
          level: config.level,
          metrics,
          axisScores: {
            attentionStability: metrics.asi,
            deductiveReasoning: Math.round(metrics.accuracy * 100),
          },
        });
      }
    }

    void requestSudoku9x9(config.seed, config.level).then((data) => {
      if (disposed) return;
      puzzleData = data;
      grid = [...data.puzzle];
      fixed = data.puzzle.map((v) => v !== 0);
      lastActionMs = performance.now();
      statusLine.textContent = '請填入 1–9，可善用筆記模式標記候選數字';
      render();
    });

    if (config.showTutorial) {
      const svg = `<div style="font-size:0.95rem;font-weight:600;color:#0072B2;">9×9 每行、每列與每塊 3×3 九宮格皆填入 1–9 不重複</div>`;
      const overlay = createTutorialOverlay('善用「筆記模式」做假設與排除演繹', svg, () => {
        audioGateway.unlock();
        lastActionMs = performance.now();
      });
      wrapper.appendChild(overlay);
    }

    return () => {
      disposed = true;
      window.removeEventListener('keydown', onKeyDown);
    };
  },
};
