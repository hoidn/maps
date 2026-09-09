"""Refresh the complete configured OSM catalog and its legacy builder adapter."""
from map_spec import MapSpec
from sources.osm import fetch
from sources.catalog import atomic_json
from features import catalog_from_osm
from pathlib import Path
spec=MapSpec.load('grand_canyon');root=Path('cache')/spec.id
data=fetch(spec,root/'osm.json');atomic_json(root/'features.json',catalog_from_osm(data['elements'],spec));atomic_json('osm.json',data)
