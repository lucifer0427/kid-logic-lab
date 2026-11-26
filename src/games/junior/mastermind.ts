import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { SeededRng } from '../../worker/prng';
import { OKABE_ITO_PALETTE, renderThemedTokenSvg } from '../../ui/theme/okabeIto';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

export function scoreMastermindGuess(secret: number[], guess: number[]): { exact: number; misplaced: number } {
  let exact = 0;
  const secretRem: number[] = [];
  const guessRem: number[] = [];

  for (let i = 0; i < secret.length; i++) {
    if (guess[i] === secret[i]) {
      exact += 1;
    } else {
      secretRem.push(secret[i]);
      guessRem.push(guess[i]);
    }
  }

  let misplaced = 0;
  for (const g of guessRem) {
    const idx = secretRem.indexOf(g);
    if (idx !== -1) {
      misplaced += 1;
      secretRem.splice(idx, 1);
    }
  }

  return { exact, misplaced };
}

const MAX_ATTEMPTS = 7;

export const mastermindGame: GameModule = {
  id: 'mastermind',
  title: '圖形密碼破譯',
  subtitle: '根據「● 位置圖形全對」與「○ 只有圖形對」線索，在 7 次內猜出隱藏密碼',
  ageTier: 'junior',
  ageLabel: '低年級 6–8 歲',
  evidenceBadge: '經典假設驗證推理（Mastermind）',
  primaryAxis: 'deductiveReasoning',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const rng = new SeededRng(config.seed);
    const slots = config.level >= 2 ? 4 : 3;
    const poolSize = 4;
    const secret = Array.from({ length: slots }, () => rng.int(0, poolSize - 1));
    const skin = config.themeSkin ?? 'geometry';

    const history: { guess: number[]; exact: number; misplaced: number }[] = [];
    const currentGuess: (number | null)[] = new Array<number | null>(slots).fill(null);
    const trials: TrialRecord[] = [];
    let lastGuessMs = performance.now();
    let disposed = false;

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const visualTimer = new VisualTimer('破譯進度');
    const historyHost = document.createElement('div');
    historyHost.className = 'mm-history';
    const draftHost = document.createElement('div');
    draftHost.className = 'mm-draft';
    const pickerHost = document.createElement('div');
    pickerHost.className = 'numpad-row';
    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(historyHost);
    wrapper.appendChild(draftHost);
    wrapper.appendChild(pickerHost);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    function render(): void {
      if (disposed) return;
      header.innerHTML = `
        <div class="stage-meta">
          <span class="badge">種子 #${config.seed}</span>
          <span class="badge">剩餘 ${MAX_ATTEMPTS - history.length} 次機會</span>
        </div>
      `;
      visualTimer.setProgress(history.length / MAX_ATTEMPTS);

      historyHost.innerHTML =
        history.length === 0
          ? '<p class="muted">選好下方的圖形組合後按「驗證密碼」</p>'
          : history
              .map(
                (h, idx) => `
              <div class="mm-row">
                <span class="muted">#${idx + 1}</span>
                <div class="mm-tokens">${h.guess.map((g) => renderThemedTokenSvg(g, skin, 30)).join('')}</div>
                <span class="mm-feedback">●全對 ${h.exact} ｜ ○對色 ${h.misplaced}</span>
              </div>
            `,
              )
              .join('');

      draftHost.innerHTML = `
        <div class="mm-draft-slots">
          ${currentGuess
            .map(
              (val, idx) => `
            <button type="button" class="mm-slot" data-slot="${idx}" aria-label="密碼第 ${idx + 1} 格">
              ${val !== null ? renderThemedTokenSvg(val, skin, 38) : '?'}
            </button>
          `,
            )
            .join('')}
        </div>
      `;

      draftHost.querySelectorAll<HTMLButtonElement>('.mm-slot').forEach((btn) => {
        btn.addEventListener('click', () => {
          currentGuess[Number(btn.dataset.slot)] = null;
          render();
        });
      });

      const pickBtns = Array.from({ length: poolSize }, (_, i) => {
        const tok = OKABE_ITO_PALETTE[i];
        return `<button type="button" class="btn btn-outline token-pick-btn" data-val="${i}" aria-label="選擇${tok.nameZh}">
          ${renderThemedTokenSvg(i, skin, 32)}
        </button>`;
      }).join('');

      pickerHost.innerHTML = `
        ${pickBtns}
        <button type="button" class="btn btn-primary" id="mm-submit">驗證密碼</button>
      `;

      pickerHost.querySelectorAll<HTMLButtonElement>('.token-pick-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          audioGateway.unlock();
          const emptyIdx = currentGuess.indexOf(null);
          if (emptyIdx !== -1) {
            currentGuess[emptyIdx] = Number(btn.dataset.val);
            audioGateway.playPentatonic(emptyIdx);
            render();
          }
        });
      });

      pickerHost.querySelector('#mm-submit')?.addEventListener('click', submitGuess);
    }

    function submitGuess(): void {
      if (disposed || currentGuess.some((v) => v === null)) {
        statusLine.textContent = `請先填滿 ${slots} 個密碼格喔！`;
        return;
      }
      audioGateway.unlock();
      const guess = currentGuess as number[];
      const { exact, misplaced } = scoreMastermindGuess(secret, guess);
      history.push({ guess: [...guess], exact, misplaced });

      const rtMs = Math.round(performance.now() - lastGuessMs);
      lastGuessMs = performance.now();

      if (exact === slots) {
        audioGateway.playTone('complete');
        trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
        const metrics = computeSessionMetrics(trials);
        config.onSessionComplete({
          gameId: 'mastermind',
          ageTier: 'junior',
          seed: config.seed,
          level: Math.min(2, config.level + (history.length <= 4 ? 1 : 0)),
          metrics,
          axisScores: {
            attentionStability: metrics.asi,
            deductiveReasoning: Math.max(40, Math.round((1 - (history.length - 1) / MAX_ATTEMPTS) * 100)),
          },
        });
        return;
      }

      audioGateway.playTone('gentle');
      trials.push({ isTarget: true, correct: exact > 0 || misplaced > 0, rtMs, errorType: 'none' });
      currentGuess.fill(null);

      if (history.length >= MAX_ATTEMPTS) {
        const metrics = computeSessionMetrics(trials);
        statusLine.textContent = '這次機會用完囉，看看解答再挑戰一次！';
        config.onSessionComplete({
          gameId: 'mastermind',
          ageTier: 'junior',
          seed: config.seed,
          level: config.level,
          metrics: { ...metrics, accuracy: 0.5 },
          axisScores: {
            attentionStability: metrics.asi,
            deductiveReasoning: 50,
          },
        });
        return;
      }

      statusLine.textContent = `提示：● 全對 ${exact} 個、○ 對圖形但位置錯 ${misplaced} 個`;
      render();
    }

    render();
    statusLine.textContent = `猜出隱藏的 ${slots} 個圖形密碼！`;

    if (config.showTutorial) {
      const svg = `<div style="font-size:0.95rem;font-weight:600;color:#0072B2;">● = 位置與圖形都對｜○ = 圖形對但位置錯</div>`;
      const overlay = createTutorialOverlay('根據每次的 ● 與 ○ 線索縮小範圍，破譯密碼！', svg, () => {
        audioGateway.unlock();
        lastGuessMs = performance.now();
      });
      wrapper.appendChild(overlay);
    }

    return () => {
      disposed = true;
    };
  },
};
