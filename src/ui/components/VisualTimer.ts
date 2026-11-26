/**
 * Calm Visual Timer (SVG progress bar without stressful ticking countdown numbers).
 * Reduces anticipatory anxiety while keeping progress perceptible.
 */
export class VisualTimer {
  private readonly el: HTMLDivElement;
  private readonly fill: HTMLDivElement;

  constructor(label = '練習進度') {
    this.el = document.createElement('div');
    this.el.className = 'visual-timer';
    this.el.setAttribute('role', 'progressbar');
    this.el.setAttribute('aria-label', label);
    this.el.setAttribute('aria-valuemin', '0');
    this.el.setAttribute('aria-valuemax', '100');
    this.el.setAttribute('aria-valuenow', '0');

    this.fill = document.createElement('div');
    this.fill.className = 'visual-timer-fill';
    this.el.appendChild(this.fill);
  }

  get element(): HTMLDivElement {
    return this.el;
  }

  setProgress(fraction: number): void {
    const clamped = Math.max(0, Math.min(1, fraction));
    const pct = Math.round(clamped * 100);
    this.fill.style.width = `${pct}%`;
    this.el.setAttribute('aria-valuenow', String(pct));
  }
}
