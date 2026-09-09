"""Bounded quadratic corner rounding for contours from any elevation grid.

Every changed corner stays in a disk centered on its original vertex. Its radius
is at most one quarter of the distance to every other contour. Such disks cannot
intersect another contour or another contour's rounding disks, and preserve at
least half the original inter-contour separation. Open endpoints are fixed.
Quadratics are sampled to a bounded chord error for existing SVG polyline readers.
"""
import math
import numpy as np
import shapely
from shapely.geometry import LineString, LinearRing
from shapely.strtree import STRtree

SMOOTHING_VERSION = 2
ROUNDING_RESERVE = .0015  # exceeds three-decimal rounding displacement


def intersection_pairs(paths):
    """Exact segment-intersection audit, independent of the rounding disk tests."""
    chunks=[];owners=[]
    for owner,p in enumerate(paths):
        for start in range(0,len(p)-1,32):
            chunks.append(LineString(p[start:start+33]));owners.append(owner)
    if not chunks:return set()
    owners=np.asarray(owners);tree=STRtree(chunks)
    left,right=tree.query(chunks,predicate='intersects')
    mask=(left<right)&(owners[left]!=owners[right])
    return {tuple(sorted((int(owners[a]),int(owners[b])))) for a,b in zip(left[mask],right[mask])}


def smooth_paths(paths, max_deviation, flatness=.008):
    if not np.isfinite(max_deviation) or max_deviation <= 0 or not np.isfinite(flatness) or flatness <= 0:
        raise ValueError('Positive finite smoothing bounds required')
    paths=[np.asarray(p,dtype=float) for p in paths]
    if any(p.ndim!=2 or p.shape[1]!=2 or len(p)<2 or not np.isfinite(p).all() for p in paths):
        raise ValueError('Finite polylines required')
    chunks=[];owners=[]
    for owner,p in enumerate(paths):
        for start in range(0,len(p)-1,32):
            chunks.append(LineString(p[start:start+33]));owners.append(owner)
    tree=STRtree(chunks);owners=np.asarray(owners);chunks=np.asarray(chunks,dtype=object)
    output=[];report=dict(paths=len(paths),smoothed=0,sourceNonSimple=0,rejected=0,corners=0,maxDeviation=max_deviation,flatness=flatness,minGapFraction=.5)
    for owner,p in enumerate(paths):
        original=LineString(p)
        if not original.is_simple:
            output.append(p);report['sourceNonSimple']+=1;continue
        closed=np.array_equal(p[0],p[-1]);vertices=p[:-1] if closed else p
        radii=np.full(len(vertices),max_deviation,dtype=float)
        points=shapely.points(vertices)
        pi,ci=tree.query(points,predicate='dwithin',distance=4*max_deviation)
        mask=owners[ci]!=owner;pi=pi[mask];ci=ci[mask]
        if len(pi):
            distances=shapely.distance(points[pi],chunks[ci])
            np.minimum.at(radii,pi,distances/4)
        radii=np.maximum(0,radii-ROUNDING_RESERVE)
        result=[];corners=0
        for i,v in enumerate(vertices):
            if not closed and i in (0,len(vertices)-1):result.append(v);continue
            prev=vertices[(i-1)%len(vertices)];nxt=vertices[(i+1)%len(vertices)]
            incoming=prev-v;outgoing=nxt-v;li=np.linalg.norm(incoming);lo=np.linalg.norm(outgoing)
            r=min(radii[i],li*.25,lo*.25)
            if r<=ROUNDING_RESERVE or li==0 or lo==0:
                result.append(v);continue
            a=v+incoming*r/li;b=v+outgoing*r/lo
            curvature=np.linalg.norm(a-2*v+b)
            # Subpixel rounding is already within the flattening error budget.
            if curvature<=4*flatness:result.append(v);continue
            n=max(2,math.ceil(math.sqrt(curvature/(4*flatness))))
            for t in np.linspace(0,1,n+1):result.append(np.round((1-t)**2*a+2*(1-t)*t*v+t*t*b,3))
            corners+=1
        if closed:result.append(result[0])
        candidate=np.asarray(result)
        if not closed:candidate[0]=p[0];candidate[-1]=p[-1]
        line=LineString(candidate)
        valid=line.is_simple and (not closed or line.is_ring and LinearRing(candidate).is_ccw==LinearRing(p).is_ccw)
        if not valid:
            output.append(p);report['rejected']+=1
        else:
            output.append(candidate);report['smoothed']+=int(corners>0);report['corners']+=corners
    original_crossings=intersection_pairs(paths)
    new_crossings=intersection_pairs(output)-original_crossings
    if new_crossings:
        raise ValueError('Contour smoothing introduced intersections; retain the original cache')
    report['sourceIntersections']=len(original_crossings)
    report['newIntersections']=len(new_crossings)
    return output,report
