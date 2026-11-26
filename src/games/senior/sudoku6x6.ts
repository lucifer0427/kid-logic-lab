import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { requestSudoku6x6 } from '../../worker/client';
import { Sudoku6x6Puzzle } from '../../worker/solvers/sudoku6x6';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

export const sudoku6x6Game: GameModule = {
  id: 'sudoku6x6',
  title: '6×6 演繹數獨',
  subtitle: '每行、每列與每個 2×3 區塊填入 1–6 不重複，可用筆記標記候選數',
  ageTier: 'senior',
  ageLabel: '高年級 10–12 歲',
  evidenceBadge: '設計推論（約束滿足與演繹排除）',
  primaryAxis: 'deductiveReasoning',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    let disposed = false;
    let puzzleData: Sudoku6x6Puzzle | null = null;
    let grid: number[] = [];
    let fixed: boolean[] = [];
    const notes: Set<number>[] = Array.from({ length: 36 }, () => new Set<number>());
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
        <span class="badge">難度 Lv.${config.level}</span>
        <span class="badge">唯一解保證</span>
      </div>
    `;

    const visualTimer = new VisualTimer('解題進度');
    const gridHost = document.createElement('div');
    gridHost.className = 'sudoku-host';
    gridHost.innerHTML = '<p class="loading-text">Web Worker 正在生成唯一解題盤...</p>';

    const controlsHost = document.createElement('div');
    controlsHost.className = 'sudoku-controls';

    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';
    statusLine.textContent = '載入中...';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(gridHost);
    wrapper.appendChild(controlsHost);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    function hasConflict(idx: number, val: number): boolean {
      if (val === 0) return false;
      const r = Math.floor(idx / 6);
      const c = idx % 6;
      const br = Math.floor(r / 2) * 2;
      const bc = Math.floor(c / 3) * 3;

      for (let i = 0; i < 6; i++) {
        const rowIdx = r * 6 + i;
        if (rowIdx !== idx && grid[rowIdx] === val) return true;
        const colIdx = i * 6 + c;
        if (colIdx !== idx && grid[colIdx] === val) return true;
      }
      for (let dr = 0; dr < 2; dr++) {
        for (let dc = 0; dc < 3; dc++) {
          const boxIdx = (br + dr) * 6 + (bc + dc);
          if (boxIdx !== idx && grid[boxIdx] === val) return true;
        }
      }
      return false;
    }

    function render(): void {
      if (disposed || !puzzleData) return;

      const totalBlanks = fixed.filter((f) => !f).length;
      const filledBlanks = grid.filter((v, i) => !fixed[i] && v !== 0 && !hasConflict(i, v)).length;
      visualTimer.setProgress(totalBlanks > 0 ? filledBlanks / totalBlanks : 1);

      const cellsHtml = grid
        .map((val, idx) => {
          const r = Math.floor(idx / 6);
          const c = idx % 6;
          const isFixed = fixed[idx];
          const isSelected = selectedIdx === idx;
          const conflict = val !== 0 && hasConflict(idx, val);
          const boxRight = c === 2 ? 'box-right' : '';
          const boxBottom = r === 1 || r === 3 ? 'box-bottom' : '';

          let inner = '';
          if (val !== 0) {
            inner = `<span class="cell-val">${val}</span>`;
          } else if (notes[idx].size > 0) {
            const noteItems = [1, 2, 3, 4, 5, 6]
              .map((n) => `<span>${notes[idx].has(n) ? n : ''}</span>`)
              .join('');
            inner = `<div class="cell-notes">${noteItems}</div>`;
          }

          return `
            <button type="button"
              class="sudoku-cell ${isFixed ? 'is-fixed' : ''} ${isSelected ? 'is-selected' : ''} ${conflict ? 'is-conflict' : ''} ${boxRight} ${boxBottom}"
              data-idx="${idx}"
              aria-label="第 ${r + 1} 列第 ${c + 1} 行${val ? '，數字 ' + val : '，空白'}">
              ${inner}
            </button>
          `;
        })
        .join('');

      gridHost.innerHTML = `<div class="sudoku-grid" role="grid">${cellsHtml}</div>`;

      gridHost.querySelectorAll<HTMLButtonElement>('.sudoku-cell').forEach((btn) => {
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          audioGateway.unlock();
          const idx = Number(btn.dataset.idx);
          selectedIdx = idx;
          render();
        });
      });

      const numButtons = [1, 2, 3, 4, 5, 6]
        .map(
          (n) =>
            `<button type="button" class="btn num-btn" data-num="${n}" aria-label="填入 ${n}">${n}</button>`,
        )
        .join('');

      controlsHost.innerHTML = `
        <div class="numpad-row">${numButtons}</div>
        <div class="mode-row">
          <button type="button" class="btn ${noteMode ? 'btn-primary' : 'btn-outline'}" id="toggle-note">
            ${noteMode ? '✎ 筆記模式：開啟' : '✎ 筆記模式：關閉'}
          </button>
          <button type="button" class="btn btn-outline" id="smart-hint">💡 給我一條線索</button>
          <button type="button" class="btn btn-outline" id="clear-cell">清除此格</button>
        </div>
      `;

      controlsHost.querySelectorAll<HTMLButtonElement>('.num-btn').forEach((btn) => {
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          applyNumber(Number(btn.dataset.num));
        });
      });

      controlsHost.querySelector('#toggle-note')?.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        noteMode = !noteMode;
        render();
      });

      controlsHost.querySelector('#smart-hint')?.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        giveSmartHint();
      });

      controlsHost.querySelector('#clear-cell')?.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        applyNumber(0);
      });
    }

    function giveSmartHint(): void {
      if (disposed || !puzzleData) return;
      let bestIdx = -1;
      let minCands = 7;
      for (let i = 0; i < 36; i++) {
        if (grid[i] !== 0) continue;
        let candCount = 0;
        for (let n = 1; n <= 6; n++) {
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
        const r = Math.floor(bestIdx / 6) + 1;
        const c = (bestIdx % 6) + 1;
        statusLine.textContent =
          minCands === 1
            ? `💡 看看第 ${r} 列第 ${c} 行：這格只剩下 1 個可能的數字囉！`
            : `💡 可以先觀察第 ${r} 列第 ${c} 行，它只剩 ${minCands} 個候選數字`;
        render();
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (disposed || !puzzleData) return;
      if (e.key >= '1' && e.key <= '6') {
        applyNumber(Number(e.key));
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        applyNumber(0);
      } else if (selectedIdx !== null && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const delta = e.key === 'ArrowUp' ? -6 : e.key === 'ArrowDown' ? 6 : e.key === 'ArrowLeft' ? -1 : 1;
        const next = Math.max(0, Math.min(35, selectedIdx + delta));
        selectedIdx = next;
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
        statusLine.textContent = '已更新候選筆記';
        render();
        return;
      }

      grid[selectedIdx] = num;
      notes[selectedIdx].clear();
      const conflict = hasConflict(selectedIdx, num);

      if (conflict) {
        audioGateway.playTone('gentle');
        trials.push({ isTarget: true, correct: false, rtMs, errorType: 'rule' });
        statusLine.textContent = '這一行、列或 2×3 區塊裡已經有相同數字囉';
      } else {
        audioGateway.playTone('success');
        trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
        statusLine.textContent = '推論順暢！繼續觀察其他格子的候選數';
      }

      render();

      const solved = grid.every((val, i) => val !== 0 && val === puzzleData!.solution[i]);
      if (solved) {
        audioGateway.playTone('complete');
        const metrics = computeSessionMetrics(trials);
        config.onSessionComplete({
          gameId: 'sudoku6x6',
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

    void requestSudoku6x6(config.seed, config.level).then((data) => {
      if (disposed) return;
      puzzleData = data;
      grid = [...data.puzzle];
      fixed = data.puzzle.map((v) => v !== 0);
      lastActionMs = performance.now();
      statusLine.textContent = '點選空格後填入數字 1–6，可開啟「筆記模式」做假設推論';
      render();
    });

    if (config.showTutorial) {
      const tutorialSvg = `
        <svg viewBox="0 0 220 110" width="220" height="110" aria-hidden="true">
          <rect x="40" y="15" width="140" height="80" rx="8" fill="#F8FAFC" stroke="#0072B2" stroke-width="3"/>
          <line x1="40" y1="55" x2="180" y2="55" stroke="#94A3B8" stroke-width="2"/>
          <line x1="87" y1="15" x2="87" y2="95" stroke="#94A3B8" stroke-width="2"/>
          <line x1="133" y1="15" x2="133" y2="95" stroke="#94A3B8" stroke-width="2"/>
          <text x="63" y="42" text-anchor="middle" font-size="18" font-weight="700" fill="#0F172A">1</text>
          <text x="110" y="42" text-anchor="middle" font-size="18" font-weight="700" fill="#0F172A">4</text>
          <text x="157" y="42" text-anchor="middle" font-size="18" font-weight="700" fill="#009E73">?</text>
          <text x="110" y="82" text-anchor="middle" font-size="12" fill="#475569">不重複 1–6</text>
        </svg>
      `;
      const overlay = createTutorialOverlay('每行、每列與每塊 2×3 區塊內的 1–6 都不重複', tutorialSvg, () => {
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
