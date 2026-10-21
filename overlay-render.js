// Photo overlay output is ONLY a photoreal AI render. The three.js overlay is never shown on the photo: it is an invisible
// layout source for the render guide (plus optional measurement lines drawn by overlay3d.js). With no backend
// (window.YARDPLAN_RENDER_URL unset) users see a clean "coming soon" placeholder and can open a sample real render; no mock/tinted 3D.
// Classic globals used: state (app.js).
import { createRenderer, attachToOverlay } from './render/render.js';
import { walkText } from './siteplan/walkway.js';
// v21: the render prompt describes the walkway leaving the house (from the saved plan design)
const walkwayText = () => { try { const d = JSON.parse(localStorage.getItem('yardplan.design.v3')); const w = (d?.items || []).find(i => Array.isArray(i.line) && i.line.length >= 2); return w ? walkText(w, w.kind === 'dg' ? 'decomposed granite' : w.kind === 'gravel' ? 'gravel' : 'paver') : undefined; } catch { return undefined; } };
const API = window.YARDPLAN_RENDER_URL || '';
const unavailable = { async generate() { const e = new Error('Photoreal render service not connected'); e.code = 'no_service'; throw e; } };
function start() {
  if (!window.overlayApi) return setTimeout(start, 200);
  const hook = attachToOverlay(window.overlayApi, {
    renderer: API ? createRenderer({ apiBase: API }) : unavailable, stage: document.querySelector('#ovStage'), guide: true,
    sampleUrl: 'render/assets/sample-real-render.jpg',
    getDesign: () => ({ style: localStorage.getItem('yardplan.style') || undefined, zone: (typeof state !== 'undefined' && state.zoneLabel) || undefined, walkway: walkwayText() }),
  });
  window.renderHook = hook;
}
start();
