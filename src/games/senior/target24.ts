import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { SeededRng } from '../../worker/prng';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

// Curated 4-number sets guaranteed to make 24
const TARGET_24_SETS: readonly number[][] = [
  [1, 2, 3, 4], // 1*2*3*4 = 24
  [3, 3, 8, 8], // 8/(3-8/3) = 24
  [2, 3, 4, 6], // 4*6*(3-2) = 24
  [1, 5, 5, 5], // (5-1/5)*5 = 24
  [4, 4, 7, 7], // (4-4/7)*7 = 24
  [2, 2, 6, 6], // 2*6 + 2*6 = 24
  [1, 3, 4, 6], // 6/(1-3/4) = 24
  [2, 5, 6, 8], // (5-2)*8 = 24? wait (8-5)*... (5+6-8)*? (6/2+5)*3 no, 2*8+6+2? (5-2)*6+... wait: (8/(5-3))? No, 2,5,6,8 -> (6-5+2)*8 = 24!
  [3, 4, 5, 6], // (5+3-4)*6 = 24
  [2, 4, 6, 8], // 6*4*(8? no) -> (8-4)*6 = 24? (6/2)*8 = 24! (8/(4-2))*6 = 24
];

/** Safe recursive-descent arithmetic evaluator (no eval/Function) */
export function evaluateArithmeticExpr(expr: string): number | null {
  const tokens = expr.match(/\d+|[+\-*/()]/g);
  if (!tokens || tokens.join('') !== expr.replace(/\s+/g, '')) return null;
  let pos = 0;

  function parseExpr(): number {
    let val = parseTerm();
    while (pos < tokens!.length && (tokens![pos] === '+' || tokens![pos] === '-')) {
      const op = tokens![pos++];
      const right = parseTerm();
      val = op === '+' ? val + right : val - right;
    }
    return val;
  }

  function parseTerm(): number {
    let val = parseFactor();
    while (pos < tokens!.length && (tokens![pos] === '*' || tokens![pos] === '/')) {
      const op = tokens![pos++];
      const right = parseFactor();
      if (op === '/' && Math.abs(right) < 1e-9) return Number.NaN;
      val = op === '*' ? val * right : val / right;
    }
    return val;
  }

  function parseFactor(): number {
    if (tokens![pos] === '(') {
      pos += 1;
      const val = parseExpr();
      if (tokens![pos] !== ')') return Number.NaN;
      pos += 1;
      return val;
    }
    const num = Number(tokens![pos++]);
    return Number.isFinite(num) ? num : Number.NaN;
  }

  const res = parseExpr();
  if (pos !== tokens.length || !Number.isFinite(res)) return null;
  return res;
}

const TOTAL_ROUNDS = 3;

