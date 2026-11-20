// Fails when the JavaScript needed for the first screen grows past the budget.
// First load is the entry chunk plus every chunk it imports statically, measured gzipped.
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const LIMIT_BYTES = 200_000
const manifestPath = 'dist/.vite/manifest.json'

let manifest
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
} catch {
  console.error(`check-bundle: cannot read ${manifestPath}. Run a build first.`)
  process.exit(1)
}

const entry = Object.keys(manifest).find((key) => manifest[key].isEntry)
if (!entry) {
  console.error('check-bundle: the build manifest has no entry chunk.')
  process.exit(1)
}

const seen = new Set()
const pending = [entry]
while (pending.length > 0) {
  const key = pending.pop()
  if (seen.has(key)) continue
  seen.add(key)
  pending.push(...(manifest[key].imports ?? []))
}

let total = 0
for (const key of seen) {
  const file = manifest[key].file
  if (!file.endsWith('.js')) continue
  const size = gzipSync(readFileSync(`dist/${file}`)).length
  total += size
  console.log(`${String(size).padStart(8)}  ${file}`)
}

const kb = (bytes) => `${(bytes / 1000).toFixed(1)} kB`
console.log(`first-load JavaScript: ${kb(total)} gzip, budget ${kb(LIMIT_BYTES)}`)
if (total > LIMIT_BYTES) {
  console.error('check-bundle: over budget. Load the new code on demand or drop a dependency.')
  process.exit(1)
}
