// Regenerates src/data/database.types.ts from the local schema. Writes only after generation
// succeeds, so a stopped database leaves the committed file intact instead of emptying it.
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const path = 'src/data/database.types.ts'

let generated
try {
  generated = execFileSync('npx', ['supabase', 'gen', 'types', 'typescript'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
} catch {
  console.error('gen-types: cannot generate types. Is local Supabase running? npm run db:start')
  process.exit(1)
}

writeFileSync(path, generated)
console.log(`gen-types: wrote ${path}`)
