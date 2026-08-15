/**
 * Server-side render of the post-round share card as SVG.
 *
 * This is the OG-image source for `/r/{shareId}`: social crawlers don't run
 * JavaScript, so the preview image has to be produced here rather than in the
 * SPA. Output is a self-contained SVG string; `renderSharePng` rasterizes it.
 *
 * SPIKE STATUS — this file exists to prove the pipeline works end to end. Two
 * things must change before it ships:
 *   1. `buildModel` duplicates scoring logic that belongs in the pure
 *      `src/domain/shareCard.ts`, with this file as its JS port and a parity
 *      test, following the sync.ts / sync-core.js precedent.
 *   2. `fitText` estimates text width from a per-character average because SVG
 *      has no measurement API here. It is approximate — see the note there.
 *
 * Layout is absolutely positioned: resvg implements SVG, not CSS layout, so
 * there is no flexbox to lean on. Every coordinate is explicit.
 */

const W = 1080
const H = 1350
const PAD = 64

/**
 * Score-tone palette. Validated for colorblind separation on all pairs against
 * this card's dark surface (OKLab ΔE >= 8 under deutan/protan/tritan
 * simulation). Do not substitute "nicer" greens/reds without re-validating —
 * the obvious pairings put birdie and double-bogey inside the confusion band.
 */
const TONE = {
  birdie: '#34d399',
  par: '#94a3b8',
  bogey: '#fbbf24',
  double: '#f43f5e',
}
const INK_1 = '#ffffff'
const INK_2 = '#a9c6b6'
const INK_3 = '#6d8b7b'

const FONT = 'Liberation Sans'

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[c])
}

const sum = (a) => a.reduce((x, y) => x + y, 0)
const signed = (n) => (n > 0 ? `+${n}` : n === 0 ? 'E' : String(n))
const toneOf = (d) => (d <= -1 ? 'birdie' : d === 0 ? 'par' : d === 1 ? 'bogey' : 'double')

/**
 * Approximate advance width of a string, as a multiple of font size.
 *
 * resvg exposes no text-measurement API, so a long course name cannot be
 * measured before it is drawn — it would simply run off the card. These
 * coefficients are eyeballed averages for Liberation Sans and are only good
 * enough to decide "shrink or truncate"; they are not typesetting-accurate.
 * Replace with real metrics (e.g. fontkit) before relying on this for layout.
 */
function estWidth(text, fontSize, bold) {
  const perChar = bold ? 0.58 : 0.52
  return text.length * fontSize * perChar
}

/** Shrink a headline to fit `maxWidth`, truncating with an ellipsis at the floor. */
function fitText(text, fontSize, maxWidth, minSize, bold) {
  let size = fontSize
  while (size > minSize && estWidth(text, size, bold) > maxWidth) size -= 2
  if (estWidth(text, size, bold) <= maxWidth) return { text, size }
  const max = Math.max(4, Math.floor(maxWidth / (size * (bold ? 0.58 : 0.52))) - 1)
  return { text: `${text.slice(0, max)}…`, size }
}

function text(x, y, s, opts = {}) {
  const a = [
    `x="${x}"`,
    `y="${y}"`,
    `font-family="${FONT}"`,
    `font-size="${opts.size || 24}"`,
    `fill="${opts.fill || INK_1}"`,
  ]
  if (opts.weight) a.push(`font-weight="${opts.weight}"`)
  if (opts.anchor) a.push(`text-anchor="${opts.anchor}"`)
  if (opts.tracking) a.push(`letter-spacing="${opts.tracking}"`)
  return `<text ${a.join(' ')}>${esc(s)}</text>`
}

function rect(x, y, w, h, r, fill, extra = '') {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`
}

/** The GolfTrax pin mark, drawn at an arbitrary size. */
function mark(x, y, size) {
  const s = size / 512
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <rect width="512" height="512" rx="112" fill="${TONE.birdie}"/>
    <rect x="238" y="96" width="18" height="300" rx="9" fill="#052e1e"/>
    <path d="M256 104 L404 164 L256 224 Z" fill="#052e1e"/>
    <rect x="128" y="384" width="256" height="18" rx="9" fill="#052e1e"/>
  </g>`
}

/**
 * Hole-by-hole strip: bars diverge from a par baseline (up = under par).
 * vs-par is encoded three ways at once — bar direction, the stroke count
 * printed above, and hue — so the strip survives a colorblind reader, heavy
 * JPEG recompression, and a phone screen in sunlight.
 */
