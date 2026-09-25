# Preserve malformed input until validation rejects it

Date: 2026-09-25 UTC

Base commit: `8dc36bda6f24ec727e38b161db04df0909972cf5`

Status: experimental repair, not merged or promoted.

## Observed failure

JSON cloning turned NaN placement gain into null and allowed it into a mix plan and saved project. Loading also accepted negative automation time and string-valued automation. Three new regression cases failed before the repair.

## Repair

Cloning preserves numeric values until validation. Persisted placements require explicit fields and schema; automation validates point values and duplicate IDs. Edit operations reject numeric and boolean lookalikes without changing the original project or undo history.

## Verification

Command: `npm test`

20 tests passed. No browser interaction or listening claim.

Regression tests exercise invalid input and valid-state continuity. The full repository command above passed on the repaired working tree. No production-readiness, deployment, or CANON claim is made.
