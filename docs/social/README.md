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

## Known gaps

- Sample data only; the strip assumes 18 holes and clamps bars at ±2 strokes.
- No 9-hole layout, and no 9:16 story crop (the other high-traffic placement).
- Fonts render as whatever the screenshotting machine has. In the app this
  inherits the Tailwind `system-ui` stack.
- Fairways/GIR/putts are shown unconditionally; real rounds often have these
  untracked and the card needs a graceful degradation for that.