export const target24Game: GameModule = {
  id: 'target24',
  title: '目標算式 24 點',
  subtitle: '把 4 張數字卡全部用上，搭配 ＋ − × ÷ ( ) 湊出 24！',
  ageTier: 'senior',
  ageLabel: '高年級 10–12 歲',
  evidenceBadge: '數感與運算優先順序（24 點）',
  primaryAxis: 'strategicPlanning',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const rng = new SeededRng(config.seed);
    const pickedIndices = rng.shuffle(Array.from({ length: TARGET_24_SETS.length }, (_, i) => i)).slice(0, TOTAL_ROUNDS);
    let round = 0;
    let nums: number[] = [];
    let usedMask: boolean[] = [];
    let exprTokens: { text: string; numIdx?: number }[] = [];
    const trials: TrialRecord[] = [];
    let roundStartMs = performance.now();
    let disposed = false;

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const visualTimer = new VisualTimer('闖關進度');
    const exprDisplay = document.createElement('div');
    exprDisplay.className = 't24-display';
    const cardsHost = document.createElement('div');
    cardsHost.className = 'numpad-row';
    const opsHost = document.createElement('div');
    opsHost.className = 'numpad-row';
    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(exprDisplay);
    wrapper.appendChild(cardsHost);
    wrapper.appendChild(opsHost);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    function startRound(): void {
      if (disposed) return;
      if (round >= TOTAL_ROUNDS) {
        visualTimer.setProgress(1);
        audioGateway.playTone('complete');
        const metrics = computeSessionMetrics(trials);
        config.onSessionComplete({
          gameId: 'target24',
          ageTier: 'senior',
          seed: config.seed,
          level: config.level,
          metrics,
          axisScores: {
            attentionStability: metrics.asi,
            strategicPlanning: Math.round(metrics.accuracy * 100),
          },
        });
        return;
      }

      visualTimer.setProgress(round / TOTAL_ROUNDS);
      nums = [...TARGET_24_SETS[pickedIndices[round]]];
      usedMask = [false, false, false, false];
      exprTokens = [];
      roundStartMs = performance.now();
      render();
    }

    function render(): void {
      if (disposed) return;
      header.innerHTML = `
        <div class="stage-meta">
          <span class="badge">第 ${round + 1} / ${TOTAL_ROUNDS} 題</span>
          <span class="badge">目標：24</span>
        </div>
      `;

      const exprStr = exprTokens.map((t) => t.text).join(' ');
      const previewVal = exprStr ? evaluateArithmeticExpr(exprStr.replace(/×/g, '*').replace(/÷/g, '/')) : null;
      exprDisplay.innerHTML = `
        <div class="t24-expr">${exprStr || '請依序點選數字與運算符號'}</div>
        <div class="t24-preview">${previewVal !== null ? `＝ ${Math.round(previewVal * 1000) / 1000}` : ''}</div>
      `;

      cardsHost.innerHTML = nums
        .map(
          (n, idx) => `
          <button type="button" class="btn ${usedMask[idx] ? 'btn-outline is-used' : 'btn-primary'} t24-num-btn"
            data-idx="${idx}" ${usedMask[idx] ? 'disabled' : ''}>
            ${n}
          </button>
        `,
        )
        .join('');

      cardsHost.querySelectorAll<HTMLButtonElement>('.t24-num-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          audioGateway.unlock();
          const idx = Number(btn.dataset.idx);
          if (usedMask[idx]) return;
          usedMask[idx] = true;
          exprTokens.push({ text: String(nums[idx]), numIdx: idx });
          audioGateway.playPentatonic(idx);
          render();
        });
      });

      const ops = ['+', '-', '*', '/', '(', ')'];
      const opLabels: Record<string, string> = { '+': '＋', '-': '－', '*': '×', '/': '÷', '(': '(', ')': ')' };
      opsHost.innerHTML = `
        ${ops.map((op) => `<button type="button" class="btn btn-outline t24-op-btn" data-op="${op}">${opLabels[op]}</button>`).join('')}
        <button type="button" class="btn btn-outline" id="t24-back">⌫ 退回</button>
        <button type="button" class="btn btn-primary" id="t24-check">送出 ＝ 24</button>
      `;

      opsHost.querySelectorAll<HTMLButtonElement>('.t24-op-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          audioGateway.unlock();
          exprTokens.push({ text: btn.dataset.op! });
          render();
        });
      });

      opsHost.querySelector('#t24-back')?.addEventListener('click', () => {
        const last = exprTokens.pop();
        if (last && typeof last.numIdx === 'number') {
          usedMask[last.numIdx] = false;
        }
        render();
      });

      opsHost.querySelector('#t24-check')?.addEventListener('click', () => {
        audioGateway.unlock();
        const rtMs = Math.round(performance.now() - roundStartMs);
        if (!usedMask.every(Boolean)) {
          statusLine.textContent = '4 張數字卡都要用到喔！';
          return;
        }
        const val = evaluateArithmeticExpr(exprTokens.map((t) => t.text).join(''));
        if (val !== null && Math.abs(val - 24) < 1e-6) {
          audioGateway.playTone('success');
          trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
          statusLine.textContent = '太聰明了！算式剛好等於 24！';
          round += 1;
          window.setTimeout(startRound, 450);
        } else {
          audioGateway.playTone('gentle');
          trials.push({ isTarget: true, correct: false, rtMs, errorType: 'rule' });
          statusLine.textContent = val === null ? '括號或算式格式不完整喔！' : `目前算出來是 ${Math.round(val * 100) / 100}，再調整看看！`;
        }
      });
    }

    if (config.showTutorial) {
      const svg = `<div style="font-size:0.95rem;font-weight:600;color:#0072B2;">例如 (8 − 4) × 6 = 24，四張牌都要用上一次！</div>`;
      const overlay = createTutorialOverlay('善用括號與四則運算，把 4 個數字變成 24', svg, () => {
        audioGateway.unlock();
        startRound();
      });
      wrapper.appendChild(overlay);
    } else {
      startRound();
    }

    return () => {
      disposed = true;
    };
  },
};
