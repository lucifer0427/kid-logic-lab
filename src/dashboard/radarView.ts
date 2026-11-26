import { CognitiveAxis, SessionRecord } from '../engine/types';
import { getAllSessions, clearAllSessions } from '../storage/db';
import { exportSessionsJson, importSessionsJson } from '../storage/jsonBackup';

const AXES: { key: CognitiveAxis; label: string }[] = [
  { key: 'attentionStability', label: '專注穩定 (ASI)' },
  { key: 'impulseInhibition', label: '衝動抑制' },
  { key: 'workingMemory', label: '工作記憶' },
  { key: 'deductiveReasoning', label: '演繹推論' },
  { key: 'strategicPlanning', label: '策略規劃' },
];

function computeRadarAverages(sessions: SessionRecord[]): Record<CognitiveAxis, number> {
  const sums: Record<CognitiveAxis, number> = {
    attentionStability: 0,
    impulseInhibition: 0,
    workingMemory: 0,
    deductiveReasoning: 0,
    strategicPlanning: 0,
  };
  const counts: Record<CognitiveAxis, number> = {
    attentionStability: 0,
    impulseInhibition: 0,
    workingMemory: 0,
    deductiveReasoning: 0,
    strategicPlanning: 0,
  };

  for (const s of sessions) {
    for (const ax of AXES) {
      const val = s.axisScores[ax.key];
      if (typeof val === 'number') {
        sums[ax.key] += val;
        counts[ax.key] += 1;
      }
    }
  }

  const out = { ...sums };
  for (const ax of AXES) {
    out[ax.key] = counts[ax.key] > 0 ? Math.round(sums[ax.key] / counts[ax.key]) : 0;
  }
  return out;
}

function renderRadarSvg(scores: Record<CognitiveAxis, number>): string {
  const cx = 160;
  const cy = 150;
  const maxR = 95;
  const n = AXES.length;

  const pointAt = (idx: number, ratio: number): [number, number] => {
    const angle = -Math.PI / 2 + (idx * Math.PI * 2) / n;
    return [cx + Math.cos(angle) * maxR * ratio, cy + Math.sin(angle) * maxR * ratio];
  };

  const rings = [0.25, 0.5, 0.75, 1]
    .map((r) => {
      const pts = AXES.map((_, i) => pointAt(i, r).join(',')).join(' ');
      return `<polygon points="${pts}" fill="none" stroke="#CBD5E1" stroke-width="1"/>`;
    })
    .join('');

  const spokes = AXES.map((ax, i) => {
    const [x, y] = pointAt(i, 1);
    const [lx, ly] = pointAt(i, 1.24);
    return `
      <line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#CBD5E1" stroke-width="1"/>
      <text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" font-size="11" font-weight="600" fill="#1E293B">
        ${ax.label}
      </text>
    `;
  }).join('');

  const dataPts = AXES.map((ax, i) => pointAt(i, Math.max(0.08, scores[ax.key] / 100)).join(',')).join(' ');

  return `
    <svg viewBox="0 0 320 300" class="radar-svg" aria-label="五軸認知指標雷達圖">
      ${rings}
      ${spokes}
      <polygon points="${dataPts}" fill="rgba(0, 114, 178, 0.28)" stroke="#0072B2" stroke-width="2.5"/>
    </svg>
  `;
}

function renderTrendSvg(sessions: SessionRecord[]): string {
  const recent = [...sessions].slice(-15);
  if (recent.length < 2) {
    return '<p class="muted">累積至少 2 次練習後即可顯示 ASI 進步趨勢折線圖。</p>';
  }

  const w = 360;
  const h = 160;
  const padL = 32;
  const padR = 14;
  const padT = 16;
  const padB = 24;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  const toX = (i: number) => padL + (i / (recent.length - 1)) * innerW;
  const toY = (val: number) => padT + innerH - (Math.max(0, Math.min(100, val)) / 100) * innerH;

  const asiPts = recent.map((s, i) => `${toX(i).toFixed(1)},${toY(s.metrics.asi).toFixed(1)}`).join(' ');
  const accPts = recent.map((s, i) => `${toX(i).toFixed(1)},${toY(s.metrics.accuracy * 100).toFixed(1)}`).join(' ');

  const dots = recent
    .map(
      (s, i) =>
        `<circle cx="${toX(i).toFixed(1)}" cy="${toY(s.metrics.asi).toFixed(1)}" r="3.5" fill="#0072B2"/>`,
    )
    .join('');

  return `
    <svg viewBox="0 0 ${w} ${h}" class="trend-svg" aria-label="ASI 與正確率趨勢折線圖">
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + innerH}" stroke="#CBD5E1" stroke-width="1"/>
      <line x1="${padL}" y1="${padT + innerH}" x2="${padL + innerW}" y2="${padT + innerH}" stroke="#CBD5E1" stroke-width="1"/>
      <text x="4" y="${padT + 4}" font-size="10" fill="#64748B">100</text>
      <text x="10" y="${padT + innerH}" font-size="10" fill="#64748B">0</text>
      <polyline points="${accPts}" fill="none" stroke="#009E73" stroke-width="2" stroke-dasharray="4 3"/>
      <polyline points="${asiPts}" fill="none" stroke="#0072B2" stroke-width="2.5"/>
      ${dots}
    </svg>
    <div style="display:flex;gap:14px;justify-content:center;font-size:0.8rem;">
      <span style="color:#0072B2;font-weight:600;">● 專注穩定度 (ASI)</span>
      <span style="color:#009E73;font-weight:600;">┈ 正確率 (%)</span>
    </div>
  `;
}

