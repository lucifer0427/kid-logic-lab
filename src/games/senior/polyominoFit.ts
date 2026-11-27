import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { OKABE_ITO_PALETTE } from '../../ui/theme/okabeIto';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

type Coord = [number, number];

interface PolyPiece {
  id: number;
  name: string;
  baseCells: Coord[];
  rotation: number; // 0..3
  placedAt: Coord | null;
}

function rotateCells(cells: Coord[], rot: number): Coord[] {
  let out = cells.map(([r, c]) => [r, c] as Coord);
  for (let i = 0; i < rot; i++) {
    out = out.map(([r, c]) => [c, -r] as Coord);
  }
  const minR = Math.min(...out.map(([r]) => r));
  const minC = Math.min(...out.map(([_, c]) => c));
  return out.map(([r, c]) => [r - minR, c - minC]);
}

export const polyominoFitGame: GameModule = {
  id: 'polyominoFit',
  title: '方塊拼圖填滿',
  subtitle: '將 4 塊不同形狀的積木旋轉角度後放入 4×4 棋盤，剛好填滿全部 16 格！',
  ageTier: 'senior',
  ageLabel: '高年級 10–12 歲',
  evidenceBadge: '空間旋轉與幾何組裝（Polyomino）',
  primaryAxis: 'strategicPlanning',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    // Exact 4x4 partition into 4 tetrominoes (4*4 = 16 cells)
    const pieces: PolyPiece[] = [
      { id: 0, name: 'L 型', baseCells: [[0, 0], [1, 0], [2, 0], [2, 1]], rotation: 1, placedAt: null },
      { id: 1, name: 'L 型2', baseCells: [[0, 0], [1, 0], [2, 0], [2, 1]], rotation: 2, placedAt: null },
      { id: 2, name: 'O 型', baseCells: [[0, 0], [0, 1], [1, 0], [1, 1]], rotation: 0, placedAt: null },
      { id: 3, name: 'I 型', baseCells: [[0, 0], [0, 1], [0, 2], [0, 3]], rotation: 1, placedAt: null },
    ];
    // Wait: check if L, L, O, I can tile 4x4:
    // Row 0-1, Col 0-1 = O (2x2). Col 2-3, Row 0-3 (2x4) can be tiled by two L's? No, two L's tile 2x4?
    // Check: L1 at (0,0)-(2,1) takes 4 cells of 2x4, leaving (0,1),(1,1),(3,0),(3,1) -> NOT another L!
    // What tiles 4x4 cleanly? Two L's tile 2x4? No, two L's tile 2x4 ONLY if one is L and one is J, OR two L's rotated 180 deg!
    // Let's check two L's rotated 180 deg on 2x4 (4 rows, 2 cols):
    // L1: (0,0),(1,0),(2,0),(2,1) -> remaining: (0,1),(1,1),(3,0),(3,1) -> NOT L!
    // What about 4x4 = two 2x4 rectangles? A 2x4 rectangle is tiled by L + L? No! In 2x4:
    // Top-left L: (0,0),(0,1),(1,0),(2,0)? No, on 3x2: (0,0),(0,1),(1,0),(2,0) leaves (1,1),(2,1) (a domino).
    // Two L's tile a 2x4? Let's test:
    // Piece 1: (0,0),(0,1),(0,2),(1,0) [width 3, height 2].
    // Piece 2 (rotated 180): (1,3),(1,2),(1,1),(0,3) [width 3, height 2]!
    // Check union on 2x4:
    // Row 0: (0,0),(0,1),(0,2) + (0,3) -> FULL!
    // Row 1: (1,0) + (1,1),(1,2),(1,3) -> FULL!
    // YES! Two identical L-tetrominoes rotated 180° tile a 2x4 rectangle!!
    // And the other 2x4 rectangle (Rows 2-3, Cols 0-3) is tiled by O (2x2) + O (2x2) OR I (1x4) + I (1x4)!
    // Even better: O + two I's? Wait: O + I + I = 4+4+4 = 12, not 8. Two I's = 8!
    // So [L, L, I, I] tiles 4x4 cleanly (2x4 by L+L, 2x4 by I+I), AND [L, L, L, L] tiles 4x4 too!
    pieces[2] = { id: 2, name: 'I 型1', baseCells: [[0, 0], [0, 1], [0, 2], [0, 3]], rotation: 1, placedAt: null };
    pieces[3] = { id: 3, name: 'I 型2', baseCells: [[0, 0], [0, 1], [0, 2], [0, 3]], rotation: 0, placedAt: null };

    let selectedPiece = 0;
    const trials: TrialRecord[] = [];
    let lastTapMs = performance.now();
    let disposed = false;

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const visualTimer = new VisualTimer('拼圖進度');
    const boardHost = document.createElement('div');
    const trayHost = document.createElement('div');
    trayHost.className = 'numpad-row';
    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(boardHost);
    wrapper.appendChild(trayHost);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    function occupiedBy(excludeId = -1): Map<string, number> {
      const map = new Map<string, number>();
      for (const p of pieces) {
        if (p.id === excludeId || !p.placedAt) continue;
        const cells = rotateCells(p.baseCells, p.rotation);
        for (const [dr, dc] of cells) {
          map.set(`${p.placedAt[0] + dr},${p.placedAt[1] + dc}`, p.id);
        }
      }
      return map;
    }

    function render(): void {
      if (disposed) return;
      const occ = occupiedBy();
      visualTimer.setProgress(occ.size / 16);

      header.innerHTML = `
        <div class="stage-meta">
          <span class="badge">4×4 幾何拼圖</span>
          <span class="badge">已放入 ${occ.size} / 16 格</span>
        </div>
      `;

      const cells: string[] = [];
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          const owner = occ.get(`${r},${c}`);
          const bg = owner !== undefined ? OKABE_ITO_PALETTE[owner].hex : '#F8FAFC';
          cells.push(`
            <button type="button" class="poly-cell" style="background:${bg};" data-r="${r}" data-c="${c}" aria-label="第 ${r + 1} 列第 ${c + 1} 行">
              ${owner !== undefined ? '■' : ''}
            </button>
          `);
        }
      }
      boardHost.innerHTML = `<div class="maze-grid" style="grid-template-columns: repeat(4, 58px);">${cells.join('')}</div>`;

      trayHost.innerHTML = `
        ${pieces
          .map((p) => {
            const isSel = selectedPiece === p.id;
            const placed = p.placedAt !== null;
            return `<button type="button" class="btn ${isSel ? 'btn-primary' : 'btn-outline'} poly-pick" data-id="${p.id}"
              style="border-color:${OKABE_ITO_PALETTE[p.id].hex};">
              ${placed ? '✓ ' : ''}${p.name}
            </button>`;
          })
          .join('')}
        <button type="button" class="btn btn-outline" id="poly-rotate">↻ 旋轉 90°</button>
        <button type="button" class="btn btn-outline" id="poly-clear">↺ 全部拿起來</button>
      `;

      trayHost.querySelectorAll<HTMLButtonElement>('.poly-pick').forEach((btn) => {
        btn.addEventListener('click', () => {
          selectedPiece = Number(btn.dataset.id);
          render();
        });
      });

      trayHost.querySelector('#poly-rotate')?.addEventListener('click', () => {
        audioGateway.unlock();
        const p = pieces[selectedPiece];
        p.rotation = (p.rotation + 1) % 4;
        p.placedAt = null;
        statusLine.textContent = `已將 ${p.name} 旋轉 90°（目前角度 ${p.rotation * 90}°），請點棋盤放置`;
        render();
      });

      trayHost.querySelector('#poly-clear')?.addEventListener('click', () => {
        pieces.forEach((p) => { p.placedAt = null; });
        render();
      });

      boardHost.querySelectorAll<HTMLButtonElement>('.poly-cell').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (disposed) return;
          audioGateway.unlock();
          const r = Number(btn.dataset.r);
          const c = Number(btn.dataset.c);
          const occNow = occupiedBy();
          const existingOwner = occNow.get(`${r},${c}`);
          if (existingOwner !== undefined) {
            pieces[existingOwner].placedAt = null;
            selectedPiece = existingOwner;
            render();
            return;
          }

          const p = pieces[selectedPiece];
          const shape = rotateCells(p.baseCells, p.rotation);
          const otherOcc = occupiedBy(p.id);
          const fits = shape.every(([dr, dc]) => {
            const nr = r + dr;
            const nc = c + dc;
            return nr >= 0 && nr < 4 && nc >= 0 && nc < 4 && !otherOcc.has(`${nr},${nc}`);
          });

          const rtMs = Math.round(performance.now() - lastTapMs);
          lastTapMs = performance.now();

          if (!fits) {
            audioGateway.playTone('gentle');
            trials.push({ isTarget: true, correct: false, rtMs, errorType: 'rule' });
            statusLine.textContent = '超出邊界或撞到其他積木囉！試著旋轉 90° 或換個位置';
            return;
          }

          p.placedAt = [r, c];
          audioGateway.playPentatonic(p.id + 1);
          trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
          render();

          if (occupiedBy().size === 16) {
            audioGateway.playTone('complete');
            const metrics = computeSessionMetrics(trials);
            config.onSessionComplete({
              gameId: 'polyominoFit',
              ageTier: 'senior',
              seed: config.seed,
              level: config.level,
              metrics,
              axisScores: {
                attentionStability: metrics.asi,
                strategicPlanning: Math.round(metrics.accuracy * 100),
              },
            });
          }
        });
      });
    }

    render();
    statusLine.textContent = '選一塊積木，按「↻ 旋轉 90°」調整方向後點棋盤放入！';

    if (config.showTutorial) {
      const svg = `<div style="font-size:0.95rem;font-weight:600;color:#0072B2;">把兩塊 L 型和兩塊 I 型積木旋轉放入 4×4 棋盤填滿 16 格！</div>`;
      const overlay = createTutorialOverlay('旋轉積木並剛好填滿 4×4 棋盤', svg, () => {
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
