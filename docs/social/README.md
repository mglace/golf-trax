# Social share card — design sample

A **prototype**, not app code. `round-card.html` is a standalone page that renders
a shareable post-round recap card at 1080×1350 (4:5, the Instagram/Facebook feed
crop that also survives an X timeline). `round-card-sample.png` is its output,
generated from hardcoded sample data.

Nothing here is wired into the SPA yet — the whole point is to look at the
composition before deciding how it gets built for real.

## Regenerating the PNG

Open `round-card.html` in a browser and screenshot the `#card-feed` element, or
drive it headlessly:

```js
// node shoot.mjs — from the repo root, after `npm ci`
import { chromium } from 'playwright'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1240, height: 1500 } })
await page.goto(`file://${process.cwd()}/docs/social/round-card.html`)
await page.locator('#card-feed').screenshot({ path: 'docs/social/round-card-sample.png' })
await browser.close()
```

Edit the `round` object at the top of the `<script>` block to try other rounds.

## Design decisions worth keeping

**The palette is validated, not eyeballed.** Score tones are
`#34d399` birdie+ / `#94a3b8` par / `#fbbf24` bogey / `#f43f5e` double+. That
exact set clears colorblind separation on every pair against the card's dark
green surface — the more obvious choices (brand `#4ade80` with a red, or an
amber/green pairing) land in the deutan/protan warn band, where a red-green
viewer can't reliably separate a birdie from a blow-up.

**Color never carries meaning alone.** The hole strip encodes vs-par three ways
at once: bar direction (up = under par, down = over), the stroke count printed
above each bar, and hue. The scoring breakdown repeats every color in a labeled
legend with counts.

**The comparison badge is the share trigger.** "4 better than your 10-round
average" is what makes someone post a +10 round — the card has to flatter a
mid-handicapper, not just a good one. It needs a real fallback for a player's
first few rounds, which the sample sidesteps.

**The CTA is the acquisition surface** and must never be cropped, so
`round-card.html` asserts the footer sits inside the frame rather than trusting
the layout. Any future change to the card's height or content needs that check.

## Rasterizer spike — result: viable, with caveats

`api/src/share-card.js` renders the same card as pure SVG on the server, and
`@resvg/resvg-js` rasterizes it to PNG. `round-card-server.png` and
`round-card-server-degraded.png` are its output. This existed to answer one
question — can the OG image be produced in the Functions app at all — and the
answer is yes.

Measured on Node 22 / linux-x64:

| | |
|---|---|
| Render (1080×1350 PNG) | 380–520 ms cold, ~540 KB |
| `@resvg/resvg-js` on disk | 4.3 MB (native `.node` binary) |
| Bundled fonts | ~810 KB for Liberation Sans regular + bold |

**Fonts must be bundled.** With `loadSystemFonts: false` and no `fontFiles`,
resvg renders a 485-byte image — every glyph silently disappears, no error. A
Functions host is not guaranteed to have fonts installed, so the TTFs ship with
the deployment and `defaultFontFamily` is set explicitly. A consequence worth
accepting deliberately: the OG image's typography is frozen to the bundled face
and will not match the app's `system-ui` stack.

**Text width is estimated, not measured.** resvg exposes no metrics API, so
`estWidth` guesses from an average per-character advance. It is good enough to
decide whether a course name shrinks or truncates, and not good enough for
layout — the scoring legend originally collided its counts into its labels and
now uses fixed columns instead. Anything that positions one element from
another's text width is fragile; use fixed columns or `text-anchor` instead.

**Not verified:** that the native binary loads on Azure SWA managed functions.
That cannot be tested from a dev container — it needs a deploy to a preview
environment, and it should be the first thing tried, since everything else in
Phase 1 depends on it. If it fails, the fallback is a separate Function App or
an external image endpoint, not client-uploaded PNGs (see below).

**Rejected: having the client upload its rendered PNG.** It removes the native
dependency, but means accepting arbitrary image bytes from an unauthenticated
endpoint and serving them from the app's own domain. The share payload stays
numbers-only; the server is the only thing that ever draws a card.

## Known gaps

- **Vertical space is not distributed.** The layout flows top-down with the CTA
  pinned to the bottom, so a 9-hole round with untracked stats leaves a ~200px
  void above the footer — visible in `round-card-server-degraded.png`. The card
  needs to either grow/shrink its own height or distribute slack between
  sections.
- `round-card.html` (the browser prototype) still assumes 18 holes and shows all
  three stat tiles unconditionally. The server port handles both; the prototype
  was not back-ported since the server render is the one that ships.
- No 9:16 story crop yet — the other high-traffic placement.
- Bars clamp at ±2 strokes. Deliberate: an unclamped blow-up would rescale the
  strip and flatten every other hole, but it does mean a 9 on a par 4 reads the
  same as a 6.
- `buildModel` in `share-card.js` duplicates scoring logic that belongs in a
  pure `src/domain/shareCard.ts`, with this as its parity-tested JS port.
