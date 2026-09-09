"""OSM river polygons in map units; exact ring assembly, holes, and line fallback.

Member fragments must close by shared node identity, never geographic proximity.
Malformed/incomplete areas fail the build instead of inventing a closing bank.
"""
import json
from pathlib import Path
from shapely.geometry import Polygon, LineString, box
from shapely.ops import unary_union


def is_river_area(element):
    tags = element.get('tags', {})
    return (tags.get('natural') == 'water' and tags.get('water') == 'river') or tags.get('waterway') == 'riverbank'


def rings(chains):
    pending = [list(c) for c in chains]
    result = []
    while pending:
        ring = pending.pop()
        while ring[0] != ring[-1]:
            for i, other in enumerate(pending):
                if ring[-1] == other[0]:
                    ring.extend(other[1:]); pending.pop(i); break
                if ring[-1] == other[-1]:
                    ring.extend(other[-2::-1]); pending.pop(i); break
            else:
                raise ValueError('Incomplete river bank ring')
        if len(ring) < 4:
            raise ValueError('Degenerate river bank ring')
        result.append(ring)
    return result


class WaterAreas:
    def __init__(self, elements, project, frame):
        nodes = {e['id']: project(e['lat'], e['lon']) for e in elements if e['type'] == 'node'}
        ways = {e['id']: e for e in elements if e['type'] == 'way'}
        polygons, used = [], set()

        def polygon(ids):
            try:
                p = Polygon([nodes[i] for i in ids])
            except KeyError as error:
                raise ValueError('Missing river bank node') from error
            if not p.is_valid:
                raise ValueError('Invalid river bank polygon')
            return p

        for relation in elements:
            if relation['type'] != 'relation' or not is_river_area(relation):
                continue
            roles = {'outer': [], 'inner': []}
            for member in relation['members']:
                if member['type'] != 'way' or member.get('role', '') not in ('', 'outer', 'inner'):
                    raise ValueError('Unsupported river polygon member')
                try:
                    way = ways[member['ref']]
                except KeyError as error:
                    raise ValueError('Missing river bank member') from error
                roles[member.get('role') or 'outer'].append(way['nodes'])
                used.add(way['id'])
            outer = unary_union([polygon(r) for r in rings(roles['outer'])])
            inner = unary_union([polygon(r) for r in rings(roles['inner'])])
            if outer.is_empty or (not inner.is_empty and not outer.covers(inner)):
                raise ValueError('River islands outside outer banks')
            polygons.append(outer.difference(inner))
        for way in ways.values():
            if way['id'] not in used and is_river_area(way):
                polygons.extend(polygon(r) for r in rings([way['nodes']]))
        # Shared boundaries disappear before rendering, preventing seams. Simplify
        # topologically in the same fine map-unit tolerance used by line geometry.
        self.geometry = unary_union(polygons).intersection(box(*frame)).simplify(.025, preserve_topology=True)

        parts = [self.geometry] if self.geometry.geom_type == 'Polygon' else list(self.geometry.geoms)
        self.coverage = unary_union([Polygon(p.exterior) for p in parts if p.geom_type == 'Polygon'])

    @classmethod
    def from_cache(cls, path, project, frame):
        if not Path(path).exists():
            print(f'No {path}: river centerline fallback only; run fetch_water.py to add banks')
            return cls([], project, frame)
        return cls(json.loads(Path(path).read_text())['elements'], project, frame)

    def paths(self):
        polygons = [self.geometry] if self.geometry.geom_type == 'Polygon' else list(self.geometry.geoms)
        def ring_path(ring):
            return 'M' + ' L'.join(f'{x:.3f},{y:.3f}' for x, y in list(ring.coords)[:-1]) + ' Z'
        return [' '.join(ring_path(r) for r in [p.exterior, *p.interiors]) for p in polygons if p.geom_type == 'Polygon']

    def uncovered_runs(self, points):
        line = LineString(points).difference(self.coverage)
        parts = [line] if line.geom_type == 'LineString' else list(getattr(line, 'geoms', []))
        return [list(p.coords) for p in parts if p.geom_type == 'LineString' and not p.is_empty]
