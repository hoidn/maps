# Working in this repository

This repository generates two designed Grand Canyon maps from USGS terrain and
OpenStreetMap geometry. Preserve the authored SVG cartography and standalone HTML
delivery unless the task explicitly changes that design.

## Start here

Read [README.md](README.md) for the product and build overview, then use the
[documentation index](docs/index.md) to select only the references relevant to
the task. The index owns task routing; it does not define requirements.

## Authority and scope

- Follow current user instructions. Within repository documentation, accepted
  contracts govern their stated interfaces; accepted designs and active plans
  govern the work within their scope; guides explain implementation and operation.
- [Map data contract](docs/specs/map-data.md) owns coordinate, unit, intermediate
  format, and artifact-boundary conventions. Do not duplicate these requirements
  in another guide; link to their owning section.
- Draft designs and plans are proposals, not implemented behavior or permission
  to start unrelated work. The automatic-layout documents remain drafts.
- [HANDOFF.md](HANDOFF.md) is historical context. Strategy notes, suggested next
  steps, old measurements, and session summaries do not establish current priorities
  or fresh verification evidence.
- A task-local checklist or incidental finding must not silently expand the task.
  Report relevant gaps; fix them when they are within the requested scope.
- Keep document status accurate. Change a contract deliberately when the requested
  work requires it; identify compatibility impact and update affected consumers.
  Do not describe an unimplemented check as an existing guarantee.

## Source, build, and delivered artifacts

- Edit the generators in `pipeline/` for durable map changes. Both builders contain
  shared-looking but separate logic; assess whether a change affects both outputs.
- Scripts use paths relative to the working directory and some load data at import
  time. Run existing pipeline commands from `pipeline/`; do not import builders
  just to inspect helpers.
- `cd pipeline && ./run_all.sh` fetches live data and rebuilds both maps. It is not
  a quick offline test. Reuse existing intermediates for affected stages when possible.
- Builders write candidate HTML into `pipeline/`. The two HTML files in `output/`
  are tracked deliverables with different names. Use the
  [artifact mapping](docs/specs/map-data.md#artifacts-and-ownership) when updating them.
- Validate candidates before replacing delivered files. Local replacement and
  publication to a hosted page are separate actions; a local build is not publication.
- Keep downloaded grids and intermediate data out of Git according to `.gitignore`.
  If validation needs temporary reports, keep them outside tracked source paths or
  add an appropriately scoped ignore rule as part of that task.

## Changes and evidence

- Keep changes focused. Existing geographic data, editorial choices, and label
  offsets are not interchangeable: moving text must not silently move its feature.
- Consult [PITFALLS.md](docs/PITFALLS.md) for the affected subsystem, especially DEM
  extent, stop-coordinate sampling, and zoomed label anchors.
- Preserve source attribution and the existing map-use notice when editing output
  templates. Source freshness and geographic accuracy need their own evidence.
- Use [VALIDATION.md](docs/VALIDATION.md) to select checks that can establish the
  actual claim. A successful build or screenshot alone does not prove interaction
  correctness, absence of collisions, or accurate geographic data.
- For behavior changes, use a small regression case where practical. No checked-in
  automated test suite exists yet; the Node/Playwright commands in the layout plan
  are proposed tooling, not current commands.
- Routine documentation edits need link/source checks, not map regeneration.
  Report what changed, what was checked, and material unchecked behavior.
- Keep plans proportional. Use `docs/plans/` for work that needs a durable sequence
  or design decision; small fixes do not require another planning document. Add
  nested agent guidance only when a subsystem develops distinct working rules.
