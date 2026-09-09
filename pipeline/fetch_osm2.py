"""Retire the historical named-route fetch: complete relations are in osm.json."""
from sources.catalog import atomic_json
atomic_json('osm2.json',{'elements':[],'supersededBy':'cache/grand_canyon/osm.json'})
