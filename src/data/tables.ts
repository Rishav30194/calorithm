import { z } from 'zod/mini'

import type { Tables } from './database.types'

// Columns every synced table has. See docs/architecture.md, "Sync".
export type SyncRow = {
  id: string
  user_id: string
  updated_at: string
  client_updated_at: string
  deleted_at: string | null
  schema_version: number
}

export type TableSpec<Row extends SyncRow = SyncRow> = {
  name: string
  // The row shape this app version writes.
  schemaVersion: number
  // Checks rows read from the outbox or pulled from the server; null when they don't fit.
  parse: (raw: unknown) => Row | null
  // Brings an outbox row written by an older app version up to schemaVersion before it's sent.
  upgrade?: (row: Record<string, unknown>, fromVersion: number) => Record<string, unknown>
}

const syncColumns = {
  id: z.string(),
  user_id: z.string(),
  updated_at: z.string(),
  client_updated_at: z.string(),
  deleted_at: z.nullable(z.string()),
  schema_version: z.number(),
}

const parser =
  <Row extends SyncRow>(schema: z.ZodMiniType<Row>) =>
  (raw: unknown): Row | null => {
    const result = schema.safeParse(raw)
    return result.success ? result.data : null
  }

export type ProfileRow = Tables<'profile'>

const profileSchema = z.object({
  ...syncColumns,
  height_cm: z.nullable(z.number()),
  birth_date: z.nullable(z.string()),
  sex: z.nullable(z.string()),
  activity_level: z.nullable(z.string()),
  units: z.string(),
  goal_rate_kg_per_week: z.number(),
  protein_g_per_kg: z.number(),
  calorie_floor_kcal: z.number(),
})

export const profileSpec: TableSpec<ProfileRow> = {
  name: 'profile',
  schemaVersion: 1,
  parse: parser(profileSchema),
}

// Push order: a parent table comes before any table that references it.
export const syncedTables: readonly TableSpec[] = [profileSpec]
