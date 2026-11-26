import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { SeededRng } from '../../worker/prng';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

export type GateKind = 'AND' | 'OR' | 'XOR';

export interface LogicGatePuzzle {
  gate1: GateKind;
  gate2: GateKind;
  invertB: boolean;
  targetOutput: 0 | 1;
}

function evalGate(kind: GateKind, x: number, y: number): number {
  if (kind === 'AND') return x & y;
  if (kind === 'OR') return x | y;
  return x ^ y;
}

export function evalLogicCircuit(
  a: 0 | 1,
  b: 0 | 1,
  c: 0 | 1,
  spec: Omit<LogicGatePuzzle, 'targetOutput'>,
): 0 | 1 {
  const bVal = spec.invertB ? (b === 1 ? 0 : 1) : b;
  const mid = evalGate(spec.gate1, a, bVal);
  const out = evalGate(spec.gate2, mid, c);
  return (out ? 1 : 0) as 0 | 1;
}

const TOTAL_ROUNDS = 5;

export const logicGateGame: GameModule = {
  id: 'logicGate',
  title: '條件邏輯閘電路',
  subtitle: '調整開關 A、B、C 的 0/1 狀態，讓最後的燈泡達成指定目標（全採色覺友善標示）',
  ageTier: 'senior',
  ageLabel: '高年級 10–12 歲',
  evidenceBadge: '教育設計實證延伸（布林推導）',
  primaryAxis: 'deductiveReasoning',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const rng = new SeededRng(config.seed);
    const trials: TrialRecord[] = [];
    let round = 0;
    let disposed = false;
    let a: 0 | 1 = 0;
    let b: 0 | 1 = 0;
    let c: 0 | 1 = 0;
    let puzzle: LogicGatePuzzle = { gate1: 'AND', gate2: 'OR', invertB: false, targetOutput: 1 };
    let roundStartMs = performance.now();

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const visualTimer = new VisualTimer('電路關卡進度');
    const circuitHost = document.createElement('div');
    const controlsHost = document.createElement('div');
    controlsHost.className = 'numpad-row';
    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(circuitHost);
    wrapper.appendChild(controlsHost);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    function nextRound(): void {
      if (disposed) return;
      if (round >= TOTAL_ROUNDS) {
        visualTimer.setProgress(1);
        audioGateway.playTone('complete');
        const metrics = computeSessionMetrics(trials);
        config.onSessionComplete({
          gameId: 'logicGate',
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
      const gatePool: GateKind[] = config.level >= 2 || round >= 2 ? ['AND', 'OR', 'XOR'] : ['AND', 'OR'];
      const gate1: GateKind = gatePool[rng.int(0, gatePool.length - 1)];
      const gate2: GateKind = gatePool[rng.int(0, gatePool.length - 1)];
      const invertB = config.level >= 2 || round >= 2 ? rng.next() < 0.6 : false;
      const targetOutput: 0 | 1 = rng.next() < 0.7 ? 1 : 0;
      puzzle = { gate1, gate2, invertB, targetOutput };

      // Ensure starting state doesn't already equal targetOutput
      a = 0;
      b = 0;
      c = 0;
      if (evalLogicCircuit(a, b, c, puzzle) === targetOutput) {
        a = 1;
        if (evalLogicCircuit(a, b, c, puzzle) === targetOutput) {
          c = 1;
        }
      }

      roundStartMs = performance.now();
      render();
    }

    function render(): void {
      if (disposed) return;
      const bAfterNot = puzzle.invertB ? (b === 1 ? 0 : 1) : b;
      const mid = evalGate(puzzle.gate1, a, bAfterNot);
      const out = evalLogicCircuit(a, b, c, puzzle);

      // Okabe-Ito Blue (#0072B2) = 1 (ON), Slate (#94A3B8) = 0 (OFF) — never red/green!
      const wireColor = (val: number) => (val === 1 ? '#0072B2' : '#94A3B8');
      const gateColor = (g: GateKind) => (g === 'AND' ? '#0072B2' : g === 'OR' ? '#E69F00' : '#009E73');

      header.innerHTML = `
        <div class="stage-meta">
          <span class="badge">關卡 ${round + 1} / ${TOTAL_ROUNDS}</span>
          <span class="badge">目標輸出：${puzzle.targetOutput === 1 ? '1 (亮燈 ●)' : '0 (熄滅 ○)'}</span>
        </div>
      `;

      circuitHost.innerHTML = `
        <svg viewBox="0 0 460 210" class="logic-svg" aria-label="邏輯閘電路圖">
          <!-- Wires -->
          <line x1="65" y1="45" x2="170" y2="65" stroke="${wireColor(a)}" stroke-width="5"/>
          <line x1="65" y1="105" x2="${puzzle.invertB ? 110 : 170}" y2="95" stroke="${wireColor(b)}" stroke-width="5"/>
          ${
            puzzle.invertB
              ? `<rect x="105" y="78" width="44" height="30" rx="6" fill="#CC79A7" stroke="#0F172A" stroke-width="2"/>
                 <text x="127" y="98" text-anchor="middle" font-size="11" font-weight="700" fill="#FFF">NOT</text>
                 <line x1="149" y1="93" x2="170" y2="93" stroke="${wireColor(bAfterNot)}" stroke-width="5"/>`
              : ''
          }
          <line x1="235" y1="80" x2="295" y2="110" stroke="${wireColor(mid)}" stroke-width="5"/>
          <line x1="65" y1="165" x2="295" y2="140" stroke="${wireColor(c)}" stroke-width="5"/>
          <line x1="360" y1="125" x2="405" y2="125" stroke="${wireColor(out)}" stroke-width="5"/>

          <!-- Inputs -->
          <circle cx="48" cy="45" r="20" fill="${wireColor(a)}" stroke="#0F172A" stroke-width="2"/>
          <text x="48" y="50" text-anchor="middle" font-size="13" font-weight="700" fill="#FFF">A:${a}</text>

          <circle cx="48" cy="105" r="20" fill="${wireColor(b)}" stroke="#0F172A" stroke-width="2"/>
          <text x="48" y="110" text-anchor="middle" font-size="13" font-weight="700" fill="#FFF">B:${b}</text>

          <circle cx="48" cy="165" r="20" fill="${wireColor(c)}" stroke="#0F172A" stroke-width="2"/>
          <text x="48" y="170" text-anchor="middle" font-size="13" font-weight="700" fill="#FFF">C:${c}</text>

          <!-- Gate 1 -->
          <rect x="170" y="52" width="66" height="56" rx="10" fill="${gateColor(puzzle.gate1)}" stroke="#0F172A" stroke-width="2"/>
          <text x="203" y="85" text-anchor="middle" font-size="14" font-weight="700" fill="#FFF">${puzzle.gate1}</text>

          <!-- Gate 2 -->
          <rect x="295" y="97" width="66" height="56" rx="10" fill="${gateColor(puzzle.gate2)}" stroke="#0F172A" stroke-width="2"/>
          <text x="328" y="130" text-anchor="middle" font-size="14" font-weight="700" fill="#FFF">${puzzle.gate2}</text>

          <!-- Output Bulb -->
          <circle cx="425" cy="125" r="24" fill="${out === 1 ? '#F0E442' : '#E2E8F0'}" stroke="#0F172A" stroke-width="3"/>
          <text x="425" y="130" text-anchor="middle" font-size="14" font-weight="700" fill="#0F172A">${out}</text>
        </svg>
      `;

      controlsHost.innerHTML = `
        <button type="button" class="btn btn-outline" id="sw-a">切換 A (${a})</button>
        <button type="button" class="btn btn-outline" id="sw-b">切換 B (${b})</button>
        <button type="button" class="btn btn-outline" id="sw-c">切換 C (${c})</button>
        <button type="button" class="btn btn-primary" id="btn-check-circuit">送出驗證</button>
      `;

      controlsHost.querySelector('#sw-a')?.addEventListener('pointerdown', () => {
        audioGateway.unlock();
        a = a === 1 ? 0 : 1;
        render();
      });
      controlsHost.querySelector('#sw-b')?.addEventListener('pointerdown', () => {
        audioGateway.unlock();
        b = b === 1 ? 0 : 1;
        render();
      });
      controlsHost.querySelector('#sw-c')?.addEventListener('pointerdown', () => {
        audioGateway.unlock();
        c = c === 1 ? 0 : 1;
        render();
      });
      controlsHost.querySelector('#btn-check-circuit')?.addEventListener('pointerdown', () => {
        audioGateway.unlock();
        const rtMs = Math.round(performance.now() - roundStartMs);
        const currentOut = evalLogicCircuit(a, b, c, puzzle);
        if (currentOut === puzzle.targetOutput) {
          audioGateway.playTone('success');
          trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
          statusLine.textContent = '電路推導正確！';
          round += 1;
          window.setTimeout(nextRound, 350);
        } else {
          audioGateway.playTone('gentle');
          trials.push({ isTarget: true, correct: false, rtMs, errorType: 'rule' });
          statusLine.textContent = `目前輸出是 ${currentOut}，目標是 ${puzzle.targetOutput} 喔！`;
        }
      });
    }

    if (config.showTutorial) {
      const svg = `<div style="font-size:0.95rem;font-weight:600;color:#0072B2;">AND：兩邊都 1 才輸出 1｜OR：任一邊 1 就輸出 1｜NOT：反轉 0/1</div>`;
      const overlay = createTutorialOverlay('切換開關 A、B、C，讓最後燈泡等於目標值', svg, () => {
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
