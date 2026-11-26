/**
 * Calibration weights for the Attention Stability Index (ASI).
 *
 * NOTE: These sensitivity weights (alpha for CV_RT, beta for half-session fatigue delta)
 * are engineering design parameters that MUST be calibrated against field-tested
 * elementary school age norms rather than treated as fixed universal constants.
 */
export interface AsiCalibration {
  alpha: number;
  beta: number;
}

export const DEFAULT_ASI_CALIBRATION: AsiCalibration = {
  alpha: 1.5,
  beta: 2.0,
};
