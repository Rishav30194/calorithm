import { z } from 'zod/mini'

const schema = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().check(z.minLength(1)),
})

export type Env = { supabaseUrl: string; supabasePublishableKey: string }

export type EnvResult = { ok: true; env: Env } | { ok: false; invalid: string[] }

export const parseEnv = (raw: Record<string, unknown>): EnvResult => {
  const parsed = schema.safeParse(raw)
  if (parsed.success) {
    return {
      ok: true,
      env: {
        supabaseUrl: parsed.data.VITE_SUPABASE_URL,
        supabasePublishableKey: parsed.data.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
    }
  }
  const invalid = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))]
  return { ok: false, invalid }
}
