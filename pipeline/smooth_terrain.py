"""Round contours in a terrain cache using its source grid spacing; no downloads."""
import argparse
import json
import os
from pathlib import Path
import tempfile
import numpy as np
from contour_smoothing import smooth_paths, intersection_pairs, SMOOTHING_VERSION


def smooth_cache(cache, dem, smooth=True):
    cache=Path(cache);data=json.loads(cache.read_text())
    registered=data.get('pixelRegistration')=='center'
    already_smoothed=data.get('smoothing',{}).get('version')==SMOOTHING_VERSION
    audited='newIntersections' in data.get('smoothing',{})
    if registered and (not smooth or already_smoothed and audited):
        return data.get('smoothing',{})
    if smooth and data.get('smoothing') and not already_smoothed:
        raise ValueError('Regenerate terrain from the DEM before changing smoothing versions')
    h,w=np.load(dem,mmap_mode='r').shape
    max_deviation=.5*min(1300/w,1070/h)
    paths=[];records=[]
    for levels in data['contours'].values():
        for level in levels:
            for index,d in enumerate(level['d']):
                paths.append(np.array([list(map(float,p.split(','))) for p in d[1:].split()]))
                records.append((level,index))
    if not registered:
        paths=[p+np.array([650/w,535/h]) for p in paths]
    if smooth and not already_smoothed:
        output,report=smooth_paths(paths,max_deviation)
        data['smoothing']={**report,'version':SMOOTHING_VERSION,'sourceGrid':[w,h]}
    else:output=paths
    if smooth and already_smoothed and not audited:
        if intersection_pairs(output):
            raise ValueError('Cached smoothed contours intersect; regenerate from the DEM')
        data['smoothing']['newIntersections']=0
    data['pixelRegistration']='center'
    for (level,index),points in zip(records,output):
        level['d'][index]='M'+' '.join(f'{x:.3f},{y:.3f}' for x,y in points)
    # Failed extraction or geometry checks never truncate the previous cache.
    temp=None
    try:
        with tempfile.NamedTemporaryFile(mode='w',dir=cache.parent,delete=False) as stream:
            temp=stream.name;json.dump(data,stream)
        os.replace(temp,cache);temp=None
    finally:
        if temp:os.unlink(temp)
    return data.get('smoothing',{})


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache',default='terrain_hi.json')
    parser.add_argument('--dem',default='dem_hi.npy')
    parser.add_argument('--register-only',action='store_true')
    args=parser.parse_args()
    print(json.dumps(smooth_cache(args.cache,args.dem,not args.register_only)))
