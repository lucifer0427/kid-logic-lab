import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { SeededRng } from '../../worker/prng';
import { OKABE_ITO_PALETTE } from '../../ui/theme/okabeIto';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

export interface SetCard {
  color: 0 | 1 | 2;
  shape: 0 | 1 | 2; // 0: circle, 1: square, 2: triangle
  count: 1 | 2 | 3;
}

export function isValidSet(a: SetCard, b: SetCard, c: SetCard): boolean {
  const propOk = (x: number, y: number, z: number) =>
    (x === y && y === z) || (x !== y && y !== z && x !== z);
  return (
    propOk(a.color, b.color, c.color) &&
    propOk(a.shape, b.shape, c.shape) &&
    propOk(a.count, b.count, c.count)
  );
}

function renderSetCardSvg(card: SetCard): string {
  const hex = OKABE_ITO_PALETTE[card.color].hex;
  const shapes: string[] = [];
  const step = 22;
  const startX = 45 - ((card.count - 1) * step) / 2;
  for (let i = 0; i < card.count; i++) {
    const cx = startX + i * step;
    const cy = 28;
    if (card.shape === 0) {
      shapes.push(`<circle cx="${cx}" cy="${cy}" r="8" fill="${hex}" stroke="#0F172A" stroke-width="1.8"/>`);
    } else if (card.shape === 1) {
      shapes.push(`<rect x="${cx - 8}" y="${cy - 8}" width="16" height="16" rx="2" fill="${hex}" stroke="#0F172A" stroke-width="1.8"/>`);
    } else {
      shapes.push(`<polygon points="${cx},${cy - 9} ${cx + 8},${cy + 7} ${cx - 8},${cy + 7}" fill="${hex}" stroke="#0F172A" stroke-width="1.8"/>`);
    }
  }
  return `<svg viewBox="0 0 90 56" width="90" height="56" aria-hidden="true">${shapes.join('')}</svg>`;
}

const TOTAL_ROUNDS = 4;

export const setMatchGame: GameModule = {
  id: 'setMatch',
  title: '三維邏輯牌組（SET）',
  subtitle: '從 9 張牌找出 3 張一組：每個屬性（顏色、形狀、數量）必須「全相同」或「全不同」',
  ageTier: 'senior',
  ageLabel: '高年級 10–12 歲',
  evidenceBadge: '多維特徵歸納（Mini SET）',
  primaryAxis: 'deductiveReasoning',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const rng = new SeededRng(config.seed);
    const trials: TrialRecord[] = [];
    let round = 0;
    let cards: SetCard[] = [];
    let selected: number[] = [];
    let roundStartMs = performance.now();
    let disposed = false;

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const visualTimer = new VisualTimer('找牌進度');
    const boardHost = document.createElement('div');
    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(boardHost);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    function buildRoundBoard(): SetCard[] {
      // Build full 27-card deck, pick 9 cards guaranteed to contain at least 1 valid SET
      const deck: SetCard[] = [];
      for (const color of [0, 1, 2] as const) {
        for (const shape of [0, 1, 2] as const) {
          for (const count of [1, 2, 3] as const) {
            deck.push({ color, shape, count });
          }
        }
      }
      for (let attempt = 0; attempt < 50; attempt++) {
        const sample = rng.shuffle([...deck]).slice(0, 9);
        let hasSet = false;
        for (let i = 0; i < 9 && !hasSet; i++) {
          for (let j = i + 1; j < 9 && !hasSet; j++) {
            for (let k = j + 1; k < 9 && !hasSet; k++) {
              if (isValidSet(sample[i], sample[j], sample[k])) hasSet = true;
            }
          }
        }
        if (hasSet) return sample;
      }
      return deck.slice(0, 9);
    }

    function nextRound(): void {
      if (disposed) return;
      if (round >= TOTAL_ROUNDS) {
        visualTimer.setProgress(1);
        audioGateway.playTone('complete');
        const metrics = computeSessionMetrics(trials);
        config.onSessionComplete({
          gameId: 'setMatch',
          ageTier: 'senior',
          seed: config.seed,
          level: config.level,
          metrics,
          axisScores: {
            attentionStability: metrics.asi,
            deductiveReasoning: Math.round(metrics.accuracy * 100),
          },
        });
        return;
      }

      visualTimer.setProgress(round / TOTAL_ROUNDS);
      cards = buildRoundBoard();
      selected = [];
      roundStartMs = performance.now();
      render();
    }

    function render(): void {
      if (disposed) return;
      header.innerHTML = `
        <div class="stage-meta">
          <span class="badge">第 ${round + 1} / ${TOTAL_ROUNDS} 局</span>
          <span class="badge">已選 ${selected.length} / 3 張</span>
        </div>
      `;

      boardHost.innerHTML = `
        <div class="set-grid">
          ${cards
            .map(
              (c, idx) => `
            <button type="button" class="set-card ${selected.includes(idx) ? 'is-selected' : ''}" data-idx="${idx}">
              ${renderSetCardSvg(c)}
            </button>
          `,
            )
            .join('')}
        </div>
      `;

      boardHost.querySelectorAll<HTMLButtonElement>('.set-card').forEach((btn) => {
        btn.addEventListener('click', () => {
          audioGateway.unlock();
          const idx = Number(btn.dataset.idx);
          if (selected.includes(idx)) {
            selected = selected.filter((s) => s !== idx);
            render();
            return;
          }
          selected.push(idx);
          audioGateway.playPentatonic(selected.length);
          render();

          if (selected.length === 3) {
            const rtMs = Math.round(performance.now() - roundStartMs);
            const [i, j, k] = selected;
            if (isValidSet(cards[i], cards[j], cards[k])) {
              audioGateway.playTone('success');
              trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
              statusLine.textContent = '完美 SET！三個維度都符合「全同或全異」！';
              round += 1;
              window.setTimeout(nextRound, 450);
            } else {
              audioGateway.playTone('gentle');
              trials.push({ isTarget: true, correct: false, rtMs, errorType: 'rule' });
              statusLine.textContent = '這 3 張有一個維度出現「兩同ㄧ異」囉，換一張試試！';
              selected = [];
              window.setTimeout(render, 350);
            }
          }
        });
      });
    }

    if (config.showTutorial) {
      const svg = `<div style="font-size:0.95rem;font-weight:600;color:#0072B2;">顏色、形狀、數量這三個條件，每個都要「3張一樣」或「3張都不同」！</div>`;
      const overlay = createTutorialOverlay('選出 3 張組成一組合法 SET', svg, () => {
        audioGateway.unlock();
        nextRound();
      });
      wrapper.appendChild(overlay);
    } else {
      nextRound();
    }

    return () => {
      disposed = true;
    };
  },
};
