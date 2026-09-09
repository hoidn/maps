"""Compass-correct hillshade for north-up arrays (rows increase southward)."""
import json
import os
from pathlib import Path
import tempfile
import numpy as np

HILLSHADE_VERSION = 3


def illuminate(gx, gy, azimuth, altitude, exaggeration=1.15):
    """Lambertian surface-normal dot light: azimuth clockwise from north."""
    east=np.asarray(gx)*exaggeration
    south=np.asarray(gy)*exaggeration
    az=np.radians(azimuth);alt=np.radians(altitude)
    # Upward normal in east/north/up coordinates is (-east, +south, 1).
    numerator=np.sin(alt)+np.cos(alt)*(-east*np.sin(az)+south*np.cos(az))
    return np.clip(numerator/np.sqrt(1+east*east+south*south),0,1)


def multidirectional(gx,gy):
    return sum(weight*illuminate(gx,gy,az,alt) for weight,az,alt in
               [(.55,315,45),(.20,270,40),(.15,0,50),(.10,225,35)])


def refresh_cache(path,light,dark):
    """Replace only shading; contour geometry and all its validation markers survive."""
    path=Path(path);data=json.loads(path.read_text())
    data.update(uri_light=light,uri_dark=dark,hillshadeVersion=HILLSHADE_VERSION)
    temp=None
    try:
        with tempfile.NamedTemporaryFile(mode='w',dir=path.parent,delete=False) as stream:
            temp=stream.name;json.dump(data,stream)
        os.replace(temp,path);temp=None
    finally:
        if temp:os.unlink(temp)
