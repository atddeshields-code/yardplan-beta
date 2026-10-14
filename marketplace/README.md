# Yardplan marketplace — "Hire a pro"

Cloudflare Worker + KV with plain ES modules and no build step. Run the tests with `node --test marketplace/tests/`, which is also part of the root `npm test`.
To try it locally, run `node marketplace/tools/dev-server.mjs` and open http://localhost:8788/marketplace/demo.html. The dev server uses in-memory KV, has no Stripe key, and the admin token is `dev-admin`. To check it in a browser, run `tools/browser-smoke.mjs` (it needs playwright-core and Chrome).

## Pricing (worker/src/config.js `DEFAULT_PRICING`; override the whole object or parts of it via env `PRICING_JSON`)
- Subscription: $99/mo or $990/yr.
- Exclusive lead fee by estimate tier: under $5k $45; $5–15k $95; $15–40k $175; over $40k $295. Non-subscribers pay 1.5x.
- `leadMode:'exclusive'` sends each lead to 1 pro. In `'shared'` mode up to `sharedMaxPros` (2) pros get the lead at `sharedPriceMult` (0.5). The hard cap is `maxProsPerLead` (3).
- Pros are charged when they **accept** a lead, never when it is offered. There is no success fee.
- Credits are refunded automatically for `bad_contact`, `duplicate` (same contact sent to the same pro within 30 days), `out_of_area` (distance recomputed), and `no_response` (72h after accept with no homeowner message).
- Payments use Stripe Checkout only (credit packs or subscription), in TEST MODE. `sk_live_` keys are refused unless `ALLOW_LIVE=true`. Webhooks are checked with v1 HMAC (300s tolerance) and are idempotent per event id.

## Matching (worker/src/logic.js)
1. The pro offers the service and the job ZIP falls within the pro's radius of a service ZIP (Census ZCTA centroids, haversine).
2. The pro's license covers the job state (`licenseCovers`, rules in `data/license-rules.js`, re-exported by `worker/src/config.js`):
   - **Verified state rule** (`verified:true`, confirmed on an official board/statute page): same as before. `licenseRequired:true` means a license in `classCodes`, not expired, with a monetary limit ≥ the estimate. `false`/`'local'` means a state match is enough.
   - **Service-aware coverage:** each lead service maps to a category (`SERVICE_CATEGORY`: planting, irrigation, hardscape, walls, lighting, grading; design and maintenance need no class). Every category needs a pro class whose `classScopes` entry covers it, within that class's `limits` compared with `lead.scope` (`maxWallHeightFt`, `patioSqFt`, `walkwaySqFt`, `lightingVolts`). `lead.scope` comes from `body.scope` or `package.scope`, or is derived from `package.design.items`. Examples: an OR CCB license covers hardscape and walls but not planting or irrigation (that needs LCB). NV C-10 is limited to walls up to 3 ft, patios up to 400 sq ft, walkways up to 200 sq ft and lighting up to 24 V. A category no class covers (e.g. LA hardscape) goes to `needs_review`. Below `licenseRequiredFromUsd` (NC $30k, TN $25k, VA $1k) the state match is enough. The public listing (no lead) uses the class-in-state check only.
   - **Unverified rule or unknown state:** never auto-covered. The result is `needs_review` until an admin sets the per-state flag with `POST /api/admin/pros/:id/license-check {state, ok:true|false, note, evidence}` (stored in `pro.adminLicenseChecks[state]` and cleared when licenses are edited). Leads in these states carry `licenseReview:{status:'needs_review'}`.
3. Results are sorted with verified pros first, then by rating, then by distance, and capped by the mode.
Rejected pros are returned with a reason, so admins can see why a pro was not matched.

## License rules (`data/license-rules.js`)
There is one entry for each of the 50 states plus DC: `{licenseRequired: true|false|'local', licenseRequiredFromUsd?, classCodes[], classScopes{code: {services[], limits?}}, unlicensedServices[], className, threshold{usd, covers}, board, boardUrl, lookupUrl ('{license}' = deep-link template), localLicensing, sources[{url, checkedDate}], verified, notes}`. Researched 2026-10-13. Verified (14): AZ, CA, LA, MA, MD, NC, NJ, NV, OR, PA, TN, UT, VA, WA. Every other state is `verified:false` and needs an admin license check. Before you mark a state verified, confirm it on the board's own page and add the source. Not legal advice.
The admin UI (`admin.html`) shows each pro's per-state rule, threshold, board and rule links, and coverage status, with "license OK" / "deny" buttons for unverified states.

