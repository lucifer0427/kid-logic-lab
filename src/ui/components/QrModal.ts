import qrcode from 'qrcode-generator';
import { escapeHtml } from '../escapeHtml';

export function showQrModal(url: string, title: string): void {
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  const svgTag = qr.createSvgTag({ cellSize: 5, margin: 2 });

  const overlay = document.createElement('div');
  overlay.className = 'tutorial-overlay qr-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', '分享 QR Code');

  overlay.innerHTML = `
    <div class="tutorial-card">
      <h3 style="margin:0;">分享 QR Code</h3>
      <p class="muted" style="margin:0;font-size:0.88rem;">${escapeHtml(title)}</p>
      <div class="qr-svg-wrap">${svgTag}</div>
      <input type="text" readonly class="qr-url-input" value="${escapeHtml(url)}" aria-label="分享連結" />
      <div style="display:flex;gap:8px;width:100%;justify-content:center;">
        <button type="button" class="btn btn-outline" id="qr-copy-btn">📋 複製連結</button>
        <button type="button" class="btn btn-primary" id="qr-close-btn">關閉</button>
      </div>
    </div>
  `;

  const copyBtn = overlay.querySelector('#qr-copy-btn') as HTMLButtonElement;
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
      copyBtn.textContent = '✓ 已複製';
    } catch {
      const input = overlay.querySelector('.qr-url-input') as HTMLInputElement;
      input.select();
    }
  });

  overlay.querySelector('#qr-close-btn')?.addEventListener('click', () => {
    overlay.remove();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
}
