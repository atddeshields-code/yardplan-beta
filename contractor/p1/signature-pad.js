// signature-pad.js — minimal dependency-free canvas signature pad (pointer events, HiDPI aware).
export function createSignaturePad(canvas, { penColor = '#111', width = 2.2 } = {}) {
  const ctx = canvas.getContext('2d'); let drawing = false, last = null, strokes = 0;
  function fit() { const r = canvas.getBoundingClientRect(), d = window.devicePixelRatio || 1; canvas.width = Math.max(1, r.width * d); canvas.height = Math.max(1, r.height * d);
    ctx.setTransform(d, 0, 0, d, 0, 0); clear(); }
  function clear() { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.restore(); strokes = 0; }
  const pt = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', e => { drawing = true; last = pt(e); canvas.setPointerCapture(e.pointerId); strokes++; ctx.beginPath(); ctx.arc(last.x, last.y, width / 2, 0, 7); ctx.fillStyle = penColor; ctx.fill(); });
  canvas.addEventListener('pointermove', e => { if (!drawing) return; const p = pt(e); ctx.strokeStyle = penColor; ctx.lineWidth = width; ctx.lineCap = ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; });
  const end = () => { drawing = false; }; canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  fit();
  return { clear, isEmpty: () => strokes === 0, toDataURL: () => canvas.toDataURL('image/png'), resize: fit };
}
