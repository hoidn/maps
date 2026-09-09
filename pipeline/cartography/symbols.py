"""Small original geometric public-facility icons, embedded and font independent."""
from html import escape
PATHS={
 'camp':'M-5,4 L0,-5 L5,4 Z M-6,5 H6','th':'M-4,-4 H4 V4 H-4 Z',
 'peak':'M-4,3 L0,-5 L4,3 Z','view':'M-5,0 Q0,-6 5,0 Q0,6 -5,0 Z',
 'spring':'M-5,3 Q-2,0 0,3 T5,3 M0,-4 V0','falls':'M-3,-5 V5 M0,-5 V5 M3,-5 V5',
 'water':'M0,-5 Q7,4 0,5 Q-7,4 0,-5 Z','shelter':'M-5,0 L0,-5 L5,0 M-4,-1 V5 H4 V-1',
 'lodge':'M-5,4 V-4 M-5,1 H5 V4 M-3,-1 H3 V1','bridge':'M-5,-4 V4 M5,-4 V4 M-5,-2 H5 M-5,2 H5',
 'parking':'M-3,5 V-5 H1 Q6,-5 4,0 H-3','info':'M0,-1 V5 M0,-5 V-4',
 'toilets':'M-3,-2 V5 M3,-2 V5 M-3,-5 V-4 M3,-5 V-4','food':'M-4,-5 V0 H0 V-5 M-2,-5 V5 M4,-5 V5',
 'ranger':'M0,-5 L5,-2 L3,4 L0,6 L-3,4 L-5,-2 Z','bus':'M-4,-4 H4 V4 H-4 Z M-4,0 H4',
 'shop':'M-5,-2 H5 V5 H-5 Z M-6,-2 L-4,-5 H4 L6,-2 M0,1 V5',
 'fuel':'M-4,5 V-5 H2 V5 M-4,-1 H2 M2,-3 H4 L5,-1 V3 Q5,5 3,3 M-5,5 H3',
 'bench':'M-5,0 H5 M-4,-4 H4 V-1 H-4 Z M-3,0 V5 M3,0 V5',
 'waste':'M-4,-3 H4 L3,5 H-3 Z M-5,-3 H5 M-2,-5 H2 M-1,-1 V3 M1,-1 V3',
 'saddle':'M-6,-3 Q0,5 6,-3 M-6,4 Q0,-4 6,4',
 'gate':'M-5,-5 V5 M5,-5 V5 M-5,-2 H5 V2 H-5 M-3,-2 V2 M0,-2 V2 M3,-2 V2',
 'barrier':'M-5,-4 V5 M5,-4 V5 M-5,-2 L5,2 M-5,2 L5,-2',
 'picnic':'M-5,-1 H5 M-3,-1 L-5,5 M3,-1 L5,5 M-6,3 H6',
 'telephone':'M-4,-5 L-1,-3 L-2,-1 Q-1,2 2,2 L3,1 L5,4 Q2,7 -2,3 Q-6,-1 -4,-5 Z',
 'ford':'M-6,-3 Q-3,-6 0,-3 T6,-3 M-6,3 Q-3,0 0,3 T6,3 M-2,-1 H2',
 'crossing':'M-5,-5 V5 M5,-5 V5 M-2,-4 H2 M-2,-1 H2 M-2,2 H2 M-2,5 H2',
 'historic':'M-5,0 L0,-5 L5,0 M-3,0 V5 M3,0 V5 M-5,5 H5','point':'M-2,0 A2,2 0 1 0 2,0 A2,2 0 1 0 -2,0'}
def camp_symbol(x=0.,y=0.):
 """One filled tent for every mapped campsite; color conveys no provider/status."""
 return f'<path class="s-camp" d="M{x-6:.1f},{y+4:.1f} L{x:.1f},{y-6.5:.1f} L{x+6:.1f},{y+4:.1f} Z"/><path class="s-camp-base" d="M{x-7.5:.1f},{y+4.5:.1f} H{x+7.5:.1f}"/>'

def symbol_svg(kind):
 if kind=='camp':return camp_symbol()
 return '<path class="facility-mark" d="'+PATHS.get(kind,PATHS['point'])+'"/>'
