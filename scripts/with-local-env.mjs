// Runs a command with the local Supabase URL and publishable key in its environment, read from
// `supabase status`. Local work then needs no .env file. Usage:
//   node scripts/with-local-env.mjs vite
import { execFileSync, spawn } from 'node:child_process'

const [command, ...args] = process.argv.slice(2)
if (!command) {
  console.error('with-local-env: name a command to run.')
  process.exit(1)
}

let status
try {
  const out = execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  status = JSON.parse(out)
} catch {
  console.error('with-local-env: local Supabase is not running. Start it with: npm run db:start')
  process.exit(1)
}

if (!status.API_URL || !status.PUBLISHABLE_KEY) {
  console.error('with-local-env: supabase status did not report API_URL and PUBLISHABLE_KEY.')
  process.exit(1)
}

const child = spawn(command, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_SUPABASE_URL: status.API_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  },
})
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 1)
})
