import { SessionRecord } from '../engine/types';
import { getAllSessions, saveSession } from './db';
import { EngagementState, loadEngagement, saveEngagement } from './engagement';
import { UserPrefs, loadPrefs, savePrefs } from './prefs';

export interface LearningBackupV1 {
  schema: 'kid-logic-lab-backup-v1';
  exportedAt: number;
  sessions: SessionRecord[];
  engagement?: EngagementState;
  prefs?: UserPrefs;
}

export async function exportSessionsJson(): Promise<string> {
  const sessions = await getAllSessions();
  const payload: LearningBackupV1 = {
    schema: 'kid-logic-lab-backup-v1',
    exportedAt: Date.now(),
    sessions,
    engagement: loadEngagement(),
    prefs: loadPrefs(),
  };
  return JSON.stringify(payload, null, 2);
}

export async function importSessionsJson(jsonText: string): Promise<number> {
  const parsed = JSON.parse(jsonText) as Partial<LearningBackupV1>;
  if (parsed.schema !== 'kid-logic-lab-backup-v1' || !Array.isArray(parsed.sessions)) {
    throw new Error('無效的學習紀錄備份檔格式');
  }
  let imported = 0;
  for (const s of parsed.sessions) {
    if (s && typeof s.id === 'string' && typeof s.timestamp === 'number' && s.metrics) {
      await saveSession(s);
      imported += 1;
    }
  }
  if (parsed.engagement && Array.isArray(parsed.engagement.unlockedBadges)) {
    saveEngagement(parsed.engagement);
  }
  if (parsed.prefs && parsed.prefs.levels) {
    savePrefs(parsed.prefs);
  }
  return imported;
}
