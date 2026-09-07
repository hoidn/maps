# Pitfalls and how they were caught

Everything here cost real time. Each entry says what happened, how it showed up, and the fix
that is now built into the pipeline.

## 1. The elevation server silently stretched the grid

**What happened**: the first DEM request asked for 2600×2140 pixels over a bbox whose aspect
was not square in degrees. The ImageServer kept the pixel count and expanded the bbox to
35.9612–36.2608 instead of 35.990–36.232 without any warning in the image response. Every
elevation sampled along a trail was from the wrong place: ridges read low, canyon floors read
high, Roaring Springs came back at 7,914 ft (rim height).

**How it showed**: printing elevations at a few known points (trailheads, Phantom Ranch) looked
fine because those spots are on broad ground. The profile waypoints exposed it. Always test
points in narrow terrain, not just flat ones.

**Fix**: choose `size` so that lon span/width equals lat span/height in degrees; call the
endpoint with `f=json` first and compare the returned `extent` to the request.
`fetch_dem_hi.py` exits if they differ by more than 2e-4°.

## 2. Large image requests fail inline but work as a file link

`f=image` at 3900×2593 returned an HTML 500 page. `f=json` at 3900×2592 returned a JSON with
an `href` to a temporary GeoTIFF, which downloaded fine. Use the link form above ~4.5 Mpx.

## 3. Overpass rejected the default client

`overpass-api.de` answered HTTP 406 to python-requests until a descriptive `User-Agent` was
set. The Kumi mirror answered 429. Set the header, keep a fallback endpoint.

## 4. A major trail was tagged `highway=construction`

The North Kaibab Trail's main ways carried `highway=construction` because of the transcanyon
waterline project, so a `highway~"path|footway"` filter returned only its bridges. The Rim Trail
and Tonto Trail were also fragmentary as named ways. The second pull fetches hiking route
relations and everything in the corridor box, and `osmdata.py` accepts `construction`.

Print the chain summary (`python3 osmdata.py`) and look for trails that are missing or come
out as many short chains before building anything.

## 5. Way-ID merging is brittle; distance merging is not

Merging trail ways by shared node ids left gaps wherever two ways met at different nodes. The
merge now joins chain ends within 0.03 mi and works for relations and loose named ways alike.

## 6. Memory-placed coordinates were wrong by hundreds of metres

Before the OSM pull, the plan was to hand-place trail waypoints from memory. Checking those
against OSM showed errors of 300–800 m for Phantom Ranch, Cottonwood, Zoroaster Temple and
Plateau Point. Over real contours such errors would have put trails across cliffs. Rule: once
real terrain is on the sheet, every line on it needs real geometry too.

## 7. Elevation for a stop must come from its own coordinates

Two Bright Angel table rows (Bright Angel Campground, Phantom Ranch) took their elevation from
"the chain point N miles along", which on the River Trail is the south bank, 100 ft up a cliff.
Stops that are off the measured chain now carry an explicit coordinate alongside their mileage.

## 8. Missing charset garbled every "·", "–" and "→"

The page had no `<meta charset>`, so a local file preview decoded UTF-8 as Latin-1. The
artifact host adds one, but the file now declares it in its first line so previews match.

## 9. Labels drifted away from symbols when zoomed

Label offsets were baked into SVG `x`/`y` in map units, so at 6× a 10-unit gap became 60
screen pixels. The interactive build now positions every label and symbol with a CSS
transform `translate(anchor) scale(var(--k)) translate(offset)` and sets `--k` from the zoom
level, so the offset shrinks with the text.

## 10. `hidden` on SVG elements is not honoured without CSS

A `<g hidden>` hover marker rendered locally because plain HTML's `[hidden]` rule does not
reach SVG in every context. Add `.hover[hidden]{display:none}` explicitly.

## 11. Overlay controls must be positioned against the map, not the figure

The cursor readout was absolute-positioned inside the `<figure>`, which also contains the
legend, so it landed on the legend. Wrap the SVG and its overlays in their own
`position:relative` div.

## 12. Contour data size vs interval

Measured on this frame after smoothing and simplification: 250 ft → 0.6 MB, 100 ft → 1.4 MB,
50 ft → 2.8 MB, 40 ft → 3.5 MB of path data. The interactive page carries the 250, 100 and 50
ft ladders as non-overlapping sets (about 3.8 MB) and toggles them by zoom with `display`, so
hidden ladders cost nothing to paint. Panning at 5×+ with ~325k vertices visible is usable but
not silky; going finer than 50 ft would need tiling.

## 13. Duplicated geometry for textPath labels doubles bytes

Contour labels need a path with an `id`. Putting a copy in `<defs>` duplicated every labelled
segment. The builder now emits labelled segments as their own `<path id>` elements in the
visible layer and merges the rest into one path per level.
