// Fails when src/data/database.types.ts doesn't match the local schema, which means a
// migration changed without `npm run db:types`.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const path = 'src/data/database.types.ts'

let generated
try {
  generated = execFileSync('npx', ['supabase', 'gen', 'types', 'typescript'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
} catch {
  console.error('check-types: cannot generate types. Is local Supabase running? npm run db:start')
  process.exit(1)
}

if (generated !== readFileSync(path, 'utf8')) {
  console.error(`check-types: ${path} is out of date. Run npm run db:types and commit the result.`)
  process.exit(1)
}
console.log(`check-types: ${path} matches the local schema.`)
