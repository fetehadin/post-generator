import json, math
from wordmark import build, load, glyph_path
KERN={"vo":-0.012,"ox":-0.004,"xl":-0.012,"ac":0.006}
SPEC=dict(font="Outfit",wght=700,tracking=-0.035,corner="bl",radius=0.02,kern=KERN)
wm=build(**SPEC)
mark=build(**{**SPEC,"o_only":True})
# split wordmark so the o can take the accent colour: build each letter alone with same offsets
f=load("Outfit",700)
def squircle(size,n=5,steps=180):
    a=size/2; pts=[]
    for i in range(steps):
        t=2*math.pi*i/steps; c,s=math.cos(t),math.sin(t)
        x=a+a*math.copysign(abs(c)**(2/n),c); y=a+a*math.copysign(abs(s)**(2/n),s)
        pts.append(f"{x:.2f} {y:.2f}")
    return "M"+" L".join(pts)+"Z"
json.dump({"wm":wm,"mark":mark,"squircle":squircle(100)},open("assets/paths.json","w"))
print(wm["w"],wm["h"],wm["baseline"],len(wm["d"]),"| mark",mark["w"],mark["h"],len(mark["d"]))
