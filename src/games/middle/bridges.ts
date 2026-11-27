import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { SeededRng } from '../../worker/prng';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

interface Island {
  id: number;
  r: number;
  c: number;
  target: number;
}

interface BridgePuzzle {
  rows: number;
  cols: number;
  islands: Island[];
}

// Verified-solvable Hashiwokakero puzzles
const BRIDGE_PUZZLES: readonly BridgePuzzle[] = [
  {
    rows: 4,
    cols: 4,
    islands: [
      { id: 0, r: 0, c: 0, target: 2 },
      { id: 1, r: 0, c: 3, target: 3 },
      { id: 2, r: 2, c: 0, target: 3 },
      { id: 3, r: 2, c: 3, target: 4 },
      { id: 4, r: 3, c: 1, target: 2 },
      { id: 5, r: 3, c: 3, target: 2 },
    ],
    // Wait: let's verify degrees sum to even & solvable:
    // (0)-(1):2? No if (0)-(1):1, (0)-(2):1 -> deg0=2. (1)-(3):2 -> deg1=3. (2)-(3):2 -> deg2=3.
    // (3)-(5):0? Wait (4) is at (3,1) with no neighbors in row 3 except (5) at (3,3)! So (4)-(5):2 -> deg4=2, deg5=2!
    // Sum of degrees around (3): 2 (from 1) + 2 (from 2) = 4! Connected? Wait: {0,1,2,3} and {4,5} would be disconnected!
    // Good thing I checked! Let's connect (4) at (3,0) or (2,1)? Better: put (4) at (3,0) so (2)-(4) connects!
  },
];

// Let's define 3 100% connected, verified-solvable Bridge puzzles:
const VERIFIED_BRIDGES: readonly BridgePuzzle[] = [
  // Puzzle 1: 4x4, 5 islands. Edges: (0)-(1):2, (1)-(3):1, (0)-(2):1, (2)-(3):1, (3)-(4):2 -> degrees: 0:3, 1:3, 2:2, 3:4, 4:2
  {
    rows: 4,
    cols: 4,
    islands: [
      { id: 0, r: 0, c: 0, target: 3 },
      { id: 1, r: 0, c: 3, target: 3 },
      { id: 2, r: 2, c: 0, target: 2 },
      { id: 3, r: 2, c: 3, target: 4 },
      { id: 4, r: 3, c: 3, target: 2 },
    ],
  },
  // Puzzle 2: 4x4, 6 islands. Edges: (0)-(1):1, (0)-(2):2, (1)-(3):2, (2)-(3):1, (2)-(4):1, (4)-(5):2 -> degrees: 0:3, 1:3, 2:4, 3:3, 4:3, 5:2
  {
    rows: 4,
    cols: 4,
    islands: [
      { id: 0, r: 0, c: 0, target: 3 },
      { id: 1, r: 0, c: 3, target: 3 },
      { id: 2, r: 2, c: 0, target: 4 },
      { id: 3, r: 2, c: 3, target: 3 },
      { id: 4, r: 3, c: 0, target: 3 },
      { id: 5, r: 3, c: 3, target: 2 },
    ],
  },
  // Puzzle 3: 5x5, 6 islands. Edges: (0)-(1):2, (1)-(2):1, (1)-(4):2, (0)-(3):1, (3)-(4):1, (4)-(5):2 -> degrees: 0:3, 1:5, 2:1, 3:2, 4:5, 5:2
  {
    rows: 5,
    cols: 5,
    islands: [
      { id: 0, r: 0, c: 0, target: 3 },
      { id: 1, r: 0, c: 2, target: 5 },
      { id: 2, r: 0, c: 4, target: 1 },
      { id: 3, r: 3, c: 0, target: 2 },
      { id: 4, r: 3, c: 2, target: 5 },
      { id: 5, r: 3, c: 4, target: 2 },
    ],
  },
];

void BRIDGE_PUZZLES;

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

