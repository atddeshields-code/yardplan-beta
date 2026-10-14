# Free-spin photoreal view via Gaussian splatting: research notes (phase 2B)

Written 2026-10-13. Nothing here was signed up for or run. Claims I couldn't check on a primary page today are marked [UNVERIFIED].

## Idea
Capture a walk-around (photos or video) of the real yard, AI-render each frame into the new design, then train a 3D Gaussian splat (3DGS) from the rendered frames so the user can spin freely in the browser.

## The core problem: AI-edited frames aren't multi-view consistent
3DGS assumes every pixel sees the same static 3D scene. Per-frame image edits don't share one scene: a lavender clump moves, changes count or color, and a boulder appears in view 3 but not view 5. Training averages the conflicts, so plants come out as **blurry, translucent "floaters"** while the unchanged house and fence stay sharp. Expect this even with a shared seed and a style reference. Reference images keep the *style* consistent, not the *geometry*.

Mitigations, most to least effective:
1. **Edit in 3D, not per frame.** Build the splat from the *original* photos (the real yard stays consistent), then insert plants as 3D assets (the app's GLB models) or as small per-plant splats placed from the Yardplan design. Use AI only for texture/lighting harmonisation of a few hero views. This is the only approach that is properly consistent.
2. **Iterative dataset update** (Instruct-NeRF2NeRF / Instruct-GS2GS idea): train on the originals, then repeatedly re-render a view from the splat, AI-edit it with a low-strength edit, put it back, and continue training, so the edits converge on one 3D answer. Costs many edits (hundreds of calls; at about $0.05 each that's $10–50 per scene) and hours of GPU time.
3. **Geometry-locked editing:** condition every frame's edit on depth/normal renders from the splat of the original (ControlNet depth, SDXL/FLUX + depth) plus a projected layout guide (the same guide image render.js makes). That cuts disagreement a lot but not completely.
4. **Fewer, wider frames + view-dependent fallbacks:** 6–12 frames with large overlap, mask out the changed regions and give them low training weight, accept a blurrier "bloom".
5. **Don't splat; interpolate:** the phase 2A crossfade viewer (built here) or video interpolation between rendered neighbor views (e.g. a video model taking the first and last frames) gives a convincing "walk" without claiming 3D accuracy.

## Services
| | What it does | API / cost | Fit |
|---|---|---|---|
| **Luma AI** | Pioneered phone capture to NeRF/splat. The company has since focused on Dream Machine video. | A capture API existed (about $1 per capture) but its current status is [UNVERIFIED]. | Possible but risky to depend on. |
| **Polycam** | Phone capture, Gaussian splats, export .ply/.splat. | No public splat-training API that I could confirm [UNVERIFIED]. Paid plans for exports. | Good for Austin to make test captures by hand. |
| **KIRI Engine** | Photo/video to 3DGS, has a developer API. | Paid API credits, roughly cents to a few dollars per scene [UNVERIFIED]. | The most realistic hosted API to try. |
| **Open source: gsplat / nerfstudio Splatfacto** | Training on your own GPU after COLMAP/GLOMAP camera poses. | Free software. About 10–30 min on one consumer/cloud GPU (A10/4090) per scene, roughly $0.2–1 of rental [UNVERIFIED]. | Best control. Needs a GPU worker, not a Cloudflare Worker. |

Camera poses: COLMAP on 6–12 AI-edited frames often **fails or misregisters**, because the edits change the feature matches. So estimate poses on the **original** frames and reuse them for the rendered frames (same intrinsics and framing, which is another reason the edit must keep the camera exactly).

## In-browser viewers
- **gsplat.js** (Hugging Face): simple, MIT, WebGL.
- **@mkkellogg/gaussian-splats-3d**: three.js-based, mature, sorts on a web worker, loads .ply/.splat/.ksplat. **Best fit for Yardplan (already three.js).**
- **Spark** (sparkjsdev, three.js): newer, renders splats mixed with normal three.js meshes, so you could show splat terrain plus GLB plants. Worth a spike.
Mobile performance: keep scenes under about 1–2 M splats and use compressed .ksplat/.spz [UNVERIFIED limits].

## Feasibility, cost, latency (per yard)
- Capture: 30–60 s of video, or 6–12 photos.
- Per-frame AI renders: 8–12 × $0.05 = **$0.40–0.60**, about 1–2 min.
- Splat training on a GPU worker: **10–30 min, about $0.2–1** [UNVERIFIED]. Hosted (KIRI) is similar or slower.
- Result quality with naive per-frame edits: **poor for the plants**. With option 1 (real splat + 3D plant assets): **good, and to scale**.

## Recommendation
Ship 2A (per-view renders + crossfade viewer + 360 pano sphere) first. For free spin, prototype **option 1**: splat the *unedited* yard with nerfstudio/gsplat, show it with @mkkellogg/gaussian-splats-3d or Spark, and place the design's GLB plants in it at true scale. That also fits the "to-scale" promise. Treat AI-edited splats (option 2/3) as research.
