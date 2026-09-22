# Working in this repository

This repository generates an authored Grand Canyon pair and portable regional maps
from USGS terrain and OpenStreetMap geometry, with standalone HTML and physical PDF
outputs. Preserve the authored SVG cartography unless the task explicitly changes it.

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
- [Map layout contract](docs/specs/map-layout.md) owns the implemented manifest,
  measurement, placement, controller, and frozen-static interfaces. The
  [layout validation guide](docs/LAYOUT_VALIDATION.md) owns operating commands and
  rendering-profile limits.
- Draft designs and plans do not authorize unrelated work. Automatic-layout
  implementation is active under the user's instruction to execute its plan;
  release validation and delivery remain pending. A historical draft status is
  not a claim that the installed implementation is absent or fully validated.
- [HANDOFF.md](HANDOFF.md) is historical context. Strategy notes, suggested next
  steps, old measurements, and session summaries do not establish current priorities
  or fresh verification evidence.
- A task-local checklist or incidental finding must not silently expand the task.
  Report relevant gaps; fix them when they are within the requested scope.
- Keep document status accurate. Change a contract deliberately when the requested
  work requires it; identify compatibility impact and update affected consumers.
  Do not describe an unimplemented check as an existing guarantee.

## Source, build, and delivered artifacts

- Edit the generators in `pipeline/` for durable map changes. The authored builders
  and portable regional builder share cartography; assess all affected outputs.
- Python stages use paths relative to `pipeline/` and some load data at import
  time; do not import builders just to inspect helpers. Root npm commands and
  the build shell entry points establish the required directories themselves.
- `pipeline/run_all.sh` explicitly fetches live data, processes it, and builds
  candidates. `npm run build:maps` reuses caches without fetching. Both include
  static finalization; neither promotes files into `output/`.
- `npm run generate:map` derives a regional specification from bounds and runs
  acquisition, builds and PDF export; `--cached` skips acquisition. `print:map`
  reuses caches. Follow the layout guide for prerequisites and evidence limits.
- Builders write candidate HTML into `pipeline/`. The two HTML files in `output/`
  are tracked deliverables with different names. Use the
  [artifact mapping](docs/specs/map-data.md#artifacts-and-ownership) when updating them.
- Validate and promote candidates through the release commands in the layout
  guide. Do not bypass their hash, coverage, browser, and rollback checks with
  manual copies. Local replacement and hosted publication remain separate.
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
- For behavior changes, use a small regression case that fails for the defect.
  Python, Node, and Playwright suites are checked in. Select focused tests for a
  local change; the complete release gate is required before map promotion.
- Routine documentation edits need link/source checks, not map regeneration.
  Report what changed, what was checked, and material unchecked behavior.
- Keep plans proportional. Use `docs/plans/` for work that needs a durable sequence
  or design decision; small fixes do not require another planning document. Add
  nested agent guidance only when a subsystem develops distinct working rules.
