# 0028. One stored form per barcode

- **Status:** Accepted
- **Date:** 2026-11-22
- **Supersedes:** none

## Context

Phase 11 lets a scan find a saved food without the network. The same pack can come back in
different forms: a scanner reads a US pack as 12-digit UPC-A, Open Food Facts usually lists
it as 13-digit EAN-13 with a leading zero, and a typed code can carry spaces or a typo.

## Decision

`foods.barcode` holds one form per product: EAN-8, EAN-13, or GTIN-14 digits, with a 12-digit
UPC-A code stored as its EAN-13 form, a 14-digit code's leading zero dropped, and an EAN-8
code padded with zeros (GS1's prefix 00000) stored as its 8 digits. The app
refuses a wrong GS1 check digit; the database checks only the digit pattern. The column is
nullable, in `addedColumns` (decision 0025), and not unique. Lookup parses the code it's
given, so a caller can pass a scan as it comes.

## Alternatives

| Option | Why not |
|---|---|
| Store the code as scanned or typed | A UPC-A scan wouldn't find a food saved from its EAN-13 form |
| Check the check digit in the database too | The app already refuses it, and a pattern check keeps the migration simple |
| A unique barcode per user | Two foods from one pack, such as different serving sizes, are reasonable |

## Consequences

- A scan or typed code finds the food whichever form it arrives in.
- A saved barcode can be changed but not removed, because sync can't clear a value back to
  not set (decision 0025).
- An older version dropped the column from foods it pulled, so the local database's version
  8 clears the foods pull cursor, and the next pull reads every food again.
- UPC-E codes need expanding to UPC-A first; phase 11's scanner reports the format to do it.
- Revisit if stores' own short codes, which aren't GTINs, need saving.
