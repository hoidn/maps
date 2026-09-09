"""SVG detail for the 14x explorer; distances are natural map units.

A 0.025-unit simplification tolerance plus three-decimal coordinate rounding
keeps path error below 0.5 map pixels at 14x at the natural sheet width.
This preserves source geometry; it does not smooth or add geographic detail.
"""
import numpy as np
from skimage.measure import approximate_polygon

DETAIL_TOLERANCE = 0.025
GEOMETRY_VERSION = 1


def detail_points(points, tolerance=DETAIL_TOLERANCE):
    points = np.asarray(points, dtype=float)
    return approximate_polygon(points, min(tolerance, DETAIL_TOLERANCE)) if len(points) > 2 else points


def detail_path(points, tolerance=DETAIL_TOLERANCE):
    return 'M' + ' '.join(f'{x:.3f},{y:.3f}' for x, y in detail_points(points, tolerance))
