# Automatic layout: merge validation, 2026-09-08

The user requested merging the implementation before release validation was
complete. `master` was fast-forwarded to `6fb67eb` in the main checkout at
`/Users/ollie/Documents/grand-canyon-trail-maps`. Further work uses that checkout.
The older worktree is retained for its diagnostic history.

## Automated checks in the main checkout

- JavaScript: 51 unit tests passed.
- Python: 10 tests passed after building the browser bundle.
- Browser suite: 221 passed across Chromium, Firefox and WebKit; 10 intentional
  skips (engine-specific checks and workflows that already invoke every engine).
- Corrected the shared browser fixture to use the round text joins authored by
  both builders. Its previous default miter join triggered a conservative
  independent-audit collision. Separate miter-extent audit tests remain enabled.
- Both real candidate HTML files rebuilt successfully from copied local caches.
  No source data was fetched. Static finalization then rejected the candidate
  because the required `Bright Angel Trail` name has no valid placement.

## Actual interactive candidate

SHA-256: `620dea84bafd20d1308fe8cbc449b66571d6f2b9c396009b073babbc691a6fb8`.

A Chromium desktop/light/DPR-1 smoke audit covered 20 settled states. It found
zero overlaps, clipping, unknown annotations, typography errors, or incomplete
font measurements. It also found unresolved coverage problems:

- Overview displays 35 of 46 eligible primary names (76.1%; target 80%).
- Maximum zoom and one random state each omit their sole eligible point name.

This smoke run does not include interaction/frame audits or the full 36-profile
release matrix. Coverage baselines remain unfrozen.

A separate isolated Chromium benchmark in this checkout measured transaction
p95 **7.0 ms** (target 8), frame p95 **17.8 ms** (target 33), and settled latency
**122.5 ms** (target 100). The software-rendered reference environment and raw
samples are recorded in the report. The settled target remains unmet; thresholds
were not changed.

Logs, exact artifact hashes, screenshots and machine-readable reports are in the
ignored `artifacts/layout/merge-validation/` directory in the main checkout.

## Delivery status

Source integration and automated suite validation are complete. Release
validation is not complete. Neither tracked HTML file in `output/` was replaced,
and nothing was published. Resolve required-name coverage and settled latency,
then complete the release gate in [the validation guide](../LAYOUT_VALIDATION.md)
before promoting candidates.
