import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { StaircaseController } from '../../engine/dda/staircase';
import { SeededRng } from '../../worker/prng';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

// Curated verified-solvable Sokoban maps: '#' wall, '.' goal, '$' box, '@' player
export const SOKOBAN_MAPS: readonly string[][] = [
  [
    '######',
    '# .  #',
    '# $  #',
    '# $@ #',
    '# .  #',
    '######',
  ],
  [
    '######',
    '#   .#',
    '# $$ #',
    '# .@ #',
    '#    #',
    '######',
  ],
  [
    '#######',
    '#  .  #',
    '# #$# #',
    '# $@$ #',
    '#  .  #',
    '#  .  #',
    '#######',
  ],
  [
    '#######',
    '# . . #',
    '# $$$ #',
    '#  @  #',
    '#  .  #',
    '#######',
  ],
];

interface SokobanState {
  player: [number, number];
  boxes: Set<string>;
}

export const sokobanGame: GameModule = {
  id: 'sokoban',
  title: '推箱子迷宮',
  subtitle: '只能「推」不能「拉」，把所有箱子推到星星目標點（小心別推到死角喔）',
  ageTier: 'middle',
  ageLabel: '中年級 8–10 歲',
  evidenceBadge: '前瞻規劃經典（Mini Sokoban）',
  primaryAxis: 'strategicPlanning',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const rng = new SeededRng(config.seed);
    const staircase = new StaircaseController({
      initialLevel: config.level,
      minLevel: 1,
      maxLevel: SOKOBAN_MAPS.length,
    });

    const mapIdx = (staircase.currentLevel - 1 + rng.int(0, 1)) % SOKOBAN_MAPS.length;
    const rawMap = SOKOBAN_MAPS[mapIdx];
    const rows = rawMap.length;
    const cols = rawMap[0].length;

    const walls = new Set<string>();
    const goals = new Set<string>();
    let initPlayer: [number, number] = [1, 1];
    const initBoxes = new Set<string>();

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ch = rawMap[r][c];
        const key = `${r},${c}`;
        if (ch === '#') walls.add(key);
        else if (ch === '.') goals.add(key);
        else if (ch === '$') initBoxes.add(key);
        else if (ch === '@') initPlayer = [r, c];
      }
    }

    let player: [number, number] = [...initPlayer];
    let boxes = new Set<string>(initBoxes);
    const undoStack: SokobanState[] = [];
    const trials: TrialRecord[] = [];
    let moves = 0;
    let lastMoveMs = performance.now();
    let disposed = false;

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const visualTimer = new VisualTimer('推箱進度');
    const boardHost = document.createElement('div');
    const dpadHost = document.createElement('div');
    dpadHost.className = 'sokoban-controls';
    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(boardHost);
    wrapper.appendChild(dpadHost);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    function move(dr: number, dc: number): void {
      if (disposed) return;
      audioGateway.unlock();
      const nr = player[0] + dr;
      const nc = player[1] + dc;
      const nKey = `${nr},${nc}`;
      if (walls.has(nKey)) return;

      const rtMs = Math.round(performance.now() - lastMoveMs);
      lastMoveMs = performance.now();

      if (boxes.has(nKey)) {
        const br = nr + dr;
        const bc = nc + dc;
        const bKey = `${br},${bc}`;
        if (walls.has(bKey) || boxes.has(bKey)) {
          audioGateway.playTone('gentle');
          trials.push({ isTarget: true, correct: false, rtMs, errorType: 'rule' });
          statusLine.textContent = '前面被擋住了推不動喔！';
          return;
        }
        undoStack.push({ player: [...player], boxes: new Set(boxes) });
        boxes.delete(nKey);
        boxes.add(bKey);
      } else {
        undoStack.push({ player: [...player], boxes: new Set(boxes) });
      }

      player = [nr, nc];
      moves += 1;
      audioGateway.playPentatonic(moves);
      trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
      render();

      const allOnGoals = Array.from(goals).every((g) => boxes.has(g));
      if (allOnGoals) {
        audioGateway.playTone('complete');
        staircase.record(true);
        const metrics = computeSessionMetrics(trials);
        config.onSessionComplete({
          gameId: 'sokoban',
          ageTier: 'middle',
          seed: config.seed,
          level: staircase.currentLevel,
          metrics,
          axisScores: {
            attentionStability: metrics.asi,
            strategicPlanning: Math.round(metrics.accuracy * 100),
          },
        });
      }
    }

    function render(): void {
      if (disposed) return;
      const onGoalCount = Array.from(goals).filter((g) => boxes.has(g)).length;
      visualTimer.setProgress(goals.size > 0 ? onGoalCount / goals.size : 0);

      header.innerHTML = `
        <div class="stage-meta">
          <span class="badge">關卡 #${mapIdx + 1}</span>
          <span class="badge">已歸位 ${onGoalCount} / ${goals.size}｜步數 ${moves}</span>
        </div>
      `;

      const cells: string[] = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const key = `${r},${c}`;
          const isWall = walls.has(key);
          const isGoal = goals.has(key);
          const isBox = boxes.has(key);
          const isPlayer = player[0] === r && player[1] === c;
          const boxDone = isBox && isGoal;
          cells.push(`
            <div class="maze-cell ${isWall ? 'is-wall' : ''} ${boxDone ? 'is-goal' : ''}">
              ${isPlayer ? '🤖' : isBox ? (boxDone ? '✅' : '📦') : isGoal ? '⭐' : isWall ? '🧱' : ''}
            </div>
          `);
        }
      }

      boardHost.innerHTML = `
        <div class="maze-grid" style="grid-template-columns: repeat(${cols}, 48px);">
          ${cells.join('')}
        </div>
      `;

      dpadHost.innerHTML = `
        <div class="dpad-grid">
          <div></div>
          <button type="button" class="btn btn-outline dpad-btn" data-d="-1,0" aria-label="向上">⬆</button>
          <div></div>
          <button type="button" class="btn btn-outline dpad-btn" data-d="0,-1" aria-label="向左">⬅</button>
          <button type="button" class="btn btn-outline dpad-btn" data-d="1,0" aria-label="向下">⬇</button>
          <button type="button" class="btn btn-outline dpad-btn" data-d="0,1" aria-label="向右">➡</button>
        </div>
        <div class="mode-row">
          <button type="button" class="btn btn-outline" id="soko-undo">↩ 退回一步</button>
          <button type="button" class="btn btn-outline" id="soko-reset">↺ 重置這關</button>
        </div>
      `;

      dpadHost.querySelectorAll<HTMLButtonElement>('.dpad-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const [dr, dc] = btn.dataset.d!.split(',').map(Number);
          move(dr, dc);
        });
      });

      dpadHost.querySelector('#soko-undo')?.addEventListener('click', () => {
        const prev = undoStack.pop();
        if (prev) {
          player = prev.player;
          boxes = prev.boxes;
          render();
        }
      });

      dpadHost.querySelector('#soko-reset')?.addEventListener('click', () => {
        player = [...initPlayer];
        boxes = new Set(initBoxes);
        undoStack.length = 0;
        moves = 0;
        render();
      });
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') { e.preventDefault(); move(-1, 0); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); move(1, 0); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); move(0, -1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); move(0, 1); }
    };
    window.addEventListener('keydown', onKeyDown);

    render();
    statusLine.textContent = '把所有 📦 箱子推到 ⭐ 星星上（可用方向鍵或下方按鈕）';

    if (config.showTutorial) {
      const svg = `<div style="font-size:0.95rem;font-weight:600;color:#0072B2;">🤖 → 📦 → ⭐（先想清楚順序，避免箱子卡進牆角！）</div>`;
      const overlay = createTutorialOverlay('把所有箱子推到星星位置就過關，卡住了可以退回一步', svg, () => {
        audioGateway.unlock();
        lastMoveMs = performance.now();
      });
      wrapper.appendChild(overlay);
    }

    return () => {
      disposed = true;
      window.removeEventListener('keydown', onKeyDown);
    };
  },
};