function strip(model, x0, y0) {
  const { pars, scores } = model
  const n = pars.length
  const width = W - PAD * 2
  const barW = n > 9 ? 34 : 68
  const seam = n > 9 ? 16 : 0
  const gap = (width - n * barW - seam) / (n - 1)

  const scoreY = 34, parY = 64, base = 134, unit = 36, holeY = 240
  const xOf = (i) => x0 + i * (barW + gap) + (n > 9 && i >= 9 ? seam : 0)

  let out = `<line x1="${x0}" y1="${y0 + base}" x2="${x0 + width}" y2="${y0 + base}" stroke="rgba(255,255,255,0.20)" stroke-width="2"/>`

  if (n > 9) {
    const seamX = xOf(9) - gap / 2 - seam / 2
    out += `<line x1="${seamX}" y1="${y0 + parY + 14}" x2="${seamX}" y2="${y0 + holeY - 18}" stroke="rgba(255,255,255,0.10)" stroke-width="2"/>`
  }

  scores.forEach((s, i) => {
    const d = s - pars[i]
    const c = TONE[toneOf(d)]
    const x = xOf(i)

    if (d === 0) {
      out += rect(x, y0 + base - 5, barW, 10, 5, c)
    } else {
      // Clamped at two strokes: an unclamped blow-up would rescale the whole
      // strip and flatten every other hole into noise.
      const h = Math.min(Math.abs(d), 2) * unit
      out += rect(x, d < 0 ? y0 + base - h : y0 + base, barW, h, 6, c)
    }

    const cx = x + barW / 2
    out += text(cx, y0 + scoreY, s, { size: 31, weight: 700, fill: c, anchor: 'middle' })
    out += text(cx, y0 + parY, pars[i], { size: 17, fill: INK_3, anchor: 'middle' })
    out += text(cx, y0 + holeY, model.holeNumbers[i], { size: 19, fill: INK_3, anchor: 'middle' })
  })

  return out
}

/** Part-to-whole breakdown of the round, with a labeled legend beneath. */
function distribution(model, x0, y0) {
  const order = ['birdie', 'par', 'bogey', 'double']
  const labels = { birdie: 'Birdie+', par: 'Par', bogey: 'Bogey', double: 'Double+' }
  const width = W - PAD * 2
  const barH = 30
  const gap = 3
  const total = order.reduce((a, t) => a + model.counts[t], 0) || 1

  let x = x0
  let out = ''
  for (const t of order) {
    const w = (model.counts[t] / total) * (width - gap * (order.length - 1))
    if (w <= 0) continue
    out += rect(x, y0, w, barH, 9, TONE[t])
    if (w > 90) {
      out += text(x + w / 2, y0 + barH / 2 + 7, model.counts[t], {
        size: 19, weight: 700, fill: '#052e1e', anchor: 'middle',
      })
    }
    x += w + gap
  }

  // Legend: identity is never carried by color alone. Laid out on fixed
  // columns rather than measured widths — estWidth is too coarse here, and
  // underestimating collides the count into the label.
  const ly = y0 + barH + 34
  const col = width / order.length
  order.forEach((t, i) => {
    const lx = x0 + i * col
    out += rect(lx, ly - 12, 14, 14, 4, TONE[t])
    out += text(lx + 25, ly, labels[t], { size: 21, fill: INK_2 })
    out += text(lx + col - 30, ly, model.counts[t], { size: 21, weight: 700, fill: INK_1, anchor: 'end' })
  })
  return out
}

function kpiTile(x, y, w, label, value, sub) {
  return [
    rect(x, y, w, 148, 22, 'rgba(255,255,255,0.045)', 'stroke="rgba(255,255,255,0.10)" stroke-width="1"'),
    text(x + 28, y + 40, label, { size: 18, weight: 600, fill: INK_3, tracking: 2.3 }),
    text(x + 28, y + 100, value, { size: 56, weight: 700, fill: INK_1 }),
    text(x + 28, y + 130, sub, { size: 20, fill: INK_2 }),
  ].join('')
}

