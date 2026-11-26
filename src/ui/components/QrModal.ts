import qrcode from 'qrcode-generator';

export function showQrModal(url: string, title: string): void {
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  const svgTag = qr.createSvgTag({ cellSize: 5, margin: 2 });

  const overlay = document.createElement('div');
  overlay.className = 'tutorial-overlay qr-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', '課堂同題 QR Code');

  overlay.innerHTML = `
    <div class="tutorial-card">
      <h3 style="margin:0;">課堂同題 QR Code</h3>
      <p class="muted" style="margin:0;font-size:0.88rem;">${title}</p>
      <div class="qr-svg-wrap">${svgTag}</div>
      <input type="text" readonly class="qr-url-input" value="${url}" aria-label="分享連結" />
      <button type="button" class="btn btn-primary" id="qr-close-btn">關閉</button>
    </div>
  `;

  overlay.querySelector('#qr-close-btn')?.addEventListener('pointerdown', () => {
    overlay.remove();
  });
  overlay.addEventListener('pointerdown', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
}
