// Photo overlay output is ONLY a photoreal AI render. The three.js overlay is never shown on the photo: it is an invisible
// layout source for the render guide (plus optional measurement lines drawn by overlay3d.js). With no backend
// (window.YARDPLAN_RENDER_URL unset) users see a clean "coming soon" placeholder and can open a sample real render; no mock/tinted 3D.
// Classic globals used: state (app.js).
import { createRenderer, attachToOverlay } from './render/render.js';
const API = window.YARDPLAN_RENDER_URL || '';
const unavailable = { async generate() { const e = new Error('Photoreal render service not connected'); e.code = 'no_service'; throw e; } };
function start() {
  if (!window.overlayApi) return setTimeout(start, 200);
  const hook = attachToOverlay(window.overlayApi, {
    renderer: API ? createRenderer({ apiBase: API }) : unavailable, stage: document.querySelector('#ovStage'), guide: true,
    sampleUrl: 'render/assets/sample-real-render.jpg',
    getDesign: () => ({ style: localStorage.getItem('yardplan.style') || undefined, zone: (typeof state !== 'undefined' && state.zoneLabel) || undefined }),
  });
  window.renderHook = hook;
}
start();