/** Compose the card. Returns an SVG document string. */
function renderShareSvg(model) {
  const inner = W - PAD * 2
  const head = fitText(model.course, 62, inner, 40, true)

  let y = 48

  // ---- background + texture
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0%" stop-color="#0d2e1e"/><stop offset="55%" stop-color="#071b12"/><stop offset="100%" stop-color="#050f0b"/>
    </linearGradient>
    <radialGradient id="glowA" cx="0.12" cy="-0.10" r="0.85">
      <stop offset="0%" stop-color="#16613a" stop-opacity="1"/><stop offset="100%" stop-color="#16613a" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowB" cx="1.05" cy="0.08" r="0.70">
      <stop offset="0%" stop-color="#0f7a56" stop-opacity="1"/><stop offset="100%" stop-color="#0f7a56" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="cta" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#34d399" stop-opacity="0.05"/><stop offset="100%" stop-color="#34d399" stop-opacity="0.11"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glowA)"/>
  <rect width="${W}" height="${H}" fill="url(#glowB)"/>
  <g fill="none" stroke="#7cf3c0" stroke-width="2" opacity="0.07">`
  for (let i = 0; i < 8; i += 1) {
    const o = i * 46
    svg += `<path d="M${-120 + o} 1400 C ${180 + o} ${1120 - o * 0.6}, ${120 + o} ${640 - o * 0.5}, ${520 + o} ${380 - o * 0.7} S ${900 + o} ${140 - o * 0.4}, ${1240 + o} ${-80 - o * 0.3}" opacity="${0.55 - i * 0.05}"/>`
  }
  svg += `</g>`

  // ---- header
  svg += mark(PAD, y, 46)
  svg += text(PAD + 60, y + 32, 'GOLFTRAX', { size: 25, weight: 700, tracking: 5 })
  svg += text(W - PAD, y + 31, model.dateLabel, { size: 22, fill: INK_2, anchor: 'end' })
  y += 46

  // ---- course
  y += 34
  svg += text(PAD, y + head.size * 0.78, head.text, { size: head.size, weight: 700 })
  y += head.size * 0.78 + 14
  svg += text(PAD, y + 24, model.subtitle, { size: 24, fill: INK_2 })
  y += 34

  // ---- comparison badge (the share trigger — omitted when there's no history)
  if (model.badgeText) {
    y += 22
    const bw = estWidth(model.badgeText, 21, true) + 88
    svg += rect(PAD, y, bw, 48, 24, 'rgba(52,211,153,0.13)', 'stroke="rgba(52,211,153,0.34)" stroke-width="1"')
    svg += `<path d="M${PAD + 26} ${y + 30} L${PAD + 35} ${y + 15} L${PAD + 44} ${y + 30} Z" fill="${TONE.birdie}"/>`
    svg += text(PAD + 56, y + 31, model.badgeText, { size: 21, weight: 600, fill: TONE.birdie })
    y += 48
  }

  // ---- hero
  y += 20
  svg += text(PAD, y + 130, model.totalScore, { size: 194, weight: 700 })
  const heroX = PAD + estWidth(String(model.totalScore), 194, true) + 44
  const cells = [
    { v: signed(model.vsPar), k: 'TO PAR', fill: model.vsPar > 0 ? TONE.bogey : TONE.birdie },
    { v: model.totalPar, k: 'COURSE PAR', fill: INK_1 },
  ]
  let cx = heroX
  for (const c of cells) {
    svg += `<line x1="${cx}" y1="${y + 42}" x2="${cx}" y2="${y + 130}" stroke="rgba(255,255,255,0.10)" stroke-width="2"/>`
    svg += text(cx + 24, y + 100, c.v, { size: 54, weight: 700, fill: c.fill })
    svg += text(cx + 24, y + 130, c.k, { size: 18, weight: 600, fill: INK_3, tracking: 2.3 })
    cx += 24 + Math.max(estWidth(String(c.v), 54, true), estWidth(c.k, 18, true)) + 40
  }
  y += 152

  // ---- hole by hole
  y += 30
  svg += text(PAD, y + 16, 'HOLE BY HOLE', { size: 19, weight: 700, fill: INK_3, tracking: 2.8 })
  svg += text(PAD, y + 42, 'score over par  ·  bars show strokes vs par', { size: 18, fill: INK_3 })
  svg += text(W - PAD, y + 16, model.splitLabel, { size: 21, fill: INK_2, anchor: 'end' })
  y += 62
  svg += strip(model, PAD, y)
  y += 254

  // ---- the round
  y += 30
  const tileW = (inner - 36) / 3
  model.tiles.forEach((t, i) => {
    svg += kpiTile(PAD + i * (tileW + 18), y, tileW, t.label, t.value, t.sub)
  })
  y += 148

  // ---- scoring
  y += 30
  svg += text(PAD, y + 16, 'SCORING', { size: 19, weight: 700, fill: INK_3, tracking: 2.8 })
  y += 34
  svg += distribution(model, PAD, y)

  // ---- CTA (anchored to the bottom: this is the acquisition surface and must
  // never be cropped, whatever the content above it does)
  const ctaY = H - 138
  svg += rect(0, ctaY, W, 138, 0, 'url(#cta)')
  svg += `<line x1="0" y1="${ctaY}" x2="${W}" y2="${ctaY}" stroke="rgba(255,255,255,0.10)" stroke-width="1"/>`
  svg += mark(PAD, ctaY + 38, 62)
  svg += text(PAD + 84, ctaY + 58, 'Track your rounds. Free.', { size: 32, weight: 700 })
  svg += text(PAD + 84, ctaY + 94, 'Works offline on the course. No account needed.', { size: 21, fill: INK_2 })
  const urlW = estWidth('golftrax.app', 25, true) + 52
  svg += rect(W - PAD - urlW, ctaY + 43, urlW, 56, 28, TONE.birdie)
  svg += text(W - PAD - urlW / 2, ctaY + 80, 'golftrax.app', { size: 25, weight: 700, fill: '#052e1e', anchor: 'middle' })

  return `${svg}</svg>`
}

/**
 * Derive the card model from a stored share snapshot.
 *
 * TEMPORARY: this logic belongs in `src/domain/shareCard.ts` so the in-app
 * preview and the OG image cannot disagree. See the file header.
 */
function buildModel(snapshot) {
  const { pars, scores } = snapshot
  const totalPar = sum(pars)
  const totalScore = sum(scores)
  const counts = { birdie: 0, par: 0, bogey: 0, double: 0 }
  scores.forEach((s, i) => { counts[toneOf(s - pars[i])] += 1 })

  const nine = pars.length <= 9
  const outS = sum(scores.slice(0, 9)), outP = sum(pars.slice(0, 9))
  const inS = sum(scores.slice(9)), inP = sum(pars.slice(9))
  const splitLabel = nine
    ? `TOTAL ${totalScore}  ${signed(totalScore - totalPar)}`
    : `OUT ${outS} ${signed(outS - outP)}   |   IN ${inS} ${signed(inS - inP)}`

  // Fairways/GIR/putts are all optional in the data model — a round entered
  // without putts has no GIR at all. Tiles are built only from what exists, so
  // the card degrades instead of printing a row of em-dashes.
  const tiles = []
  if (snapshot.fairways) {
    tiles.push({
      label: 'FAIRWAYS',
      value: `${Math.round((snapshot.fairways.hit / snapshot.fairways.opp) * 100)}%`,
      sub: `${snapshot.fairways.hit} of ${snapshot.fairways.opp}`,
    })
  }
  if (snapshot.gir) {
    tiles.push({
      label: 'GREENS IN REG',
      value: `${Math.round((snapshot.gir.hit / snapshot.gir.opp) * 100)}%`,
      sub: `${snapshot.gir.hit} of ${snapshot.gir.opp}`,
    })
  }
  if (snapshot.putts) {
    tiles.push({
      label: 'PUTTS / HOLE',
      value: snapshot.putts.avg,
      sub: `${snapshot.putts.total} total`,
    })
  }
  tiles.push({ label: 'PARS OR BETTER', value: String(counts.birdie + counts.par), sub: `of ${scores.length} holes` })

  return {
    course: snapshot.course,
    subtitle: [snapshot.place, snapshot.tee, `${pars.length} holes`].filter(Boolean).join('  ·  '),
    dateLabel: snapshot.dateLabel,
    pars,
    scores,
    holeNumbers: snapshot.holeNumbers || pars.map((_, i) => i + 1),
    totalScore,
    totalPar,
    vsPar: totalScore - totalPar,
    splitLabel,
    counts,
    tiles: tiles.slice(0, 3),
    badgeText: snapshot.badgeText || null,
  }
}

module.exports = { renderShareSvg, buildModel, TONE }
