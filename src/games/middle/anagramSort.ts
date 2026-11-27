import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { SeededRng } from '../../worker/prng';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

const IDIOMS: readonly string[] = [
  '專心致志',
  '腳踏實地',
  '舉一反三',
  '全神貫注',
  '循序漸進',
  '迎刃而解',
  '深思熟慮',
  '水落石出',
];

const TOTAL_ROUNDS = 5;

export const anagramSortGame: GameModule = {
  id: 'anagramSort',
  title: '成語語詞重組',
  subtitle: '觀察被打亂的四個字，依正確順序點選組合成熟悉的成語！',
  ageTier: 'middle',
  ageLabel: '中年級 8–10 歲',
  evidenceBadge: '語文工作記憶與詞彙重組',
  primaryAxis: 'workingMemory',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const rng = new SeededRng(config.seed);
    const chosenIdioms = rng.shuffle([...IDIOMS]).slice(0, TOTAL_ROUNDS);
    let round = 0;
    let shuffledChars: { ch: string; origIdx: number }[] = [];
    let nextPos = 0;
    const trials: TrialRecord[] = [];
    let lastTapMs = performance.now();
    let disposed = false;

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const visualTimer = new VisualTimer('組詞進度');
    const slotsHost = document.createElement('div');
    slotsHost.className = 'train-row';
    const charsHost = document.createElement('div');
    charsHost.className = 'numpad-row';
    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(slotsHost);
    wrapper.appendChild(charsHost);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    function startRound(): void {
      if (disposed) return;
      if (round >= TOTAL_ROUNDS) {
        visualTimer.setProgress(1);
        audioGateway.playTone('complete');
        const metrics = computeSessionMetrics(trials);
        config.onSessionComplete({
          gameId: 'anagramSort',
          ageTier: 'middle',
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
      const word = chosenIdioms[round];
      shuffledChars = rng.shuffle(word.split('').map((ch, origIdx) => ({ ch, origIdx })));
      nextPos = 0;
      lastTapMs = performance.now();
      render();
    }

    function render(): void {
      if (disposed) return;
      const word = chosenIdioms[round];
      header.innerHTML = `<div class="stage-meta"><span class="badge">第 ${round + 1} / ${TOTAL_ROUNDS} 題</span></div>`;

      slotsHost.innerHTML = word
        .split('')
        .map((ch, i) => `<div class="train-car ${i >= nextPos ? 'is-missing' : ''}">${i < nextPos ? ch : '?'}</div>`)
        .join('');

      charsHost.innerHTML = shuffledChars
        .map((item) => {
          const used = item.origIdx < nextPos;
          return `
            <button type="button" class="btn btn-outline btn-lg ana-btn" data-orig="${item.origIdx}" ${used ? 'disabled' : ''}>
              ${item.ch}
            </button>
          `;
        })
        .join('');

      charsHost.querySelectorAll<HTMLButtonElement>('.ana-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          audioGateway.unlock();
          const orig = Number(btn.dataset.orig);
          const rtMs = Math.round(performance.now() - lastTapMs);
          lastTapMs = performance.now();

          if (orig === nextPos) {
            audioGateway.playPentatonic(nextPos);
            trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
            nextPos += 1;
            render();
            if (nextPos >= 4) {
              statusLine.textContent = `組合成功：「${word}」！`;
              round += 1;
              window.setTimeout(startRound, 500);
            }
          } else {
            audioGateway.playTone('gentle');
            trials.push({ isTarget: true, correct: false, rtMs, errorType: 'rule' });
            statusLine.textContent = `第 ${nextPos + 1} 個字不是這個喔，再唸看看！`;
          }
        });
      });
    }

    if (config.showTutorial) {
      const svg = `<div style="font-size:0.95rem;font-weight:600;color:#0072B2;">從第 1 個字依序點到第 4 個字，排出正確的四字成語！</div>`;
      const overlay = createTutorialOverlay('重組打亂的四字成語', svg, () => {
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
