import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { SeededRng } from '../../worker/prng';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

// 0 = empty, 1 = '/' mirror, 2 = '\' mirror
export type MirrorCell = 0 | 1 | 2;

export function traceLaser(
  grid: MirrorCell[],
  size: number,
  startR: number,
  startC: number,
  startDir: number, // 0:N, 1:E, 2:S, 3:W
): [number, number][] {
  const dirs = [[-1, 0], [0, 1], [1, 0], [0, -1]];
  let r = startR;
  let c = startC;
  let dir = startDir;
  const visited: [number, number][] = [];
  const seenStates = new Set<string>();

  for (let step = 0; step < size * size * 2; step++) {
    if (r < 0 || r >= size || c < 0 || c >= size) break;
    const state = `${r},${c},${dir}`;
    if (seenStates.has(state)) break;
    seenStates.add(state);
    visited.push([r, c]);

    const m = grid[r * size + c];
    if (m === 1) {
      // '/' mirror: N(0)<->E(1), S(2)<->W(3)
      dir = dir === 0 ? 1 : dir === 1 ? 0 : dir === 2 ? 3 : 2;
    } else if (m === 2) {
      // '\' mirror: N(0)<->W(3), E(1)<->S(2)
      dir = dir === 0 ? 3 : dir === 3 ? 0 : dir === 1 ? 2 : 1;
    }
    r += dirs[dir][0];
    c += dirs[dir][1];
  }

  return visited;
}

interface LaserLevel {
  size: number;
  start: [number, number, number]; // r, c, dir
  goal: [number, number];
  mirrorCells: number[]; // rotatable mirror cell indices
}

const LASER_LEVELS: readonly LaserLevel[] = [
  { size: 4, start: [0, 0, 1], goal: [3, 3], mirrorCells: [3, 6, 14] }, // (0,0)->E to (0,3) '\'->S to (3,3)
  { size: 4, start: [3, 0, 0], goal: [0, 3], mirrorCells: [0, 5, 10] }, // (3,0)->N to (0,0) '/'->E to (0,3)
  { size: 4, start: [0, 0, 2], goal: [0, 3], mirrorCells: [8, 11, 2] }, // (0,0)->S to (2,0) '\'->E to (2,3) '/'->N to (0,3)
];

export const mirrorMazeGame: GameModule = {
  id: 'mirrorMaze',
  title: '雷射鏡面反射',
  subtitle: '點擊格子中的斜鏡旋轉方向（/ 或 \\），引導雷射光束照射到寶石 💎！',
  ageTier: 'middle',
  ageLabel: '中年級 8–10 歲',
  evidenceBadge: '空間光路幾何推理',
  primaryAxis: 'strategicPlanning',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const rng = new SeededRng(config.seed);
    const lvl = LASER_LEVELS[rng.int(0, LASER_LEVELS.length - 1)];
    const grid = new Array<MirrorCell>(lvl.size * lvl.size).fill(0);
    // Initialize mirrors ensuring the puzzle is NOT already solved on load
    lvl.mirrorCells.forEach((idx, i) => {
      grid[idx] = i % 2 === 0 ? 1 : 2;
    });
    const initBeam = traceLaser(grid, lvl.size, lvl.start[0], lvl.start[1], lvl.start[2]);
    if (initBeam.some(([r, c]) => r === lvl.goal[0] && c === lvl.goal[1])) {
      const firstMirror = lvl.mirrorCells[0];
      grid[firstMirror] = grid[firstMirror] === 1 ? 2 : 1;
    }

    const trials: TrialRecord[] = [];
    let lastTapMs = performance.now();
    let disposed = false;
    let completed = false;

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const visualTimer = new VisualTimer('光路調整');
    const boardHost = document.createElement('div');
    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(boardHost);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    function render(): void {
      if (disposed) return;
      const beam = traceLaser(grid, lvl.size, lvl.start[0], lvl.start[1], lvl.start[2]);
      const hitGoal = beam.some(([r, c]) => r === lvl.goal[0] && c === lvl.goal[1]);
      visualTimer.setProgress(hitGoal ? 1 : 0.4);

      header.innerHTML = `
        <div class="stage-meta">
          <span class="badge">4×4 光學鏡面室</span>
          <span class="badge">${hitGoal ? '💎 擊中寶石！' : '調整鏡面角度中'}</span>
        </div>
      `;

      const beamSet = new Set(beam.map(([r, c]) => `${r},${c}`));
      const cells = grid
        .map((m, idx) => {
          const r = Math.floor(idx / lvl.size);
          const c = idx % lvl.size;
          const isStart = r === lvl.start[0] && c === lvl.start[1];
          const isGoal = r === lvl.goal[0] && c === lvl.goal[1];
          const isMirror = lvl.mirrorCells.includes(idx);
          const lit = beamSet.has(`${r},${c}`);
          const label = m === 1 ? '╱' : m === 2 ? '╲' : isStart ? '🔦' : isGoal ? '💎' : '';
          return `
            <button type="button"
              class="maze-cell ${lit ? 'is-beam' : ''} ${isMirror ? 'is-mirror' : ''}"
              data-idx="${idx}"
              ${!isMirror ? 'disabled' : ''}>
              ${label}
            </button>
          `;
        })
        .join('');

      boardHost.innerHTML = `
        <div class="maze-grid" style="grid-template-columns: repeat(${lvl.size}, 62px);">
          ${cells}
        </div>
      `;

      boardHost.querySelectorAll<HTMLButtonElement>('.is-mirror').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (disposed || completed) return;
          audioGateway.unlock();
          const idx = Number(btn.dataset.idx);
          grid[idx] = grid[idx] === 1 ? 2 : 1;
          const rtMs = Math.round(performance.now() - lastTapMs);
          lastTapMs = performance.now();

          audioGateway.playPentatonic(idx);
          trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
          render();

          const newBeam = traceLaser(grid, lvl.size, lvl.start[0], lvl.start[1], lvl.start[2]);
          if (newBeam.some(([r, c]) => r === lvl.goal[0] && c === lvl.goal[1])) {
            completed = true;
            audioGateway.playTone('complete');
            statusLine.textContent = '雷射精準反射擊中寶石 💎！';
            const metrics = computeSessionMetrics(trials);
            window.setTimeout(() => {
              if (disposed) return;
              config.onSessionComplete({
                gameId: 'mirrorMaze',
                ageTier: 'middle',
                seed: config.seed,
                level: config.level,
                metrics,
                axisScores: {
                  attentionStability: metrics.asi,
                  strategicPlanning: Math.round(metrics.accuracy * 100),
                },
              });
            }, 550);
          }
        });
      });
    }

    render();
    statusLine.textContent = '點擊有斜線的鏡子（╱ 或 ╲）改變光線反射方向';

    if (config.showTutorial) {
      const svg = `<div style="font-size:0.95rem;font-weight:600;color:#0072B2;">光線碰到 ╱ 或 ╲ 會 90 度轉彎，讓光束打到 💎！</div>`;
      const overlay = createTutorialOverlay('旋轉斜鏡角度，引導光束射中寶石', svg, () => {
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
