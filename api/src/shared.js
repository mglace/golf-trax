'use strict'

/**
 * Shared helper for the GolfCourseAPI proxy functions. The API key lives ONLY
 * here on the server (app setting GOLF_API_KEY) and is never sent to the client.
 */

const BASE_URL = (process.env.GOLF_API_BASE_URL || 'https://api.golfcourseapi.com').replace(
  /\/+$/,
  '',
)

/**
 * Forward a GET request to GolfCourseAPI with the server-side key and relay the
 * response (status + JSON body) back to the caller.
 *
 * @param {string} path  API path beginning with "/v1/...".
 * @param {import('@azure/functions').InvocationContext} context
 */
async function forward(path, context) {
  const key = process.env.GOLF_API_KEY
  if (!key) {
    context.error('GOLF_API_KEY app setting is not configured')
    return json(500, { error: 'Server is missing its GolfCourseAPI key.' })
  }

  let res
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    })
  } catch (err) {
    context.error('Upstream request failed', err)
    return json(502, { error: 'Could not reach GolfCourseAPI.' })
  }

  const body = await res.text()
  return {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
    body,
  }
}

function json(status, obj) {
  return { status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) }
}

module.exports = { forward, json }
