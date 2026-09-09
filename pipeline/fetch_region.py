#!/usr/bin/env python3
"""Explicit source refresh. Cached builders never perform network requests."""
import argparse
from pathlib import Path
from map_spec import MapSpec
from sources.catalog import atomic_json
from features import catalog_from_osm

def refresh(spec,source):
 root=Path(__file__).with_name('cache')/spec.id
 if source=='osm':
  from sources.osm import fetch
  data=fetch(spec,root/'osm.json');catalog=catalog_from_osm(data['elements'],spec);atomic_json(root/'features.json',catalog);return catalog['counts']
 if source in ('elevation','landcover'):
  from importlib import import_module
  return import_module('sources.'+source).fetch(spec,root)
 from importlib import import_module
 result=import_module('sources.'+source).fetch(spec,root)
 atomic_json(root/(source+'-features.json'),result)
 return {'features':len(result['features'] if isinstance(result,dict) else result)}
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--map',default='grand_canyon');parser.add_argument('--source',choices=['osm','gnis','usgs_hydro','boundaries','landcover','elevation','all'],default='all');args=parser.parse_args();spec=MapSpec.load(args.map)
 for source in (['osm','gnis','usgs_hydro','boundaries','landcover','elevation'] if args.source=='all' else [args.source]):
  print(spec.id,source,flush=True);refresh(spec,source);print('cached',source,flush=True)
if __name__=='__main__':main()
