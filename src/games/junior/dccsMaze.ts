import { GameLaunchConfig, GameModule, TrialRecord } from '../../engine/types';
import { SeededRng } from '../../worker/prng';
import { OKABE_ITO_PALETTE, renderTokenSvg } from '../../ui/theme/okabeIto';
import { audioGateway } from '../../ui/audio/unlock';
import { VisualTimer } from '../../ui/components/VisualTimer';
import { createTutorialOverlay } from '../../ui/components/TutorialOverlay';
import { computeSessionMetrics } from '../../telemetry/asiCalculator';

type RuleDimension = 'color' | 'shape';
const TOTAL_TRIALS = 16;

export const dccsMazeGame: GameModule = {
  id: 'dccsMaze',
  title: '雙屬性規則切換',
  subtitle: '注意上方指示卡：「依顏色」或「依形狀」把卡片送到正確的出口',
  ageTier: 'junior',
  ageLabel: '低年級 6–8 歲',
  evidenceBadge: '範式實證延伸（DCCS 規則切換）',
  primaryAxis: 'impulseInhibition',

  mount(container: HTMLElement, config: GameLaunchConfig): () => void {
    const rng = new SeededRng(config.seed);
    const trials: TrialRecord[] = [];
    let currentIdx = 0;
    let disposed = false;
    let rule: RuleDimension = 'color';
    let stimulusColorIdx = 0;
    let stimulusShapeIdx = 0;
    let trialStartMs = performance.now();

    // Two sorting bins:
    // Bin 0: Orange Circle (color=0, shape=0)
    // Bin 1: SkyBlue Square (color=1, shape=1)
    const binTokens = [OKABE_ITO_PALETTE[0], OKABE_ITO_PALETTE[1]];

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'game-stage';

    const header = document.createElement('div');
    header.className = 'stage-header';
    const visualTimer = new VisualTimer('分類進度');
    const ruleBanner = document.createElement('div');
    ruleBanner.className = 'dccs-rule-banner';
    const stimulusHost = document.createElement('div');
    stimulusHost.className = 'dccs-stimulus-host';
    const binsHost = document.createElement('div');
    binsHost.className = 'dccs-bins';
    const statusLine = document.createElement('div');
    statusLine.className = 'stage-status';

    wrapper.appendChild(header);
    wrapper.appendChild(visualTimer.element);
    wrapper.appendChild(ruleBanner);
    wrapper.appendChild(stimulusHost);
    wrapper.appendChild(binsHost);
    wrapper.appendChild(statusLine);
    container.appendChild(wrapper);

    function nextTrial(): void {
      if (disposed) return;
      if (currentIdx >= TOTAL_TRIALS) {
        visualTimer.setProgress(1);
        audioGateway.playTone('complete');
        const metrics = computeSessionMetrics(trials);
        config.onSessionComplete({
          gameId: 'dccsMaze',
          ageTier: 'junior',
          seed: config.seed,
          level: config.level,
          metrics,
          axisScores: {
            attentionStability: metrics.asi,
            impulseInhibition: Math.round(metrics.accuracy * 100),
          },
        });
        return;
      }

      visualTimer.setProgress(currentIdx / TOTAL_TRIALS);

      // Switch dimension every 4 trials (or every 3 trials at higher levels)
      const switchInterval = config.level >= 2 ? 3 : 4;
      if (currentIdx > 0 && currentIdx % switchInterval === 0) {
        rule = rule === 'color' ? 'shape' : 'color';
      }

      // Cross-pair color and shape to create true dimensional conflict
      stimulusColorIdx = rng.int(0, 1);
      stimulusShapeIdx = rng.int(0, 1);

      const stimToken = {
        ...OKABE_ITO_PALETTE[stimulusColorIdx],
        shape: OKABE_ITO_PALETTE[stimulusShapeIdx].shape,
      };

      header.innerHTML = `
        <div class="stage-meta">
          <span class="badge">種子 #${config.seed}</span>
          <span class="badge">第 ${currentIdx + 1} / ${TOTAL_TRIALS} 題</span>
        </div>
      `;

      ruleBanner.innerHTML =
        rule === 'color'
          ? '<span class="rule-pill rule-color">現在規則：依【顏色】分類</span>'
          : '<span class="rule-pill rule-shape">現在規則：依【形狀】分類</span>';

      stimulusHost.innerHTML = renderTokenSvg(stimToken, 88);

      binsHost.innerHTML = binTokens
        .map(
          (tok, idx) => `
          <button type="button" class="btn btn-outline dccs-bin-btn" data-bin="${idx}">
            ${renderTokenSvg(tok, 48)}
            <span>${tok.nameZh}</span>
          </button>
        `,
        )
        .join('');

      binsHost.querySelectorAll<HTMLButtonElement>('.dccs-bin-btn').forEach((btn) => {
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          handlePick(Number(btn.dataset.bin));
        });
      });

      awaiting = true;
      trialStartMs = performance.now();
    }

    let awaiting = false;

    function handlePick(binIdx: number): void {
      if (disposed || !awaiting) return;
      awaiting = false;
      audioGateway.unlock();
      const rtMs = Math.round(performance.now() - trialStartMs);
      const expectedBin = rule === 'color' ? stimulusColorIdx : stimulusShapeIdx;
      const correct = binIdx === expectedBin;

      if (correct) {
        audioGateway.playTone('success');
        trials.push({ isTarget: true, correct: true, rtMs, errorType: 'none' });
        statusLine.textContent = '分類正確！';
      } else {
        audioGateway.playTone('gentle');
        trials.push({ isTarget: true, correct: false, rtMs, errorType: 'rule' });
        statusLine.textContent =
          rule === 'color' ? '注意看現在是依【顏色】分類喔！' : '注意看現在是依【形狀】分類喔！';
      }

      currentIdx += 1;
      window.setTimeout(nextTrial, 280);
    }

    if (config.showTutorial) {
      const svg = `<div style="display:flex;gap:12px;align-items:center;">${renderTokenSvg(binTokens[0], 42)}${renderTokenSvg(binTokens[1], 42)}</div>`;
      const overlay = createTutorialOverlay('看清楚上方規則是「顏色」還是「形狀」再選出口', svg, () => {
        audioGateway.unlock();
        nextTrial();
      });
      wrapper.appendChild(overlay);
    } else {
      nextTrial();
    }

    return () => {
      disposed = true;
    };
  },
};
