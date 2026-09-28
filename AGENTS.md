# Working in this repository

This repository generates an authored Grand Canyon pair and portable regional maps
from USGS terrain and OpenStreetMap geometry, with standalone HTML and physical PDF
outputs. Preserve the authored SVG cartography unless the task explicitly changes it.

## Start here

Read [README.md](README.md) for the product and build overview, then use the
[documentation index](docs/index.md) to select only the references relevant to
the task before deciding which docs or specs govern a change. The index owns
task routing; it does not define requirements. Use the linked contracts, designs,
plans, and evidence to distinguish implemented, partial, proposed, and legacy
surfaces before copying them. Use this repository's routing rather than paths
specific to another repository.

## Communication and development

- Respond to the user in Spanish unless they request otherwise.
- Ask about unclear intent, architecture, or requirements before writing code that
  depends on the answer. When running unattended, choose the most reasonable
  interpretation, proceed, and record the assumption rather than blocking.
- State the implementation approach in one or two sentences before making changes,
  including what it makes harder down the line.
- Implement the most direct, maintainable solution. Do not add speculative
  abstractions for needs that do not exist yet. Suggest a better lasting design
  when it would improve on a tactical change.
- Flag uncertainty explicitly. Use a small, local, low-risk experiment when it can
  test an uncertain hypothesis, and report the hypothesis and result.
- Keep changes scoped; avoid unrelated refactors and cosmetic edits. Adjacent
  changes needed to share logic, update an interface, or prevent a regression are
  in scope. Check that local changes do not silently break adjacent systems.
- Write plans under `docs/plans/` before large edits. Small fixes do not need a
  separate plan.

## Execution and subagents

- Run commands from the repository root unless the documented command requires
  another directory; individual Python pipeline stages are an explicit exception.
- Use the `tmux` skill for long-running commands and keep long test runs in tmux.
- When executing plans, use Subagent-Driven execution without asking for another
  confirmation. Do not delegate trivial changes when the overhead exceeds the
  value.
- The primary agent coordinates and integrates the work. Read-only scouts and
  reviewers may run in parallel. Before finishing, inspect the resulting diff and
  verification results yourself.
- For Codex subagents, use these role assignments:

  | Role | Model | Reasoning effort |
  |---|---|---|
  | Implementation | GPT-6 Luna | xhigh |
  | Review | GPT-6 Sol | high |
  | Design | GPT-6 Astra | xhigh |
  | Planning | GPT-6 Astra | high |

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
- Treat fresh command output as required verification evidence. Do not assume
  success from inspection when runnable checks are available, or weaken
  verification to make a failure disappear.
- Start with the narrowest relevant test selectors and use this repository's
  documented runners. The Python suite uses `unittest`; do not introduce pytest
  just to follow another repository's command. If working in a pytest suite with
  pytest-xdist available, run broad, slow, or full suites after narrow checks with
  `pytest -q -n 16 --dist=worksteal`, and run `pytest --collect-only` on added or
  renamed test modules. With other runners, verify discovery using their native
  commands.
- For frontend, runtime, or reusable pipeline changes, include an end-to-end usage
  or integration check, or explain why isolated checks are sufficient.
- Do not add or keep tests that assert literal prompt text or phrasing. Prefer
  behavioral, contract, artifact-lineage, or dataflow assertions that remain valid
  when prompts are revised.
- Routine documentation edits need link/source checks, not map regeneration.
  Report what changed, what was checked, and material unchecked behavior.
- Add nested agent guidance only when a subsystem develops distinct working rules.

## When using agent-orchestration

These rules apply when a task uses the sibling orchestrator, not to ordinary map
builds or tests:

- Follow that repository's documentation routing and capability status before
  reusing its surfaces; its documentation paths are not local map documentation.
- For workflow, prompt, artifact-contract, provisioning, or demo-trial changes,
  rerun at least one orchestrator/demo smoke check in addition to unit tests. For
  DSL or reusable workflow changes, include an end-to-end usage or integration
  check, or explain why isolated checks are sufficient.
- If a run passed an approval/review gate and then failed downstream, prefer
  `orchestrator resume <run_id>` over a fresh run unless intentionally redoing the
  earlier gated stages.
- Run workflows for EasySpin, `/home/ollie/Documents/PtychoPINN`, or its paper
  repository `/home/ollie/Documents/ptychopinnpaper2` in the `ptycho311`
  environment, including workflows launched in tmux. Prefer sourcing conda,
  activating `ptycho311`, and invoking `python -m orchestrator` directly for live
  output; if using `conda run`, include `--no-capture-output`.