export async function renderDashboard(container: HTMLElement, onBack: () => void): Promise<void> {
  const sessions = await getAllSessions();
  const sorted = [...sessions].sort((a, b) => b.timestamp - a.timestamp);
  const chronological = [...sessions].sort((a, b) => a.timestamp - b.timestamp);
  const averages = computeRadarAverages(sorted);

  const recentRows = sorted.slice(0, 10)
    .map((s) => {
      const dateStr = new Date(s.timestamp).toLocaleString('zh-TW', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
      return `
        <tr>
          <td>${dateStr}</td>
          <td>${s.gameId}</td>
          <td>Lv.${s.level}</td>
          <td>${s.metrics.asi}</td>
          <td>${Math.round(s.metrics.accuracy * 100)}%</td>
          <td>${s.metrics.cvRt}</td>
        </tr>
      `;
    })
    .join('');

  container.innerHTML = `
    <section class="dashboard-view">
      <div class="dashboard-header">
        <div>
          <h2>師長本地學習儀表板</h2>
          <p class="muted">所有資料僅儲存於本機 IndexedDB，零個資、零雲端傳輸。</p>
        </div>
        <button type="button" class="btn btn-outline" id="dash-back">返回遊戲</button>
      </div>

      <div class="dashboard-grid">
        <div class="card">
          <h3>五軸認知表現總覽（累積 ${sorted.length} 次）</h3>
          ${renderRadarSvg(averages)}
        </div>
        <div class="card">
          <h3>近期 ASI 與正確率趨勢（近 15 次）</h3>
          ${renderTrendSvg(chronological)}
        </div>
        <div class="card">
          <h3>單機資料備份與管理</h3>
          <p class="muted">支援將學習紀錄匯出為 JSON 檔，於其他裝置或平板匯入檢視。</p>
          <div class="backup-actions">
            <button type="button" class="btn btn-primary" id="btn-export">匯出 JSON 紀錄</button>
            <label class="btn btn-outline file-label">
              匯入 JSON 紀錄
              <input type="file" id="input-import" accept="application/json" hidden />
            </label>
            <button type="button" class="btn btn-outline" id="btn-clear">清除本機紀錄</button>
          </div>
          <p class="status-msg" id="dash-status"></p>
        </div>
      </div>

      <div class="card">
        <h3>近期練習明細</h3>
        ${
          sorted.length === 0
            ? '<p class="muted">尚無練習紀錄，完成一次遊戲後即可在此檢視 ASI 與反應變異指標。</p>'
            : `
          <div class="table-wrap">
            <table class="history-table">
              <thead>
                <tr>
                  <th>時間</th>
                  <th>遊戲</th>
                  <th>階梯</th>
                  <th>ASI 指數</th>
                  <th>正確率</th>
                  <th>CV_RT</th>
                </tr>
              </thead>
              <tbody>${recentRows}</tbody>
            </table>
          </div>`
        }
      </div>
    </section>
  `;

  container.querySelector('#dash-back')?.addEventListener('pointerdown', onBack);

  const statusEl = container.querySelector('#dash-status') as HTMLElement;

  container.querySelector('#btn-export')?.addEventListener('pointerdown', async () => {
    const json = await exportSessionsJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kid-logic-lab-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    statusEl.textContent = '已匯出 JSON 學習紀錄檔。';
  });

  container.querySelector('#input-import')?.addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const count = await importSessionsJson(text);
      statusEl.textContent = `成功匯入 ${count} 筆紀錄，重新整理畫面...`;
      await renderDashboard(container, onBack);
    } catch (err) {
      statusEl.textContent = err instanceof Error ? err.message : '匯入失敗';
    }
  });

  container.querySelector('#btn-clear')?.addEventListener('pointerdown', async () => {
    await clearAllSessions();
    await renderDashboard(container, onBack);
  });
}