## Public visibility
`GET /api/pros` (directory) and `GET /api/pros/:id` (profile) show a pro only if `publiclyListable(pro)` is true. That means the pro is active, its verification is `verified`, and `licenseCovers` (the same check matching uses) passes for every state of its service ZIPs, plus the searched ZIP's state. This includes the admin license-check flag for unverified states. Pending, unverified, rejected, suspended, unlicensed, wrong-class, expired and out-of-state pros get a plain 404 `not_found`. They stay visible to admins (`/api/admin/pros`) and to themselves (`/api/pro/me`). Editing licenses resets a pro to pending, which hides it until an admin verifies it again.
**Breaking change:** before this, unverified and pending pros appeared publicly without a badge.

## HTTP API (JSON; `Authorization: Bearer <token>`; tokens are stored SHA-256 hashed)
| Who | Route |
|---|---|
| public | `GET /api/config`, `GET /api/pros/directory?zip&service`, `GET /api/pros/:id` |
| pro | `POST /api/pros/signup`, `POST /api/pros/login` (magic-link stub) → `/api/pros/login/verify`, `GET/PUT /api/pro/me`, `GET /api/pro/ledger`, `GET /api/pro/leads`, `GET /api/pro/leads/:id`, `POST …/accept\|decline\|quote\|report\|messages`, `POST /api/pro/reviews/:leadId/reply` |
| homeowner (lead token) | `POST /api/leads` (returns matches + exact consent text), `POST /api/leads/:id/consent`, `GET /api/leads/:id`, `POST …/rematch\|optout\|hire\|reviews\|messages` |
| billing | `POST /api/billing/checkout`, `POST /api/billing/webhook` |
| admin (`ADMIN_TOKEN`) | `GET /api/admin/pros`, `POST /api/admin/pros/:id/verification\|credits\|status\|license-check`, `GET /api/admin/leads`, `POST /api/admin/leads/:id/refund`, `POST /api/admin/reviews/:pro/:lead/remove`, `GET /api/admin/log` |

Assignment states move from offered → accepted|declined|expired, then accepted → quoted → hired|lost. Offers expire after 72h. Contact details stay hidden until the pro accepts.
Consent stores the text, version, timestamp, IP and UA. If the posted text doesn't exactly match the server's text for the current matches, the server returns 409 `matches_changed`. TCPA SMS consent is separate, optional, and names the pros. Opt-outs are recorded. Reviews are allowed only after the pro has accepted.
Hooks (`createHandler({hooks})`): `sendEmail`, `sendSms`, `notifyPro`, and `notifyHomeowner` are all no-ops by default.
Limits: per-IP requests per minute are read 240, write 30, auth 10, lead 5. Bodies are capped at 2 MB, photos at 6 × 350 KB and the lead package at 1.2 MB (data URLs; R2 is optional). CORS is set by `ALLOWED_ORIGIN`. See `worker/wrangler.toml.sample`.

## Boss Bot snippet
```js
import { makeSnapshot } from '../p1/worker/src/share.js';
import { openGetQuotesSheet } from './marketplace/ui/get-quotes-sheet.js';
import { createMarketClient } from './marketplace/ui/mp-client.js';
const client = createMarketClient('https://<worker>');
openGetQuotesSheet({ client, snapshot: makeSnapshot(plan), zip: plan.zip,
  services: ['design', 'planting'], estimateUsd: bid.total, photo, render,
  onSent: lead => bot.say('Sent your plan to local pros.') }); // resolves to the lead or null
```

## Caveats
- ZIP→state comes from a ZIP3 table, so it is approximate.
- Only states marked `verified:true` were checked on official pages. The other states fall back to manual admin review. Admins should still verify each pro's license by hand before granting the badge.
- The KV rate limit is approximate because KV is eventually consistent.
- The consent and TCPA wording is a starting point, not legal advice. Have counsel review it.
