/**
 * Psychophysical 2-up 1-down Staircase DDA Controller.
 * Keeps challenge oscillating smoothly around ~70.7% threshold without sudden jumps.
 */
export interface StaircaseOptions {
  initialLevel: number;
  minLevel: number;
  maxLevel: number;
  stepSize?: number;
}

export class StaircaseController {
  private level: number;
  private consecutiveCorrect = 0;
  private readonly minLevel: number;
  private readonly maxLevel: number;
  private readonly stepSize: number;

  constructor(opts: StaircaseOptions) {
    this.minLevel = opts.minLevel;
    this.maxLevel = opts.maxLevel;
    this.stepSize = opts.stepSize ?? 1;
    this.level = Math.max(this.minLevel, Math.min(this.maxLevel, opts.initialLevel));
  }

  get currentLevel(): number {
    return this.level;
  }

  /** Record a trial outcome and return the updated level */
  record(correct: boolean): number {
    if (correct) {
      this.consecutiveCorrect += 1;
      if (this.consecutiveCorrect >= 2) {
        this.level = Math.min(this.maxLevel, this.level + this.stepSize);
        this.consecutiveCorrect = 0;
      }
    } else {
      this.consecutiveCorrect = 0;
      this.level = Math.max(this.minLevel, this.level - this.stepSize);
    }
    return this.level;
  }
}
