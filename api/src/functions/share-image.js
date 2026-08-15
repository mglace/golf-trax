'use strict'

/**
 * GET /api/share/{shareId}/image.png — the Open Graph image for a share.
 *
 * This is the only place a card becomes pixels. Social crawlers fetch it
 * directly and never run JavaScript, which is why it is rendered here rather
 * than in the browser.
 */

const { app } = require('@azure/functions')
const { json } = require('../shared')
const { getShare } = require('../share-store')
const { renderShareSvg, buildModel } = require('../share-card')
const { fontOptions } = require('../fonts')

/** A card never changes once created, so it can be cached hard. */
const IMMUTABLE = 'public, max-age=31536000, immutable'

app.http('share-image', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'share/{shareId}/image.png',
  handler: async (request, context) => {
    const shareId = request.params.shareId
    if (!shareId || !/^[A-Za-z0-9_-]+$/.test(shareId)) {
      return json(400, { error: 'Invalid share id.' })
    }

    let share
    try {
      share = await getShare(shareId)
    } catch (err) {
      context.error('Failed to load share for image', err)
      return json(500, { error: 'Could not load the share.' })
    }
    if (!share) return json(404, { error: 'Share not found.' })

    try {
      const { Resvg } = require('@resvg/resvg-js')
      const svg = renderShareSvg(buildModel(share.snapshot))
      const png = new Resvg(svg, { font: fontOptions() }).render().asPng()
      return {
        status: 200,
        headers: { 'Content-Type': 'image/png', 'Cache-Control': IMMUTABLE },
        body: png,
      }
    } catch (err) {
      // fontOptions() throws when the bundled faces are missing, which would
      // otherwise render a blank card and look like success.
      context.error('Failed to render share image', err)
      return json(500, { error: 'Could not render the share image.' })
    }
  },
})
