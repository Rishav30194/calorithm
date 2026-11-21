// A fixed namespace for day ids. The days table's CHECK constraint uses the same value;
// changing either breaks sync for every existing day.
export const DAYS_NAMESPACE = '55e70c90-e7ae-4176-b16f-2c8bfcbdef11'

// The weights table's CHECK constraint uses the same value; the same warning applies.
export const WEIGHTS_NAMESPACE = '927e1d10-0ca5-4624-ba33-d19a9497f975'

// The checkins table's CHECK constraint uses the same value; the same warning applies.
export const CHECKINS_NAMESPACE = '7211687f-5471-4201-a682-62b6fde94019'

const hexToBytes = (hex: string): Uint8Array => {
  const clean = hex.replaceAll('-', '')
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

const bytesToUuid = (bytes: Uint8Array): string => {
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

// RFC 9562 version 5: SHA-1 of the namespace and name, with the version and variant bits set.
export const uuidV5 = async (namespace: string, name: string): Promise<string> => {
  const nameBytes = new TextEncoder().encode(name)
  const input = new Uint8Array(16 + nameBytes.length)
  input.set(hexToBytes(namespace))
  input.set(nameBytes, 16)
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', input)).slice(0, 16)
  hash[6] = ((hash[6] ?? 0) & 0x0f) | 0x50
  hash[8] = ((hash[8] ?? 0) & 0x3f) | 0x80
  return bytesToUuid(hash)
}

// Two devices marking the same day write the same row instead of clashing on the
// (user_id, date) unique key. The database checks the id against the row's own user_id, so
// knowing someone's user id doesn't let another user claim their day (decision 0018).
export const dayId = (userId: string, date: string): Promise<string> =>
  uuidV5(DAYS_NAMESPACE, `${userId}/${date}`)

// One weigh-in per user and day: a second weigh-in on the same day, from any device, writes the
// same row and replaces the first (decision 0020).
export const weightId = (userId: string, date: string): Promise<string> =>
  uuidV5(WEIGHTS_NAMESPACE, `${userId}/${date}`)

// One check-in per user and day: two devices running the same check-in offline write one row.
export const checkinId = (userId: string, date: string): Promise<string> =>
  uuidV5(CHECKINS_NAMESPACE, `${userId}/${date}`)
