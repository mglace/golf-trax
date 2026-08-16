// Stamp a build identifier onto package.json's version, in place.
//
// Run by the deploy workflow (.github/workflows/azure-static-web-apps.yml)
// immediately before the Azure SWA action builds, so the version Vite inlines
// as __APP_VERSION__ (see vite.config.ts) identifies the exact deploy rather
// than the hand-maintained `0.1.0`. This is deliberately a *working-tree only*
// edit — nothing is committed back, so main's package.json stays authoritative
// for the base version and CI never pushes to the branch it builds from.
//
//   node scripts/stamp-build-version.mjs 57   →  version becomes 0.1.0+build.57
//
// The stamp goes in semver's build-metadata slot (after `+`), which is ignored
// for precedence, so it can never make an npm-visible version go backwards.
// Re-running is safe: any existing metadata is replaced, not appended to.

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const build = process.argv[2]
if (!build || !/^[0-9A-Za-z.-]+$/.test(build)) {
  console.error(
    `Usage: node scripts/stamp-build-version.mjs <build-id>\n` +
      `  <build-id> must be semver build metadata: alphanumerics, dots, hyphens.`,
  )
  process.exit(1)
}

/** Read a JSON file, apply `mutate`, write it back with its trailing newline. */
function patchJson(file, mutate) {
  const filePath = path.join(root, file)
  const json = JSON.parse(readFileSync(filePath, 'utf-8'))
  mutate(json)
  writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`)
}

let stamped

patchJson('package.json', (pkg) => {
  // Drop any existing build metadata so re-runs replace rather than stack.
  stamped = `${pkg.version.split('+')[0]}+build.${build}`
  pkg.version = stamped
})

// The lockfile records the root package's version in two places. npm reconciles
// them on install, but keeping them aligned avoids a spurious lockfile diff (and
// any chance of `npm ci` complaining) during the deploy build.
patchJson('package-lock.json', (lock) => {
  lock.version = stamped
  if (lock.packages?.['']) lock.packages[''].version = stamped
})

console.log(stamped)
