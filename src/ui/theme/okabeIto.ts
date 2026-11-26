/**
 * Okabe-Ito colorblind-safe palette (Wong, 2011)
 * Paired with redundant geometric shapes so colorblind learners can 100% distinguish stimuli.
 */
export type ShapeKind = 'circle' | 'square' | 'triangle' | 'diamond' | 'star' | 'hexagon';

export interface OkabeItoToken {
  id: string;
  nameZh: string;
  hex: string;
  shape: ShapeKind;
}

export const OKABE_ITO_PALETTE: readonly OkabeItoToken[] = [
  { id: 'orange', nameZh: '橘色圓形', hex: '#E69F00', shape: 'circle' },
  { id: 'skyblue', nameZh: '天藍方形', hex: '#56B4E9', shape: 'square' },
  { id: 'bluishGreen', nameZh: '藍綠三角', hex: '#009E73', shape: 'triangle' },
  { id: 'blue', nameZh: '深藍菱形', hex: '#0072B2', shape: 'diamond' },
  { id: 'vermilion', nameZh: '朱紅星形', hex: '#D55E00', shape: 'star' },
  { id: 'reddishPurple', nameZh: '紅紫六邊', hex: '#CC79A7', shape: 'hexagon' },
] as const;

export const OKABE_ITO_YELLOW = '#F0E442';
export const OKABE_ITO_BLACK = '#000000';

/** Draw an Okabe-Ito token onto a 2D Canvas with redundant shape encoding */
export function drawTokenOnCanvas(
  ctx: CanvasRenderingContext2D,
  token: OkabeItoToken,
  cx: number,
  cy: number,
  radius: number,
): void {
  ctx.save();
  ctx.fillStyle = token.hex;
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = Math.max(2, radius * 0.06);
  ctx.beginPath();

  switch (token.shape) {
    case 'circle':
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      break;
    case 'square': {
      const s = radius * 1.65;
      ctx.roundRect(cx - s / 2, cy - s / 2, s, s, radius * 0.2);
      break;
    }
    case 'triangle': {
      for (let i = 0; i < 3; i++) {
        const angle = -Math.PI / 2 + (i * Math.PI * 2) / 3;
        const x = cx + Math.cos(angle) * radius * 1.1;
        const y = cy + Math.sin(angle) * radius * 1.1;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      break;
    }
    case 'diamond': {
      ctx.moveTo(cx, cy - radius * 1.15);
      ctx.lineTo(cx + radius * 1.05, cy);
      ctx.lineTo(cx, cy + radius * 1.15);
      ctx.lineTo(cx - radius * 1.05, cy);
      ctx.closePath();
      break;
    }
    case 'star': {
      const spikes = 5;
      const outer = radius * 1.15;
      const inner = radius * 0.52;
      for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const angle = -Math.PI / 2 + (i * Math.PI) / spikes;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      break;
    }
    case 'hexagon': {
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI) / 3;
        const x = cx + Math.cos(angle) * radius * 1.05;
        const y = cy + Math.sin(angle) * radius * 1.05;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      break;
    }
  }

  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Render an Okabe-Ito token as an inline SVG string for DOM/SVG grid games */
export function renderTokenSvg(token: OkabeItoToken, size = 36): string {
  const c = size / 2;
  const r = size * 0.36;
  let shapeEl = '';

  switch (token.shape) {
    case 'circle':
      shapeEl = `<circle cx="${c}" cy="${c}" r="${r}" fill="${token.hex}" stroke="#0F172A" stroke-width="2"/>`;
      break;
    case 'square': {
      const s = r * 1.65;
      shapeEl = `<rect x="${c - s / 2}" y="${c - s / 2}" width="${s}" height="${s}" rx="${r * 0.2}" fill="${token.hex}" stroke="#0F172A" stroke-width="2"/>`;
      break;
    }
    case 'triangle': {
      const pts = [0, 1, 2]
        .map((i) => {
          const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
          return `${(c + Math.cos(a) * r * 1.1).toFixed(1)},${(c + Math.sin(a) * r * 1.1).toFixed(1)}`;
        })
        .join(' ');
      shapeEl = `<polygon points="${pts}" fill="${token.hex}" stroke="#0F172A" stroke-width="2"/>`;
      break;
    }
    case 'diamond': {
      const pts = `${c},${c - r * 1.15} ${c + r * 1.05},${c} ${c},${c + r * 1.15} ${c - r * 1.05},${c}`;
      shapeEl = `<polygon points="${pts}" fill="${token.hex}" stroke="#0F172A" stroke-width="2"/>`;
      break;
    }
    case 'star': {
      const pts = Array.from({ length: 10 }, (_, i) => {
        const rad = i % 2 === 0 ? r * 1.15 : r * 0.52;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        return `${(c + Math.cos(a) * rad).toFixed(1)},${(c + Math.sin(a) * rad).toFixed(1)}`;
      }).join(' ');
      shapeEl = `<polygon points="${pts}" fill="${token.hex}" stroke="#0F172A" stroke-width="2"/>`;
      break;
    }
    case 'hexagon': {
      const pts = Array.from({ length: 6 }, (_, i) => {
        const a = (i * Math.PI) / 3;
        return `${(c + Math.cos(a) * r * 1.05).toFixed(1)},${(c + Math.sin(a) * r * 1.05).toFixed(1)}`;
      }).join(' ');
      shapeEl = `<polygon points="${pts}" fill="${token.hex}" stroke="#0F172A" stroke-width="2"/>`;
      break;
    }
  }

  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">${shapeEl}</svg>`;
}
