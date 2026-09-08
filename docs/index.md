# Documentation index

This is the task-routing entry point for humans and agents. Start with the
[project overview](../README.md) and [working rules](../AGENTS.md). Read only the
references relevant to the task; this index links to authority without duplicating it.

## Find the right path

| Task | Read | Code or artifact entry points | Evidence |
|---|---|---|---|
| Rebuild or update delivered maps | [Process](PROCESS.md), [artifact ownership](specs/map-data.md#artifacts-and-ownership) | [Full build](../pipeline/run_all.sh), both builders | [Build and delivery](VALIDATION.md#build-and-delivery) |
| Change DEM fetching, sampling, or contours | [Data contract](specs/map-data.md), [sources](DATA_SOURCES.md), [pitfalls](PITFALLS.md) | [Static fetch](../pipeline/fetch_dem.py), [dense fetch](../pipeline/fetch_dem_hi.py), [static processor](../pipeline/process_dem.py), [dense processor](../pipeline/process_dem_hi.py) | [Geographic and terrain changes](VALIDATION.md#geographic-and-terrain-changes) |
| Change trails, stops, mileages, or source selection | [Vector contract](specs/map-data.md#vectors-and-geographic-meaning), [sources](DATA_SOURCES.md), [pitfalls](PITFALLS.md) | [OSM assembly](../pipeline/osmdata.py), [first pull](../pipeline/fetch_osm.py), [second pull](../pipeline/fetch_osm2.py), builder selections/tables | [Geographic and terrain changes](VALIDATION.md#geographic-and-terrain-changes) |
| Change labels, symbols, themes, or page design | [Cartographic guide](DESIGN.md), [pitfalls](PITFALLS.md) | [Static builder](../pipeline/build_static.py), [interactive builder](../pipeline/build_interactive.py) | [Cartography and interaction](VALIDATION.md#cartography-and-interaction) |
| Change zoom, controls, search, or URL restoration | [Interactive design](DESIGN.md#interactive-layer), [pitfalls](PITFALLS.md) | [Interactive builder](../pipeline/build_interactive.py), especially emitted JavaScript | [Cartography and interaction](VALIDATION.md#cartography-and-interaction) |
| Work on automatic layout | [Draft design](plans/2026-09-08-automatic-map-layout-design.md), then [draft plan](plans/2026-09-08-automatic-map-layout-plan.md) | Current builders; proposed modules are listed in the drafts | Draft acceptance criteria apply when that work is authorized; tooling is not implemented |
| Adapt the pipeline to a new area | [Adapting](ADAPTING.md), [data contract](specs/map-data.md), [sources](DATA_SOURCES.md) | Fetchers, processors, OSM assembly, both builders | Data checks plus both rendered outputs |
| Explore lidar or product direction | [High resolution](HIGH_RES.md), [automation](AUTOMATION.md), [strategy](STRATEGY.md) | [Lidar catalogue script](../pipeline/fetch_dem_1m.py), [catalogue snapshot](../pipeline/tiles_1m.json) | Confirm proposal scope and source currency before execution |
| Edit documentation | Owning document and incoming links from this index | [Working rules](../AGENTS.md) | [Documentation-only changes](VALIDATION.md#documentation-only-changes) |

## Current contracts and guides

| Document | Role and scope |
|---|---|
| [Map data contract](specs/map-data.md) | Maintained contract for existing pipeline interfaces; explicitly identifies enforcement gaps |
| [Validation](VALIDATION.md) | Existing commands and evidence guidance; separates manual checks from proposed automation |
| [Process](PROCESS.md) | Current pipeline stages and rendering procedure |
| [Design](DESIGN.md) | Current cartographic choices and interaction behavior |
| [Data sources](DATA_SOURCES.md) | Acquisition/reference notes, attribution, and dated source observations; not a live conditions feed |
| [Pitfalls](PITFALLS.md) | Recorded failures, fixes, and lessons; consult the contract for maintained interface requirements |
| [Adapting](ADAPTING.md) | Guide to the current region-specific code; not an implemented general generator |

## Proposed work and planning records

| Document | Status and limits |
|---|---|
| [Automatic layout design](plans/2026-09-08-automatic-map-layout-design.md) | Draft; proposed behavior, interfaces, and acceptance criteria |
| [Automatic layout implementation plan](plans/2026-09-08-automatic-map-layout-plan.md) | Draft; proposed execution sequence and commands, not installed tooling |
| [Automation roadmap](AUTOMATION.md) | Current automation inventory plus proposals; newer layout details live in the draft design |
| [High-resolution path](HIGH_RES.md) | Proposal with a dated catalogue snapshot; lidar processing/delivery is not implemented |
| [Agent documentation plan](plans/2026-09-08-agent-documentation.md) | Documentation task and verification record; not a map feature or a reusable workflow requirement |

No layout specification is maintained separately yet. If the draft is adopted,
extract durable interface requirements into one owning spec and replace duplicated
contract text with links. Keep execution steps in the plan.

## Historical and exploratory context

- [Session handoff](../HANDOFF.md): original delivery, owner intentions, and known
  limitations recorded at that time. Verify state before relying on it.
- [Strategy](STRATEGY.md): exploratory product ideas and unvalidated estimates;
  does not schedule implementation or establish product requirements.
- Preview images linked from [README.md](../README.md) illustrate prior renders;
  they are not fresh validation of changed files.

## Maintaining this index

Add a route when a new task or subsystem needs one, not for every source file or
execution log. Each entry should say when to read it and whether it is a contract,
guide, proposal, or record. Keep status consistent with the owning document, link
superseded work to its replacement, and remove stale routes. Requirements, test
commands, and live progress belong in their owning documents rather than here.
