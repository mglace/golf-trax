'use strict'

const { app } = require('@azure/functions')
const { forward, json } = require('../shared')

/**
 * GET /api/courses/{id}  →  GolfCourseAPI /v1/courses/{id}
 */
app.http('courses', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'courses/{id}',
  handler: async (request, context) => {
    const id = request.params.id
    if (!id || !/^\d+$/.test(id)) return json(400, { error: 'Invalid course id.' })
    return forward(`/v1/courses/${encodeURIComponent(id)}`, context)
  },
})
