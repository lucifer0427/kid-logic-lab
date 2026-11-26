import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { StaircaseController } from '../../engine/dda/staircase';
import { SeededRng } from '../../worker/prng';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

export type MazeCmd = 'FWD' | 'LEFT' | 'RIGHT' | 'REPEAT2' | 'REPEAT3';

interface MazeLevelSpec {
  size: number;
  start: [number, number];
  dir: number; // 0:N, 1:E, 2:S, 3:W
  goal: [number, number];
  keyPos: [number, number] | null;
  walls: Set<string>;
}

const DIRS = [
  [-1, 0],
  [0, 1],
  [1, 0],
  [0, -1],
];

function buildMaze(seed: number, level: number): MazeLevelSpec {
  const rng = new SeededRng(seed);
  const size = level >= 2 ? 5 : 4;
  const start: [number, number] = [size - 1, 0];
  const goal: [number, number] = [0, size - 1];
  const walls = new Set<string>();

  // Carve a guaranteed valid path (right/up steps) then sprinkle non-blocking walls
  const pathList: [number, number][] = [start];
  const path = new Set<string>([`${start[0]},${start[1]}`]);
  let r = start[0];
  let c = start[1];
  while (r > goal[0] || c < goal[1]) {
    if (r > goal[0] && (c === goal[1] || rng.next() < 0.5)) r -= 1;
    else c += 1;
    pathList.push([r, c]);
    path.add(`${r},${c}`);
  }

  // At Lv2+, place a key on an intermediate path tile so the path is always solvable!
  let keyPos: [number, number] | null = null;
  if (level >= 2 && pathList.length > 3) {
    const mid = pathList[Math.floor(pathList.length / 2)];
    keyPos = [mid[0], mid[1]];
  }

  const wallTarget = level >= 2 ? 4 : 2;
  let placed = 0;
  for (let attempt = 0; attempt < 25 && placed < wallTarget; attempt++) {
    const wr = rng.int(0, size - 1);
    const wc = rng.int(0, size - 1);
    const key = `${wr},${wc}`;
    if (!path.has(key) && !walls.has(key)) {
      walls.add(key);
      placed += 1;
    }
  }

  return { size, start, dir: 1, goal, keyPos, walls };
}

export interface ExpandedStep {
  cmd: 'FWD' | 'LEFT' | 'RIGHT';
  sourceIdx: number;
}

export function expandCommands(cmds: MazeCmd[]): ('FWD' | 'LEFT' | 'RIGHT')[] {
  return expandCommandsWithSource(cmds).map((s) => s.cmd);
}

export function expandCommandsWithSource(cmds: MazeCmd[]): ExpandedStep[] {
  const out: ExpandedStep[] = [];
  for (let i = 0; i < cmds.length; i++) {
    const cmd = cmds[i];
    if (cmd === 'REPEAT2' && out.length > 0) {
      out.push({ cmd: out[out.length - 1].cmd, sourceIdx: i });
    } else if (cmd === 'REPEAT3' && out.length > 0) {
      const prev = out[out.length - 1].cmd;
      out.push({ cmd: prev, sourceIdx: i });
      out.push({ cmd: prev, sourceIdx: i });
    } else if (cmd !== 'REPEAT2' && cmd !== 'REPEAT3') {
      out.push({ cmd, sourceIdx: i });
    }
  }
  return out;
}

