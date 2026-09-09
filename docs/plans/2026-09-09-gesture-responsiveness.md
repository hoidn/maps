# Gesture responsiveness

Integrated with pan stability; verification is recorded in
[the performance record](../PERFORMANCE.md#integration-with-asynchronous-settling).
The user authorized implementation and integration after profiling showed full
layout running between drag events. Complete release validation remains pending.

- Track pointer and wheel gesture lifetimes; forbid settling during an active
  gesture, including gaps between events. Handle cancellation and lost capture.
- Reuse validated screen footprints and placements for camera translation;
  recheck viewport and fixed controls without remeasuring text. Retain hidden
  placements so returning to a view restores the same positions and wrapping.
- Run interactive settling through the embedded worker, discard obsolete
  results, and yield during DOM-dependent preparation. Keep the static path
  synchronous and provide a cancellable cooperative fallback without workers.
- Validate interrupted settling, intermittent input, newly revealed labels,
  fonts/layers/resize, independent frame audits, and before/after timing. Rebuild
  candidates from committed source; promotion remains a separate release gate.

Integration preserves current-zoom placement and hidden-repeat reservations from
`8735b1a`. It unifies gesture tracking in the controller, commits clone-measured
typography to originals, checks snapshots across every asynchronous stage and
invalidates metrics from rejected current jobs. The original main-checkout
changes were preserved under ignored `artifacts/merge-pan-8735b1a/` before merging.
