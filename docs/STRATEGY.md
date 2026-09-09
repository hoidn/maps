# Strategy notes: is there a product here?

**Status:** Exploratory product discussion, not approved requirements or an
execution queue. Verify external claims before using them for a product decision.
Current implementation and proposals are separated in the [index](index.md).

Written 2026-09-06 after the first two maps. Everything below is opinion and estimate, recorded
so the reasoning is not lost; none of it has been tested against a customer.

## What this is and is not

As a navigation tool this loses to Gaia GPS, CalTopo and AllTrails on every axis that matters in
the field: offline, GPS, routing, whole-country coverage, curated trail data, currency. As a
**publishing tool** it does things they do not: a designed sheet that composes trail class,
water, camps, mileages, elevations and a profile into one readable page; full control of
symbology and data; a single file with no account or app; traceable numbers.

Rule of thumb: plan and navigate with an app; reach for this pipeline when the output is a
document, a print, or a map carrying data no app will draw.

## Monetisation options, ranked

1. **Commissioned sheets.** Event organisers (rim-to-rim runs), outfitters and lodges, trail
   associations and land trusts, guidebook publishers. Hundreds to low thousands of dollars
   per sheet; ten a year is a side income. Best fit because the pipeline fuses any data onto a
   designed map in a day.
2. **Print sales.** Posters through print-on-demand. Crowded category, small volume without
   marketing, near-zero marginal cost. A series sells better than one map.
3. **Digital downloads.** Trip packs. Marginal.
4. **Software product.** A "sheet from a bounding box" service. Do not build as a general
   tool; Felt, CalTopo, Mapbox and Avenza cover it. See the generator idea below for the one
   shape that might work.

Constraints: OSM attribution (ODbL) on every map; USGS data public domain; fonts under SIL OFL;
keep the "not for navigation / check conditions" notice; no implied NPS endorsement.

## Mass market without building an app

- **Avenza Maps store first.** Publishers upload georeferenced PDF/GeoTIFF maps; hikers buy
  them in-app ($1–15) with GPS positioning and offline use, no code required. The static sheet
  georeferences in one GDAL step. About a week to first listing. This is the only channel
  where the design is the product and GPS comes free.
- **A series, not a map.** Ten to fifteen consistent sheets of the most-hiked corridors become
  a brand; one sheet cannot carry a store presence.
- **Own app only after sales prove demand.** Single-destination companion app: 3–6 months,
  ongoing maintenance, low-five-figure ceiling per park.

Before selling anything: trail lines need a quality pass against NPS data or field GPX, and
each sheet needs an annual re-run for closures and water changes.

## Market size (triangulated, not measured)

| Layer | Estimate |
|---|---|
| US hikers | ~60 M |
| US spend on hiking maps and nav apps | $300–500 M / yr |
| Addressable by designed single-destination maps, all top parks | $15–40 M / yr |
| One Grand Canyon sheet: below-rim overnight and rim-to-rim hikers | 60–100 k / yr |
| Paying customers for one sheet | ~500–3,000 / yr, $3–18 k / yr at $6 net |
| Ten-to-fifteen-sheet series at maturity | $50–200 k / yr |
| Global hiking navigation and map spend | $1–2 B / yr |
| Custom map poster market (city-map generators) | tens of $M / yr |

Caps: one-time $5–15 purchases, subscriptions bundle "good enough" maps, the NPS gives maps
away. A side business or a studio product line, not venture scale, unless the generator below
works.

## Differentiators versus NatGeo Trails Illustrated and the apps

1. **Route sheets, not area maps** — the corridor, profile, stop table and pacing on one page.
2. **Sun and shade by hour** — horizon shadowing from the elevation grid for a date and time;
   uniquely valuable where heat kills; nobody sells it; strongest reason for the interactive
   version (time slider). Build this first if pursuing the product.
3. **Freshness** — annual dated editions rebuilt in a day; live water status possible on the web.
4. **Terrain fidelity** — 10 ft lidar contours versus NatGeo's 50–100 ft (see HIGH_RES.md).
5. **Data nobody else draws** — zone classes, permit use areas, temperature by elevation,
   timing tables for a chosen pace.
6. **Design as product** — one subject, a point of view, consistent across a series.

None of these is a moat; together they are a position: route-centric, data-fresh,
safety-aware.

## Scaling to "all marketable locations"

Turns the series into a generator. Terrain (3DEP in the US, Copernicus GLO-30 worldwide,
national lidar in several countries), OSM vectors and all the computed layers scale for free.
Two things do not: label placement (hand-placed here; must become automatic) and editorial
content (water, permits, closures; no global source).

Product shape with three tiers on one pipeline:

1. Hand-finished sheets for the top 50–100 routes worldwide (brand and most revenue).
2. Auto-generated sheets for the next few thousand routes (search traffic, prints, Avenza,
   labelled as generated).
3. User-generated: paste a GPX, get a route sheet with profile and sun/shade, buy the print.
   The route-map analogue of city-poster generators; the actual mass-market product.

Healthy outcome at that scale: low millions per year, because the purchase is still one-off.
Gate: automatic label placement (see AUTOMATION.md).
