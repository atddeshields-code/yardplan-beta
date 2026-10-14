# Yardplan · Photoreal render (NOT DEPLOYED)

AI concept render of the user's yard photo with the current design. It is the **default output of the photo overlay**. The three.js 3D overlay stays as the "To-scale 3D" toggle and is the automatic fallback. The original app in `/workspace/yardplan` was not modified.

## Files
| File | What |
|---|---|
| `research.md` | API comparison + recommendation (primary **xAI Grok Imagine 2.0 edit ≈ $0.05**, fallback **FLUX Kontext pro on fal $0.04**) |
| `catalog.js` / `build-catalog.mjs` | Plant catalog + 9 styles generated from the app's `data.js` (re-run `npm run catalog` after catalog edits) |
| `prompt.js` | `buildRenderPrompt(design, opts)` |
| `render.js` | `createRenderer`, `attachToOverlay`, guide image, projection, cache |
| `demo.html` | Standalone demo (mock by default; `?api=https://…` for a real Worker) |
| `worker/` | Cloudflare Worker `POST /api/render` + adapters + `wrangler.toml.sample` |
| `walkaround/` | Phase 2A: walk-around + 360° panorama prototype (mock) |
| `splats.md` | Phase 2B: Gaussian-splat research |
| `assets/` | `yard-before.jpg`, `sample-render.jpg` (mock result), demo screenshots |
| `test/` | `npm test` (node --test, offline) |

Run the demo: `cd /workspace/yardplan-render && python3 -m http.server 8080`, then open `http://localhost:8080/demo.html` and `…/walkaround/index.html`.

## HTTP API
`POST /api/render` (JSON, Origin must be in `ALLOWED_ORIGINS`)
```json
{ "image": "data:image/jpeg;base64,… | R2 key", "params": { "design": {…}, "opts": { "view": "ground" } } | "prompt": "raw prompt",
  "guide": "data:image/png;base64,… (optional layout guide)", "reference": "data URL (optional style reference)", "mask": "data URL (optional)",
  "provider": "xai | fal-kontext (optional; default chain PROVIDERS)", "aspect": "3:4" }
```
200 → `{ "imageUrl" | "dataURL", "provider", "prompt", "warnings", "costEstimateUSD", "createdAt" }`
Errors: 400 `invalid_body | missing_image | invalid_image | unsupported_image_type | image_too_large | missing_params_or_prompt | invalid_provider | prompt_too_long`, 403 `origin_not_allowed`, 404 `image_not_found`, 413, 429 `rate_limited | daily_ip_limit` (+Retry-After), 502 `all_providers_failed` (+per-provider errors), 503 `daily_budget_exhausted`.
Limits: JPEG/PNG/WebP, 8 MB per image, 4 renders/min and 30/day per IP, `DAILY_BUDGET_USD` (default $2) reserved before each provider call and refunded on failure. KV is eventually consistent, so the limits are best-effort (same as backend/). Use a Durable Object for exact limits. If the primary fails (5xx/429/missing key) the Worker tries the fallback. The prompt is built **server-side** from `params`, so clients can't inject arbitrary prompts unless they send `prompt`. Keys are only Worker secrets (`XAI_API_KEY`, `FAL_KEY`).

## JS API
```js
import { createRenderer, attachToOverlay } from './render.js';
const renderer = createRenderer({ apiBase: window.YARDPLAN_RENDER_URL || '', mock: !window.YARDPLAN_RENDER_URL, sampleUrl: null });
const res = await renderer.generate({ image, design, opts: { view: 'ground'|'drone'|'top', aspect: '3:4' }, guide, reference, onProgress });
```
`design = { style, zone, region:'high-desert', plants:[id|{id,count}], hardscape:['pavers','dg','riverrock','boulders','edging','mulch','gravel','wall'], layout:[{id,x,y}] }`.
Results are cached per (photo hash, design+opts hash), and identical in-flight calls are deduplicated. Mock mode (or no `apiBase`) returns `sampleUrl` or a canvas-tinted copy of the photo, costs $0 and makes no network calls.

