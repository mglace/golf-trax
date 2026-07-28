'use strict'

const { app } = require('@azure/functions')
const { forward, json } = require('../shared')

/**
 * GET /api/search?search_query=...  →  GolfCourseAPI /v1/search
 * Mirrors the upstream response shape ({ courses: [...] }).
 */
app.http('search', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'search',
  handler: async (request, context) => {
    const query = (request.query.get('search_query') || '').trim()
    if (query === '') return json(200, { courses: [] })
    const params = new URLSearchParams({ search_query: query })
    return forward(`/v1/search?${params.toString()}`, context)
  },
})