export const bridgesGame: GameModule = {
  id: 'bridges',
  title: '島嶼造橋連線',
  subtitle: '依序點兩座同排或同列的島嶼架設橋樑（0→1→2 條），讓每座島的橋數等於數字',
  ageTier: 'middle',
  ageLabel: '中年級 8–10 歲',
  evidenceBadge: '經典約束滿足謎題（Hashiwokakero）',
  primaryAxis: 'strategicPlanning',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const rng = new SeededRng(config.seed);
    const puzzle = VERIFIED_BRIDGES[rng.int(0, VERIFIED_BRIDGES.length - 1)];
    const bridges = new Map<string, number>(); // edgeKey -> 1 | 2
    let selectedIsland: number | null = null;
    const trials: TrialRecord[] = [];
    let lastTapMs = performance.now();
    let disposed = false;

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const visualTimer = new VisualTimer('造橋進度');
    const svgHost = document.createElement('div');
    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(svgHost);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    function canConnect(a: Island, b: Island): boolean {
      if (a.id === b.id) return false;
      if (a.r !== b.r && a.c !== b.c) return false;
      // Ensure no intermediate island blocks the straight line
      for (const isl of puzzle.islands) {
        if (isl.id === a.id || isl.id === b.id) continue;
        if (a.r === b.r && isl.r === a.r && isl.c > Math.min(a.c, b.c) && isl.c < Math.max(a.c, b.c)) return false;
        if (a.c === b.c && isl.c === a.c && isl.r > Math.min(a.r, b.r) && isl.r < Math.max(a.r, b.r)) return false;
      }
      return true;
    }

    function degreeOf(id: number): number {
      let sum = 0;
      for (const [key, count] of bridges.entries()) {
        const [a, b] = key.split('-').map(Number);
        if (a === id || b === id) sum += count;
      }
      return sum;
    }

    function render(): void {
      if (disposed) return;
      const doneIslands = puzzle.islands.filter((isl) => degreeOf(isl.id) === isl.target).length;
      visualTimer.setProgress(doneIslands / puzzle.islands.length);

      header.innerHTML = `
        <div class="stage-meta">
          <span class="badge">島嶼造橋（${doneIslands} / ${puzzle.islands.length} 座完成）</span>
        </div>
      `;

      const cell = 76;
      const pad = 42;
      const w = (puzzle.cols - 1) * cell + pad * 2;
      const h = (puzzle.rows - 1) * cell + pad * 2;

      const linesSvg: string[] = [];
      for (const [key, count] of bridges.entries()) {
        if (count === 0) continue;
        const [idA, idB] = key.split('-').map(Number);
        const a = puzzle.islands.find((i) => i.id === idA)!;
        const b = puzzle.islands.find((i) => i.id === idB)!;
        const x1 = pad + a.c * cell;
        const y1 = pad + a.r * cell;
        const x2 = pad + b.c * cell;
        const y2 = pad + b.r * cell;

        if (count === 1) {
          linesSvg.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#0072B2" stroke-width="5"/>`);
        } else {
          const dx = a.r === b.r ? 0 : 5;
          const dy = a.r === b.r ? 5 : 0;
          linesSvg.push(`<line x1="${x1 - dx}" y1="${y1 - dy}" x2="${x2 - dx}" y2="${y2 - dy}" stroke="#0072B2" stroke-width="4"/>`);
          linesSvg.push(`<line x1="${x1 + dx}" y1="${y1 + dy}" x2="${x2 + dx}" y2="${y2 + dy}" stroke="#0072B2" stroke-width="4"/>`);
        }
      }

      const islandsSvg = puzzle.islands
        .map((isl) => {
          const cx = pad + isl.c * cell;
          const cy = pad + isl.r * cell;
          const deg = degreeOf(isl.id);
          const isSel = selectedIsland === isl.id;
          const isExact = deg === isl.target;
          const isOver = deg > isl.target;
          const fill = isOver ? '#FFEDD5' : isExact ? '#DCFCE7' : isSel ? '#E0F2FE' : '#FFFFFF';
          const stroke = isOver ? '#D55E00' : isExact ? '#009E73' : '#0F172A';
          return `
            <g class="island-hit" data-id="${isl.id}" style="cursor:pointer;">
              <circle cx="${cx}" cy="${cy}" r="24" fill="${fill}" stroke="${stroke}" stroke-width="${isSel ? 4 : 2.5}"/>
              <text x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="18" font-weight="700" fill="#0F172A">${isl.target}</text>
            </g>
          `;
        })
        .join('');

      svgHost.innerHTML = `
        <svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" class="bridges-svg" aria-label="島嶼造橋盤面">
          ${linesSvg.join('')}
          ${islandsSvg}
        </svg>
      `;

      svgHost.querySelectorAll<SVGGElement>('.island-hit').forEach((g) => {
        g.addEventListener('click', () => {
          audioGateway.unlock();
          const id = Number(g.dataset.id);
          handleIslandClick(id);
        });
      });
    }

    function handleIslandClick(id: number): void {
      if (disposed) return;
      if (selectedIsland === null) {
        selectedIsland = id;
        statusLine.textContent = '請點選同排或同列的另一座島嶼來架橋';
        render();
        return;
      }
      if (selectedIsland === id) {
        selectedIsland = null;
        render();
        return;
      }

      const a = puzzle.islands.find((i) => i.id === selectedIsland)!;
      const b = puzzle.islands.find((i) => i.id === id)!;
      selectedIsland = null;

      const rtMs = Math.round(performance.now() - lastTapMs);
      lastTapMs = performance.now();

      if (!canConnect(a, b)) {
        audioGateway.playTone('gentle');
        trials.push({ isTarget: true, correct: false, rtMs, errorType: 'rule' });
        statusLine.textContent = '只能連接同一橫排或直列、且中間沒有其他島嶼的兩座島喔！';
        render();
        return;
      }

      const key = edgeKey(a.id, b.id);
      const nextCount = ((bridges.get(key) ?? 0) + 1) % 3;
      if (nextCount === 0) bridges.delete(key);
      else bridges.set(key, nextCount);

      audioGateway.playPentatonic(nextCount + 1);
      trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
      render();

      const allSatisfied = puzzle.islands.every((isl) => degreeOf(isl.id) === isl.target);
      if (allSatisfied) {
        audioGateway.playTone('complete');
        const metrics = computeSessionMetrics(trials);
        config.onSessionComplete({
          gameId: 'bridges',
          ageTier: 'middle',
          seed: config.seed,
          level: config.level,
          metrics,
          axisScores: {
            attentionStability: metrics.asi,
            strategicPlanning: Math.round(metrics.accuracy * 100),
          },
        });
      }
    }

    render();
    statusLine.textContent = '點兩座相鄰的島架橋（點一次 1 條、兩次 2 條、三次清除）';

    if (config.showTutorial) {
      const svg = `<div style="font-size:0.95rem;font-weight:600;color:#0072B2;">島上的數字 ＝ 要連出的橋樑總數，不能斜著連喔！</div>`;
      const overlay = createTutorialOverlay('把相鄰島嶼連起來，讓每座島的橋數剛好等於數字', svg, () => {
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
