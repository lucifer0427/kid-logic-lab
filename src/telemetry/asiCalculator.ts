import { SessionMetrics, TrialRecord } from '../engine/types';
import { AsiCalibration, DEFAULT_ASI_CALIBRATION } from './calibration';

/**
 * Computes local cognitive telemetry metrics including:
 * - Mean RT, SD_RT, and CV_RT (only over valid, correct target trials)
 * - Commission errors (impulsive taps) and omission errors (missed targets)
 * - First-half vs second-half fatigue error delta
 * - Attention Stability Index (ASI, 0–100)
 */
export function computeSessionMetrics(
  trials: readonly TrialRecord[],
  calibration: AsiCalibration = DEFAULT_ASI_CALIBRATION,
): SessionMetrics {
  if (trials.length === 0) {
    return {
      meanRtMs: 0,
      sdRtMs: 0,
      cvRt: 0,
      accuracy: 0,
      commissionErrors: 0,
      omissionErrors: 0,
      fatigueDelta: 0,
      asi: 0,
    };
  }

  const validTargetRts: number[] = [];
  let correctCount = 0;
  let commissionErrors = 0;
  let omissionErrors = 0;

  const midpoint = Math.floor(trials.length / 2);
  let errHalf1 = 0;
  let errHalf2 = 0;
  const nHalf2 = Math.max(1, trials.length - midpoint);

  trials.forEach((t, idx) => {
    if (t.correct) {
      correctCount += 1;
      if (t.isTarget && t.rtMs !== null && t.rtMs > 0) {
        validTargetRts.push(t.rtMs);
      }
    } else {
      if (idx < midpoint) errHalf1 += 1;
      else errHalf2 += 1;

      if (t.errorType === 'commission') commissionErrors += 1;
      else if (t.errorType === 'omission') omissionErrors += 1;
    }
  });

  const accuracy = correctCount / trials.length;

  let meanRtMs = 0;
  let sdRtMs = 0;
  let cvRt = 0;

  if (validTargetRts.length > 0) {
    meanRtMs = validTargetRts.reduce((a, b) => a + b, 0) / validTargetRts.length;
    if (validTargetRts.length > 1 && meanRtMs > 0) {
      const variance =
        validTargetRts.reduce((acc, rt) => acc + (rt - meanRtMs) ** 2, 0) /
        validTargetRts.length;
      sdRtMs = Math.sqrt(variance);
      cvRt = sdRtMs / meanRtMs;
    }
  }

  const fatigueDelta = Math.max(0, errHalf2 - errHalf1) / nHalf2;
  const rawAsi =
    100 *
    accuracy *
    Math.exp(-(calibration.alpha * cvRt + calibration.beta * fatigueDelta));
  const asi = Math.max(0, Math.min(100, Math.round(rawAsi * 10) / 10));

  return {
    meanRtMs: Math.round(meanRtMs),
    sdRtMs: Math.round(sdRtMs),
    cvRt: Math.round(cvRt * 1000) / 1000,
    accuracy: Math.round(accuracy * 1000) / 1000,
    commissionErrors,
    omissionErrors,
    fatigueDelta: Math.round(fatigueDelta * 1000) / 1000,
    asi,
  };
}
