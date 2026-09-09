"""Display land interests separately from protected-area designations.

Classification uses explicit source attributes only. Ownership or easement
interests never assert a trail closure, public access, or operational status.
All source boundaries remain intact; this module selects paint, not geometry.
"""

_STYLES = {
 'designation': ('Protected-area designation', '--boundary-ink', .75, (8,3,2,3), .7),
 'ownership': ('Land ownership boundary', '--ownership-ink', .45, (8,4), .5),
 'easement': ('Easement boundary', '--easement-ink', .4, (1,3), .5),
 'unknown': ('Boundary · type unspecified', '--boundary-unknown-ink', .45, (3,3), .5),
}

def boundary_style(feature):
 """Return fresh serializable style data for both scene paint and its legend."""
 category = None
 for data in (feature.get('properties', {}), feature.get('tags', {})):
  fields = {key.casefold(): value for key, value in data.items()}
  raw = fields.get('category')
  if raw is not None and str(raw).strip():
   category = str(raw).strip().casefold()
   break
 if category is not None:
  key = {'designation':'designation', 'fee':'ownership', 'easement':'easement'}.get(category, 'unknown')
 else:
  boundary = str(feature.get('tags', {}).get('boundary', '')).strip().casefold()
  key = 'designation' if boundary in ('protected_area', 'national_park') else 'unknown'
 label, color, width, dash, opacity = _STYLES[key]
 return {'key':key, 'label':label, 'color':color, 'width':width, 'dash':list(dash), 'opacity':opacity}
