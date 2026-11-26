/**
 * Gaussian Fuzzy Logic DDA Controller.
 * Smoothly modulates continuous parameters (e.g., stimulus window / ISI)
 * based on recent hit rate and false-alarm rate to preserve flow.
 */

function gaussian(x: number, mean: number, sigma: number): number {
  const z = (x - mean) / sigma;
  return Math.exp(-0.5 * z * z);
}

export interface FuzzyDdaInput {
  hitRate: number;        // 0..1
  falseAlarmRate: number; // 0..1
}

export class FuzzyDdaController {
  /**
   * Returns a normalized difficulty adjustment delta in [-1, +1]:
   * positive => increase challenge (shorter window / faster),
   * negative => ease challenge (longer window / gentler).
   */
  evaluateAdjustment(input: FuzzyDdaInput): number {
    const hit = Math.max(0, Math.min(1, input.hitRate));
    const fa = Math.max(0, Math.min(1, input.falseAlarmRate));

    // Membership degrees for hit rate
    const hitLow = gaussian(hit, 0.5, 0.18);
    const hitOptimal = gaussian(hit, 0.8, 0.12);
    const hitHigh = gaussian(hit, 0.96, 0.1);

    // Membership degrees for false-alarm rate
    const faLow = gaussian(fa, 0.05, 0.08);
    const faHigh = gaussian(fa, 0.35, 0.15);

    // Fuzzy rules (Sugeno zero-order defuzzification)
    const wEase = Math.max(hitLow, faHigh);
    const wHold = Math.min(hitOptimal, faLow);
    const wChallenge = Math.min(hitHigh, faLow);

    const totalWeight = wEase + wHold + wChallenge;
    if (totalWeight <= 1e-6) return 0;

    return (wEase * -1.0 + wHold * 0.0 + wChallenge * 1.0) / totalWeight;
  }
}
