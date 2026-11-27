import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { SeededRng } from '../../worker/prng';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

const PLAIN_WORDS = ['CAT', 'DOG', 'STAR', 'BOOK', 'FISH', 'JUMP', 'MIND', 'CODE'];

export function caesarEncode(word: string, shift: number): string {
  return word
    .split('')
    .map((ch) => String.fromCharCode(65 + ((ch.charCodeAt(0) - 65 + shift + 26) % 26)))
    .join('');
}

const TOTAL_ROUNDS = 5;

export const cipherBreakGame: GameModule = {
  id: 'cipherBreak',
  title: '凱撒密碼破譯',
  subtitle: '根據「字母往後推幾格」的加密規則，將密文反推還原成原本的英文單字！',
  ageTier: 'senior',
  ageLabel: '高年級 10–12 歲',
  evidenceBadge: '編碼轉換與工作記憶操作',
  primaryAxis: 'workingMemory',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const rng = new SeededRng(config.seed);
    const words = rng.shuffle([...PLAIN_WORDS]).slice(0, TOTAL_ROUNDS);
    const trials: TrialRecord[] = [];
    let round = 0;
    let roundStartMs = performance.now();
    let disposed = false;

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const visualTimer = new VisualTimer('解密進度');
    const cipherBox = document.createElement('div');
    cipherBox.className = 't24-display';
    const choicesHost = document.createElement('div');
    choicesHost.className = 'numpad-row';
    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(cipherBox);
    wrapper.appendChild(choicesHost);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    function nextRound(): void {
      if (disposed) return;
      if (round >= TOTAL_ROUNDS) {
        visualTimer.setProgress(1);
        audioGateway.playTone('complete');
        const metrics = computeSessionMetrics(trials);
        config.onSessionComplete({
          gameId: 'cipherBreak',
          ageTier: 'senior',
          seed: config.seed,
          level: config.level,
          metrics,
          axisScores: {
            attentionStability: metrics.asi,
            workingMemory: Math.round(metrics.accuracy * 100),
          },
        });
        return;
      }

      visualTimer.setProgress(round / TOTAL_ROUNDS);
      const plain = words[round];
      const shift = rng.int(1, 3);
      const encoded = caesarEncode(plain, shift);

      const distractors = rng.shuffle(PLAIN_WORDS.filter((w) => w !== plain)).slice(0, 3);
      const options = rng.shuffle([plain, ...distractors]);

      header.innerHTML = `<div class="stage-meta"><span class="badge">第 ${round + 1} / ${TOTAL_ROUNDS} 封密電</span></div>`;
      cipherBox.innerHTML = `
        <div>
          <div class="muted" style="font-size:0.85rem;">加密規則：每個字母往後移 <strong>+${shift}</strong> 格（A→${caesarEncode('A', shift)}）</div>
          <div class="t24-expr" style="letter-spacing:4px;margin-top:4px;">密文：${encoded}</div>
        </div>
      `;

      choicesHost.innerHTML = options
        .map((w) => `<button type="button" class="btn btn-outline btn-lg ciph-opt" data-w="${w}">${w}</button>`)
        .join('');

      let roundResolved = false;
      choicesHost.querySelectorAll<HTMLButtonElement>('.ciph-opt').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (roundResolved || disposed) return;
          audioGateway.unlock();
          const chosen = btn.dataset.w!;
          const rtMs = Math.round(performance.now() - roundStartMs);
          if (chosen === plain) {
            roundResolved = true;
            audioGateway.playPentatonic(round);
            trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
            statusLine.textContent = `破譯成功！密文 ${encoded} 就是 ${plain}`;
            round += 1;
            window.setTimeout(nextRound, 360);
          } else {
            audioGateway.playTone('gentle');
            trials.push({ isTarget: true, correct: false, rtMs, errorType: 'rule' });
            statusLine.textContent = `把密文第一個字母往前退 ${shift} 格試試看！`;
          }
        });
      });

      roundStartMs = performance.now();
    }

    if (config.showTutorial) {
      const svg = `<div style="font-size:0.95rem;font-weight:600;color:#0072B2;">例如規則是 +1 時，密文 B 往前退 1 格就是 A！</div>`;
      const overlay = createTutorialOverlay('依照位移規則反推原本的英文單字', svg, () => {
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
