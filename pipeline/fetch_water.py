"""Fetch river banks separately, without replacing existing trail/terrain caches."""
import json
from pathlib import Path
import requests

BBOX = '35.990,-112.262,36.232,-111.898'
QUERY = f'''[out:json][timeout:120];(
  way["natural"="water"]["water"="river"]({BBOX});
  relation["natural"="water"]["water"="river"]({BBOX});
  way["waterway"="riverbank"]({BBOX});
  relation["waterway"="riverbank"]({BBOX});
);out body;>;out skel qt;'''

def main():
    for endpoint in ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']:
        try:
            response = requests.get(endpoint, params={'data': QUERY}, timeout=150,
                                    headers={'User-Agent': 'grand-canyon-trail-map/1.0'})
            response.raise_for_status()
            data = response.json()
            if data.get('remark') or not data.get('elements'):
                raise ValueError('Incomplete or empty water response')
            # Validate all rings before atomically replacing a working cache.
            from water_areas import WaterAreas
            WaterAreas(data['elements'], lambda lat, lon: (lon, lat), (-112.262,35.990,-111.898,36.232))
            data['sourceEndpoint'] = endpoint
            path = Path('water.json'); temporary = path.with_suffix('.json.tmp')
            temporary.write_text(json.dumps(data)); temporary.replace(path)
            print(f'Fetched {len(data["elements"])} water elements')
            return
        except (requests.RequestException, ValueError) as error:
            print(f'{endpoint}: {error}')
    raise SystemExit('Could not fetch complete river banks; existing water cache preserved')

if __name__ == '__main__':
    main()
