import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { SeededRng } from '../../worker/prng';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

const WORDS = ['CAT', 'DOG', 'SUN', 'MAP', 'BOX', 'FUN', 'STAR', 'BLUE'];

export const wordSearchGame: GameModule = {
  id: 'wordSearch',
  title: '字母矩陣搜尋',
  subtitle: '在 5×5 字母盤中橫向或直向找出指定的英文單字，依序點選它的字母！',
  ageTier: 'middle',
  ageLabel: '中年級 8–10 歲',
  evidenceBadge: '系統性視覺掃描（Matrix Search）',
  primaryAxis: 'attentionStability',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const rng = new SeededRng(config.seed);
    const size = 5;
    const grid = Array.from({ length: size * size }, () => String.fromCharCode(65 + rng.int(0, 25)));
    const targets = rng.shuffle([...WORDS]).slice(0, 3);
    const targetCoords = new Map<string, number[]>();

    // Place 3 words cleanly (horizontal on distinct rows to avoid accidental collision)
    const rows = rng.shuffle([0, 1, 2, 3, 4]).slice(0, 3);
    targets.forEach((word, i) => {
      const r = rows[i];
      const startC = rng.int(0, size - word.length);
      const coords: number[] = [];
      for (let k = 0; k < word.length; k++) {
        const idx = r * size + (startC + k);
        grid[idx] = word[k];
        coords.push(idx);
      }
      targetCoords.set(word, coords);
    });

    const foundWords = new Set<string>();
    const foundCells = new Set<number>();
    let selected: number[] = [];
    const trials: TrialRecord[] = [];
    let lastTapMs = performance.now();
    let disposed = false;

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const visualTimer = new VisualTimer('尋字進度');
    const targetHost = document.createElement('div');
    targetHost.className = 'numpad-row';
    const boardHost = document.createElement('div');
    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(targetHost);
    wrapper.appendChild(boardHost);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    function render(): void {
      if (disposed) return;
      visualTimer.setProgress(foundWords.size / targets.length);
      header.innerHTML = `<div class="stage-meta"><span class="badge">已找到 ${foundWords.size} / ${targets.length} 個</span></div>`;

      targetHost.innerHTML = targets
        .map((w) => `<span class="badge ${foundWords.has(w) ? 'is-found-badge' : ''}">${foundWords.has(w) ? `✓ ${w}` : w}</span>`)
        .join('');

      boardHost.innerHTML = `
        <div class="schulte-grid" style="grid-template-columns: repeat(${size}, 54px);">
          ${grid
            .map((ch, idx) => {
              const isFound = foundCells.has(idx);
              const isSel = selected.includes(idx);
              return `
              <button type="button"
                class="schulte-cell ${isFound ? 'is-found' : ''} ${isSel ? 'is-selected' : ''}"
                style="width:54px;height:54px;font-size:1.3rem;"
                data-idx="${idx}">
                ${ch}
              </button>
            `;
            })
            .join('')}
        </div>
      `;

      boardHost.querySelectorAll<HTMLButtonElement>('.schulte-cell').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.dataset.idx);
          if (disposed) return;
          audioGateway.unlock();

          if (selected.includes(idx)) {
            selected = selected.filter((s) => s !== idx);
            render();
            return;
          }

          selected.push(idx);
          const matchWord = targets.find((w) => {
            if (foundWords.has(w)) return false;
            const coords = targetCoords.get(w)!;
            return coords.length === selected.length && coords.every((c, i) => c === selected[i]);
          });
          const isPrefix = targets.some((w) => {
            if (foundWords.has(w)) return false;
            const coords = targetCoords.get(w)!;
            return selected.length <= coords.length && selected.every((c, i) => c === coords[i]);
          });

          const rtMs = Math.round(performance.now() - lastTapMs);
          if (matchWord) {
            lastTapMs = performance.now();
            foundWords.add(matchWord);
            selected.forEach((i) => foundCells.add(i));
            selected = [];
            audioGateway.playPentatonic(foundWords.size + 1);
            trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
            statusLine.textContent = `找到 ${matchWord} 了！`;
            render();

            if (foundWords.size === targets.length) {
              audioGateway.playTone('complete');
              const metrics = computeSessionMetrics(trials);
              config.onSessionComplete({
                gameId: 'wordSearch',
                ageTier: 'middle',
                seed: config.seed,
                level: config.level,
                metrics,
                axisScores: {
                  attentionStability: metrics.asi,
                },
              });
            }
          } else if (!isPrefix) {
            audioGateway.playTone('gentle');
            trials.push({ isTarget: true, correct: false, rtMs, errorType: 'commission' });
            selected = [];
            statusLine.textContent = '這組字母不是目標單字喔，重新依序點選！';
            render();
          } else {
            audioGateway.playPentatonic(selected.length);
            render();
          }
        });
      });
    }

    render();
    statusLine.textContent = '依單字字母順序點選盤面上的字母！';

    if (config.showTutorial) {
      const svg = `<div style="font-size:0.95rem;font-weight:600;color:#0072B2;">找到目標單字後，從第一個字母依序點到最後一個字母！</div>`;
      const overlay = createTutorialOverlay('掃描字母矩陣，找出上方的目標單字', svg, () => {
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