### Overlay integration (photoreal by default)
```html
<script>window.YARDPLAN_RENDER_URL = 'https://yardplan-render.<acct>.workers.dev';</script>
<script type="module">
  import { createRenderer, attachToOverlay } from './render/render.js';
  const r = createRenderer({ apiBase: window.YARDPLAN_RENDER_URL });
  const hook = attachToOverlay(window.overlayApi, {
    renderer: r, stage: document.querySelector('#ovStage'),
    getDesign: () => ({ style: localStorage.getItem('yardplan.style') || 'xeriscape', zone: window.state?.zoneLabel, region: 'high-desert', hardscape: ['pavers','boulders','mulch'] }),
    viewHint: undefined,   // 'ground' | 'drone' | 'top' to override detection
    debounceMs: 1500,
  });
</script>
```
What it does: every 1 s it compares a signature (photo size, view, plant positions/types). After a change it waits 1.5 s, then captures the clean photo with `overlayApi.captureBeforeAfter()`, projects each placed plant to image fractions (same camera maths as `overlay3d.js`) for **text layout hints**, and draws a **guide image** (a colored disc per plant: tree, shrub, perennial, grass, groundcover; plan circles in top view). It sends both, then shows the render over the stage with the always-visible **"AI concept image, not to scale"** label and a **Photoreal / To-scale 3D** toggle. With no backend, offline, or on any error it switches to the 3D overlay and shows a status such as "You are offline. Showing the to-scale 3D overlay instead." Top-down views get plan-view prompting (directly above, canopy circles, no perspective change). Ground, drone and street views keep their perspective. `hook.refresh(true)` forces a re-render. `hook.destroy()` removes it.

## Snippet for Boss Bot
```
Photoreal render (Yardplan): /workspace/yardplan-render
- Front end: import { createRenderer, attachToOverlay } from 'render.js'; attachToOverlay(window.overlayApi, { renderer: createRenderer({ apiBase }), stage: #ovStage, getDesign }).
- Backend: worker/ (Cloudflare). POST /api/render {image, params:{design,opts}, guide?, reference?} -> {imageUrl|dataURL, provider, prompt, costEstimateUSD, createdAt}.
- Providers (default, paid): `PROVIDERS="xai,fal-kontext"`: xai (primary, ~$0.05/edit) -> fal-kontext ($0.04). Free adapters (cf-img2img, hf-space, pollinations) are **off** unless `ALLOW_FREE="true"` and `free` is added to PROVIDERS. Secrets XAI_API_KEY, FAL_KEY. KV RENDER_KV. Optional R2 IMAGES.
- Not deployed. Needs Austin to create accounts/keys. Tests: cd /workspace/yardplan-render && npm test (offline).
```

## To turn it on (Austin, later)
1. Create an xAI API key (console.x.ai, prepaid credits) and optionally a fal.ai key.
2. `cd worker && cp wrangler.toml.sample wrangler.toml`, then `wrangler kv namespace create RENDER_KV` and paste the id. Set `ALLOWED_ORIGINS`.
3. `wrangler secret put XAI_API_KEY` (and `FAL_KEY`), then `wrangler deploy`.
4. Spot-check that the output has the same aspect ratio as the input, especially portrait phone photos. Check that the xAI request fields `aspect_ratio`/`resolution`/`quality`/`images` match the live API; they are marked [UNVERIFIED] in `adapters.js`.

## Walk-around / 360 (phase 2A)
`walkaround/walkaround.js`: `pickFrames`, `validateSet` (6–12 photos), `extractVideoFrames(video, n)` (browser video+canvas), `renderSequence(renderer, frames, design, {seed, equirect})` (shared seed, and render #1 is sent as `reference` to later frames; reference images work on xAI (≤5), OpenAI, Gemini, and Kontext multi variants, but **not** single-image Kontext pro, where the Worker drops them), `viewState` (crossfade), `createWalkViewer`, `createPanoViewer` (three.js sphere), `blendSeam`/`seamDelta` for the equirect wrap. Server-side frame extraction: `ffmpeg -i walk.mp4 -vf "fps=2,scale='min(1600,iw)':-2" -q:v 3 frames/%03d.jpg` then pick 6–12 with `pickFrames`. Panoramas: input must be 2:1. The prompt asks for equirectangular output, and the client blends the seam band afterwards. Providers that can't output 2:1 need the pano split into overlapping tiles (not built).
