import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { SeededRng } from '../../worker/prng';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

interface StorySet {
  title: string;
  steps: { icon: string; label: string }[];
}

const STORIES: readonly StorySet[] = [
  {
    title: '小種子長大',
    steps: [
      { icon: '🕳️', label: '挖洞放種子' },
      { icon: '💧', label: '澆水曬太陽' },
      { icon: '🌱', label: '長出小嫩芽' },
      { icon: '🌸', label: '開出漂亮花朵' },
    ],
  },
  {
    title: '準備出門上學',
    steps: [
      { icon: '⏰', label: '鬧鐘響起床' },
      { icon: '🪥', label: '刷牙洗臉' },
      { icon: '🎒', label: '背上書包' },
      { icon: '🏫', label: '開開心心到校' },
    ],
  },
  {
    title: '做一份三明治',
    steps: [
      { icon: '🧼', label: '先洗乾淨手' },
      { icon: '🍞', label: '拿兩片吐司' },
      { icon: '🧀', label: '夾起司和生菜' },
      { icon: '🥪', label: '大口享用美食' },
    ],
  },
  {
    title: '寄信給好朋友',
    steps: [
      { icon: '✏️', label: '寫好卡片內容' },
      { icon: '✉️', label: '裝進信封貼郵票' },
      { icon: '📮', label: '投進郵筒裡' },
      { icon: '📬', label: '朋友收到信' },
    ],
  },
];

export const storyOrderGame: GameModule = {
  id: 'storyOrder',
  title: '步驟排順序',
  subtitle: '想一想事情發生的因果先後順序，從第 1 步依序點到最後一步！',
  ageTier: 'junior',
  ageLabel: '低年級 6–8 歲',
  evidenceBadge: '時間因果序列推理',
  primaryAxis: 'strategicPlanning',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const rng = new SeededRng(config.seed);
    const storyOrder = rng.shuffle(Array.from({ length: STORIES.length }, (_, i) => i));
    let round = 0;
    let nextStep = 0;
    let shuffledSteps: { origIdx: number; icon: string; label: string }[] = [];
    const trials: TrialRecord[] = [];
    let lastTapMs = performance.now();
    let disposed = false;

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const visualTimer = new VisualTimer('排序進度');
    const storyHost = document.createElement('div');
    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(storyHost);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    function startRound(): void {
      if (disposed) return;
      if (round >= STORIES.length) {
        visualTimer.setProgress(1);
        audioGateway.playTone('complete');
        const metrics = computeSessionMetrics(trials);
        config.onSessionComplete({
          gameId: 'storyOrder',
          ageTier: 'junior',
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

      visualTimer.setProgress(round / STORIES.length);
      const story = STORIES[storyOrder[round]];
      shuffledSteps = rng.shuffle(story.steps.map((s, i) => ({ ...s, origIdx: i })));
      nextStep = 0;
      lastTapMs = performance.now();
      render();
    }

    function render(): void {
      if (disposed) return;
      const story = STORIES[storyOrder[round]];
      header.innerHTML = `
        <div class="stage-meta">
          <span class="badge">故事 ${round + 1} / ${STORIES.length}：${story.title}</span>
          <span class="badge">請點第 ${nextStep + 1} 步</span>
        </div>
      `;

      storyHost.innerHTML = `
        <div class="story-grid">
          ${shuffledSteps
            .map((s) => {
              const done = s.origIdx < nextStep;
              return `
              <button type="button" class="story-card ${done ? 'is-done' : ''}" data-orig="${s.origIdx}" ${done ? 'disabled' : ''}>
                <span class="story-icon">${s.icon}</span>
                <strong>${s.label}</strong>
                ${done ? `<span class="badge">第 ${s.origIdx + 1} 步</span>` : ''}
              </button>
            `;
            })
            .join('')}
        </div>
      `;

      storyHost.querySelectorAll<HTMLButtonElement>('.story-card').forEach((btn) => {
        btn.addEventListener('click', () => {
          audioGateway.unlock();
          const orig = Number(btn.dataset.orig);
          const rtMs = Math.round(performance.now() - lastTapMs);
          lastTapMs = performance.now();

          if (orig === nextStep) {
            audioGateway.playPentatonic(nextStep);
            trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
            nextStep += 1;
            statusLine.textContent = nextStep < 4 ? `沒錯！接下來第 ${nextStep + 1} 步是什麼？` : '順序排得太棒了！';
            render();
            if (nextStep >= 4) {
              round += 1;
              window.setTimeout(startRound, 500);
            }
          } else {
            audioGateway.playTone('gentle');
            trials.push({ isTarget: true, correct: false, rtMs, errorType: 'rule' });
            statusLine.textContent = `這不是第 ${nextStep + 1} 步喔，想一想哪件事必須先發生！`;
          }
        });
      });
    }

    if (config.showTutorial) {
      const svg = `<div style="font-size:0.95rem;font-weight:600;color:#0072B2;">先發生的放第 1 步，最後發生的放第 4 步！</div>`;
      const overlay = createTutorialOverlay('依照事件發生的先後順序依序點擊', svg, () => {
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
