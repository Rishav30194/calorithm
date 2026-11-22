# 0029. Open Food Facts for unknown barcodes

- **Status:** Accepted
- **Date:** 2026-11-22
- **Supersedes:** none

## Context

Phase 11 scans packaged foods. A pack you haven't saved needs its name and values from
somewhere, and typing them from the label is the slow path the feature exists to avoid. The
app is local-first and holds health data, so anything sent off the device needs a reason.

## Decision

A barcode that none of your foods has goes to Open Food Facts' product API, pinned to v3.4.
Only the barcode is sent, without cookies, and the response fills the food form per 100 g
for the user to check before saving. The app names itself in an `X-User-Agent` header with the
project's GitHub address as the contact, never a personal email. Data shown from Open Food
Facts carries "© Open Food Facts contributors" and a link to the Open Database License (ODbL),
on the form and on the saved food, which is marked with `catalog_id = 'openfoodfacts'`.

## Alternatives

| Option | Why not |
|---|---|
| No lookup; type every pack's values | Defeats the scan for every new pack |
| A paid barcode API | Costs money and needs a key a static app can't hide |
| API v3.5 or v3.6, the latest | Their `nutrition` shape mixes label values with estimates; v3.0 to v3.4 keep the label's `nutriments` |
| A new `source` column on foods | Needs a migration and two releases; `catalog_id` already marks where a food came from |
| Bundle an Open Food Facts export | Many megabytes, mostly products the user never buys |

## Consequences

- Open Food Facts sees each looked-up barcode and the user's IP address, but no account or
  food log. A barcode already saved never leaves the device.
- Open Food Facts asks for a User-Agent, which browsers can't set. Its API accepts
  `X-User-Agent` from any origin (checked 2026-11-22), but its docs don't say whether that's
  enough. Read requests are limited to 15 a minute per IP address.
- Values are per 100 g, or per 100 ml for drinks, under unit `g`; the form says to check them.
- An `openfoodfacts` food keeps the credit after edits, as a built-in copy keeps its note.
- Revisit if Open Food Facts retires v3.4, asks browser apps to identify differently, or
  coverage of the user's packs proves poor.
