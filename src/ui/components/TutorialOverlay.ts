/**
 * No-text animated interactive tutorial overlay for low reading barrier (especially 6-8yo).
 * Demonstrates the core gesture visually without requiring reading comprehension.
 */
export function createTutorialOverlay(
  title: string,
  visualSvg: string,
  onStart: () => void,
): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'tutorial-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', title);

  overlay.innerHTML = `
    <div class="tutorial-card">
      <div class="tutorial-visual">${visualSvg}</div>
      <p class="tutorial-caption">${title}</p>
      <button type="button" class="btn btn-primary btn-lg tutorial-start-btn">開始練習</button>
    </div>
  `;

  const btn = overlay.querySelector('.tutorial-start-btn') as HTMLButtonElement;
  btn.addEventListener('click', () => {
    overlay.remove();
    onStart();
  });

  return overlay;
}
