# Design decisions

**Role:** Cartographic guide describing the current hand-placed maps. Automatic
layout is a [separate draft](plans/2026-09-08-automatic-map-layout-design.md).
See the [data contract](specs/map-data.md) for interface conventions and the
[index](index.md) for routing.

The brief was "draw the map yourself", so the sheet uses no map tiles or map library: the
terrain is rendered from the elevation grid and every line, symbol and label is authored SVG.
Data comes from USGS and OSM; the cartography is ours.

## Automatic annotation placement

Authored offsets are preferred candidates. The browser measures embedded fonts and tries
bounded point positions, declared line breaks, path windows and local region translations.
Protected trails, symbols, controls and previously accepted labels constrain placement.
Required names have explicit coverage gates; optional labels may be hidden with a recorded
reason. See [Layout validation](LAYOUT_VALIDATION.md) and the
[layout design](plans/2026-09-08-automatic-map-layout-design.md) for the supported rules.

## Frame and scale

Hermits Rest to Cape Royal, South Rim to the North Kaibab trailhead. That covers the three
corridor trails, the whole threshold-zone Tonto between Hermit Creek and Hance Creek, the
Hermit, Grandview, New Hance and Clear Creek trails, and the North Rim day walks. Desert View
and Point Imperial are just off the sheet and get edge arrows.

1300×1070 SVG units; 1 mile ≈ 64 units. That is dense enough to show the switchbacks and
sparse enough that the corridor labels fit at full width.

## Terrain treatment

- **Hypsometric tint tied to geology**, not a generic green-to-brown ramp: dark grey-brown for
  the Vishnu schist in the gorge (below 2,900 ft), grey-green for the Tonto Platform shelf
  (3,400–3,900), warm reds for Supai and Redwall (4,500–6,000), blond for Coconino, pale
  grey-cream Kaibab limestone at the rims, and a forest green tint above 7,500 ft for the
  North Rim's spruce. A hiker recognises the bands.
- **Hillshade** from four directions so cliffs read in every orientation; kept subtle (60–110%
  brightness range) so the tint and lines stay legible on top.
- **Contours** in topo brown, intermediate lines at 55% and index at 100% weight, labels on
  the longest index segments via `textPath`. Interval 250 ft on the sheet; the explorer adds
  100 ft and 50 ft ladders with zoom. 250 ft was a legibility choice: canyon walls are already
  near-solid bands at that interval.

## Trail symbology

Colour encodes the NPS backcountry zone class rather than one colour per trail, because the
class tells a hiker what to expect (water, patrols, maintenance) and keeps the legend to four
entries:

| Class | Line | Trails |
|---|---|---|
| Corridor | red, 2.6 | Bright Angel, South Kaibab, North Kaibab, River Trail, bridges, Plateau Point, Ribbon Falls |
| Threshold | ink, 1.7 | Hermit, Grandview, Clear Creek, Tonto (Hermit Creek to Hance Creek), Dripping Springs |
| Primitive | ink dashed, 1.3 | Boucher, New Hance, Old Bright Angel, Escalante, Waldron, Tonto beyond Hermit/Hance |
| Rim & plateau | green dotted, 1.5 | Rim Trail, Widforss, Ken Patrick, Uncle Jim, Transept, Cape Royal, Cape Final, Walhalla Glades |

Trail names are italic, rotated along a straight stretch of the line, corridor names in dark red.

## Symbols

Tent (campground, green), square (trailhead), house (lodge/ranch), open house (resthouse),
drop (drinking water), open circle (viewpoint), blue ring (spring, treat), pill (bridge),
triangle (summit with elevation), red dot (corridor landmark). All are drawn as small paths at
the origin and translated into place, so the explorer can scale them with zoom.

## Palette

Light theme: paper `#F0EBDF`, ink `#2B2520`, corridor red `#B0361F`, river `#2F6C90`, contour
brown `#A86A3A`/`#8A4E22`, campground green `#2E6B3B`. Dark theme is not an inversion: paper
`#17140F`, ink `#EDE5D6`, corridor `#F07A5C`, river `#6FB3D8`, contours `#D9A06A`/`#EBB983`,
and a separate dark hypsometric ramp so relief still reads. Every colour is a CSS token
declared on `:root`, redefined under `prefers-color-scheme: dark` and `[data-theme="dark"]`.
Label halos are the paper colour at 86% so text sits on the relief without boxing it.

## Typography

- **Bree Serif** for the sheet title and section heads: slab, park-signage character.
- **Source Sans 3** for every map label, table and body: humanist, close to the Frutiger used
  on NPS signs, with tabular figures for the mileage columns.
- **Alegreya italic** for hydrography: rivers and creeks in italic serif is the USGS convention.

Label sizes on the sheet run 8 px (contour numbers) to 12.5 px (Phantom Ranch, region names).

## Labels

Placement is manual and is the part that takes the longest. Rules followed:

- Names go on the side away from the trail; corridor stops read to the right of the line
  because the trails run north-south and the canyon is wider on the east.
- Campsites in a cluster (Monument, Cedar Spring, Salt, Horn) alternate above and below.
- Region names are letterspaced caps at 78% opacity, rotated along the feature's axis.
- Stream names ride the stream with `textPath`, flipped so they never read upside down.
- Symbols that stack (water + campground) get a fixed pixel offset.

## Page

Masthead, map, legend strip under the map, then corridor mileage tables, the rim-to-rim
profile, other trails, notes for hikers, and sources. The legend lives in the page margin
rather than over the map because the bottom corners of the frame are busy with trails.

## Interactive layer

- Zoom via the SVG `viewBox`, 1× to 14×. Labels and symbols scale as `zoom^-0.55`, line
  weights as `zoom^-0.5`: they grow, but slower than the map, so a 6× view is still a map and
  not a poster of one word.
- Cartouche and scale bar hide once zoomed; a badge shows zoom and contour interval instead.
- Hover on a trail dims the others; click pins. Tooltip shows class and mileage on the sheet.
- Cursor readout gives lat/lon and elevation from an embedded 390×260 grid.
- Layers panel toggles relief, contours, water, places, peaks, names.
- View is written to the URL hash so a zoomed link reopens in place.