export const blockMazeGame: GameModule = {
  id: 'blockMaze',
  title: '積木指令序列迷宮',
  subtitle: '組合「前進、轉向、重複」積木後一次執行；Lv.2 起需先拿鑰匙才能開門！',
  ageTier: 'middle',
  ageLabel: '中年級 8–10 歲',
  evidenceBadge: '教育科技標準實證延伸（ISTE 演算法思維）',
  primaryAxis: 'strategicPlanning',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const staircase = new StaircaseController({
      initialLevel: config.level,
      minLevel: 1,
      maxLevel: 3,
    });

    const maze = buildMaze(config.seed, staircase.currentLevel);
    const program: MazeCmd[] = [];
    let botPos: [number, number] = [...maze.start];
    let botDir = maze.dir;
    let hasKey = maze.keyPos === null;
    let visited = new Set<string>([`${maze.start[0]},${maze.start[1]}`]);
    let collisionKey: string | null = null;
    let failingChipIdx: number | null = null;
    let running = false;
    let disposed = false;
    let lastActionMs = performance.now();
    const trials: TrialRecord[] = [];

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const visualTimer = new VisualTimer('程式執行');
    const boardHost = document.createElement('div');
    const programHost = document.createElement('div');
    programHost.className = 'program-strip';
    const paletteHost = document.createElement('div');
    paletteHost.className = 'numpad-row';
    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(boardHost);
    wrapper.appendChild(programHost);
    wrapper.appendChild(paletteHost);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    const CMD_LABELS: Record<MazeCmd, string> = {
      FWD: '⬆ 前進',
      LEFT: '↺ 左轉',
      RIGHT: '↻ 右轉',
      REPEAT2: '⟳ 重複×2',
      REPEAT3: '⟳ 重複×3',
    };

    function render(): void {
      if (disposed) return;
      header.innerHTML = `
        <div class="stage-meta">
          <span class="badge">${maze.size}×${maze.size} 迷宮（Lv.${staircase.currentLevel}）</span>
          ${maze.keyPos ? `<span class="badge">${hasKey ? '🗝️ 已取得鑰匙' : '🔒 尚未取得鑰匙'}</span>` : ''}
        </div>
      `;

      const cells: string[] = [];
      for (let r = 0; r < maze.size; r++) {
        for (let c = 0; c < maze.size; c++) {
          const key = `${r},${c}`;
          const isWall = maze.walls.has(key);
          const isGoal = r === maze.goal[0] && c === maze.goal[1];
          const isKeyTile = maze.keyPos !== null && !hasKey && r === maze.keyPos[0] && c === maze.keyPos[1];
          const isBot = r === botPos[0] && c === botPos[1];
          const isCrash = collisionKey === key;
          const isVisited = visited.has(key) && !isBot;
          const arrow = ['▲', '▶', '▼', '◀'][botDir];
          cells.push(`
            <div class="maze-cell ${isWall ? 'is-wall' : ''} ${isGoal ? 'is-goal' : ''} ${isCrash ? 'is-crash' : ''} ${isVisited ? 'is-visited' : ''}">
              ${isBot ? `<span class="bot-icon">${arrow}</span>` : isGoal ? (hasKey ? '🏁' : '🚪') : isKeyTile ? '🗝️' : isWall ? '🧱' : isVisited ? '·' : ''}
            </div>
          `);
        }
      }

      boardHost.innerHTML = `
        <div class="maze-grid" style="grid-template-columns: repeat(${maze.size}, 52px);">
          ${cells.join('')}
        </div>
      `;

      programHost.innerHTML =
        program.length === 0
          ? '<span class="muted">點選下方積木加入指令序列...</span>'
          : program
              .map(
                (cmd, i) =>
                  `<button type="button" class="cmd-chip ${failingChipIdx === i ? 'is-error-chip' : ''}" data-idx="${i}" title="點擊移除">${i + 1}. ${CMD_LABELS[cmd]} ✕</button>`,
              )
              .join('');

      programHost.querySelectorAll<HTMLButtonElement>('.cmd-chip').forEach((btn) => {
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          if (running) return;
          program.splice(Number(btn.dataset.idx), 1);
          failingChipIdx = null;
          render();
        });
      });

      paletteHost.innerHTML = `
        <button type="button" class="btn btn-outline cmd-add" data-cmd="FWD">⬆ 前進</button>
        <button type="button" class="btn btn-outline cmd-add" data-cmd="LEFT">↺ 左轉</button>
        <button type="button" class="btn btn-outline cmd-add" data-cmd="RIGHT">↻ 右轉</button>
        <button type="button" class="btn btn-outline cmd-add" data-cmd="REPEAT2">⟳ 重複×2</button>
        <button type="button" class="btn btn-outline cmd-add" data-cmd="REPEAT3">⟳ 重複×3</button>
        <button type="button" class="btn btn-primary" id="btn-run-maze">▶ 執行程式</button>
        <button type="button" class="btn btn-outline" id="btn-reset-maze">↺ 重置</button>
      `;

      paletteHost.querySelectorAll<HTMLButtonElement>('.cmd-add').forEach((btn) => {
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          if (running || program.length >= 16) return;
          audioGateway.unlock();
          failingChipIdx = null;
          program.push(btn.dataset.cmd as MazeCmd);
          render();
        });
      });

      paletteHost.querySelector('#btn-reset-maze')?.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (running) return;
        botPos = [...maze.start];
        botDir = maze.dir;
        hasKey = maze.keyPos === null;
        visited = new Set<string>([`${maze.start[0]},${maze.start[1]}`]);
        collisionKey = null;
        failingChipIdx = null;
        render();
      });

      paletteHost.querySelector('#btn-run-maze')?.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (!running && program.length > 0) void executeProgram();
      });
    }

    async function executeProgram(): Promise<void> {
      running = true;
      audioGateway.unlock();
      botPos = [...maze.start];
      botDir = maze.dir;
      hasKey = maze.keyPos === null;
      visited = new Set<string>([`${maze.start[0]},${maze.start[1]}`]);
      collisionKey = null;
      failingChipIdx = null;

      const steps = expandCommandsWithSource(program);
      const rtMs = Math.round(performance.now() - lastActionMs);
      lastActionMs = performance.now();

      for (let i = 0; i < steps.length; i++) {
        if (disposed) return;
        visualTimer.setProgress((i + 1) / steps.length);
        const { cmd, sourceIdx } = steps[i];

        if (cmd === 'LEFT') {
          botDir = (botDir + 3) % 4;
        } else if (cmd === 'RIGHT') {
          botDir = (botDir + 1) % 4;
        } else {
          const nr = botPos[0] + DIRS[botDir][0];
          const nc = botPos[1] + DIRS[botDir][1];
          if (nr < 0 || nr >= maze.size || nc < 0 || nc >= maze.size || maze.walls.has(`${nr},${nc}`)) {
            collisionKey = `${botPos[0]},${botPos[1]}`;
            failingChipIdx = sourceIdx;
            audioGateway.playTone('gentle');
            trials.push({ isTarget: true, correct: false, rtMs, errorType: 'rule' });
            statusLine.textContent = `第 ${sourceIdx + 1} 塊積木撞到邊界或牆壁囉！已標紅該積木方便除錯`;
            running = false;
            render();
            return;
          }
          botPos = [nr, nc];
          visited.add(`${nr},${nc}`);
          if (maze.keyPos && nr === maze.keyPos[0] && nc === maze.keyPos[1]) {
            hasKey = true;
            audioGateway.playPentatonic(2);
          }
        }

        render();
        await new Promise((res) => window.setTimeout(res, 210));
      }

      running = false;
      if (botPos[0] === maze.goal[0] && botPos[1] === maze.goal[1]) {
        if (!hasKey) {
          audioGateway.playTone('gentle');
          trials.push({ isTarget: true, correct: false, rtMs, errorType: 'rule' });
          statusLine.textContent = '門還沒開喔！要先經過 🗝️ 鑰匙再走到終點 🚪';
          return;
        }
        audioGateway.playTone('complete');
        trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
        staircase.record(true);
        const metrics = computeSessionMetrics(trials);
        config.onSessionComplete({
          gameId: 'blockMaze',
          ageTier: 'middle',
          seed: config.seed,
          level: staircase.currentLevel,
          metrics,
          axisScores: {
            attentionStability: metrics.asi,
            strategicPlanning: Math.round(metrics.accuracy * 100),
          },
        });
      } else {
        audioGateway.playTone('gentle');
        trials.push({ isTarget: true, correct: false, rtMs, errorType: 'rule' });
        statusLine.textContent = '還沒走到終點，試著多加幾步或修改轉向！';
      }
    }

    render();
    statusLine.textContent = maze.keyPos
      ? '先收集 🗝️ 鑰匙，再走進終點大門！'
      : '組合指令積木，引導箭頭走到終點 🏁';

    if (config.showTutorial) {
      const svg = `<div style="font-size:1rem;font-weight:600;color:#0072B2;">⬆ 前進 + ↺ 左轉 → ▶ 一次執行並除錯</div>`;
      const overlay = createTutorialOverlay('先想好路線排好積木，再按執行觀察結果', svg, () => {
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
