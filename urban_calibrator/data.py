"""Deterministic fixtures and provenance-preserving real LAZ ingestion."""
import hashlib
import json
from pathlib import Path
from dataclasses import replace
import numpy as np
from shapely.geometry import box
from .core import Building, extract, transform

URL = "https://media.githubusercontent.com/media/PDAL/data/main/autzen/autzen-classified.laz"
SHA256 = "c8828215facfb4c9465c9a7db9d45cf2c0e9175a6eb5b21e89417978cc85cd51"


def download(root):
    import requests
    root.mkdir(parents=True, exist_ok=True)
    path = root / "autzen-classified.laz"
    if not path.exists():
        tmp = path.with_suffix(".part")
        with requests.get(URL, stream=True, timeout=120) as response:
            response.raise_for_status()
            with tmp.open("wb") as file:
                for chunk in response.iter_content(1024*1024):
                    file.write(chunk)
        tmp.replace(path)
    if hashlib.sha256(path.read_bytes()).hexdigest() != SHA256:
        raise ValueError("Dataset checksum mismatch")
    return path


def prepare_real(root):
    import laspy
    path = download(root)
    cache = root / "autzen-crop.npz"
    if cache.exists():
        return cache
    chunks, codes = [], []
    with laspy.open(path) as file:
        crs = file.header.parse_crs()
        # Header horizontal axes are international ft; vertical axis is US ft.
        factors = np.array([a.unit_conversion_factor for a in crs.axis_info])
        if len(factors) != 3:
            raise ValueError("Expected projected horizontal + vertical CRS")
        origin = file.header.mins * factors
        for block in file.chunk_iterator(500_000):
            xyz = np.c_[block.x, block.y, block.z] * factors - origin
            cls = np.asarray(block.classification)
            keep = (xyz[:,0] >= 80) & (xyz[:,0] <= 980) & (xyz[:,1] >= 650) & (xyz[:,1] <= 1410)
            # Retain all roof/complex returns and every eighth other return.
            keep &= (cls == 6) | np.isin(cls, [17,19,70,71,77]) | (np.arange(len(cls)) % 8 == 0)
            chunks.append(xyz[keep]); codes.append(cls[keep])
    points, classes = np.concatenate(chunks), np.concatenate(codes)
    metadata = {"source":URL,"sha256":SHA256,"source_crs_wkt":crs.to_wkt(),"axis_to_m":factors.tolist(),"origin_source_m":origin.tolist(),"crop_local_m":[80,650,980,1410],"sampling":"all building/complex returns; every eighth other return","license":"CC BY 4.0","attribution":"Watershed Sciences / Aaron Reyna (2010); Hobu / Max Sampson classifications (2021); PDAL/data"}
    np.savez_compressed(cache, points=points, classes=classes, metadata=json.dumps(metadata))
    (root / "provenance.json").write_text(json.dumps(metadata,indent=2))
    return cache


def synthetic(seed=7):
    rng = np.random.default_rng(seed)
    buildings, chunks, labels = [], [], []
    for i in range(4):
        for j in range(4):
            x, y = 25+i*55+rng.uniform(-4,4), 25+j*55+rng.uniform(-4,4)
            w, d, h = rng.uniform(18,33), rng.uniform(18,32), rng.uniform(7,36)
            p = box(x,y,x+w,y+d)
            buildings.append(Building(f"b-{i}-{j}",p,h))
            xx, yy = np.meshgrid(np.arange(x+.2,x+w,.65),np.arange(y+.2,y+d,.65))
            z = h+rng.normal(0,.09,xx.size)
            chunks.append(np.c_[xx.ravel(),yy.ravel(),z]); labels.extend([6]*xx.size)
    xx,yy = np.meshgrid(np.arange(0,260,1.4),np.arange(0,260,1.4))
    ground = np.c_[xx.ravel(), yy.ravel(), rng.normal(0,.03,xx.size)]
    from shapely import contains_xy
    keep = np.ones(len(ground),bool)
    for b in buildings:
        keep &= ~contains_xy(b.footprint,ground[:,0],ground[:,1])
    chunks.append(ground[keep]); labels.extend([2]*keep.sum())
    return np.concatenate(chunks),np.array(labels,dtype=np.uint8),buildings,{"source":"seeded synthetic flat-roof city","seed":seed,"independent_truth":True}


def scenario(root, name="synthetic", seed=7, shift=4., yaw=1., height_bias=5., density=1.):
    rng = np.random.default_rng(seed)
    if name == "autzen":
        data = np.load(prepare_real(root))
        pts, cls = data["points"], data["classes"]
        meta = json.loads(str(data["metadata"]))
        split = rng.random(len(pts)) < .5
        # Reference only uses one half. Estimator receives the other half.
        reference = extract(pts[split],cls[split])
        pts, cls = pts[~split],cls[~split]
        meta.update({"reference":"LiDAR-derived pseudo-reference, disjoint random point split; shared classification and acquisition","independent_truth":False,"split_seed":seed})
    elif name == "synthetic":
        pts, cls, reference, meta = synthetic(seed)
    else:
        raise ValueError("Unknown scenario")
    if not 0.1 <= density <= 1:
        raise ValueError("density must lie in [0.1,1]")
    keep = rng.random(len(pts)) < density
    pts, cls = pts[keep],cls[keep]
    # Missing maps: omit 1 in 6 reference footprints; heights biased per object.
    stale = [replace(b,height=max(2,b.height+height_bias+rng.normal(0,1.))) for i,b in enumerate(reference) if i%6 != 0]
    # Known spurious footprint in a ground-supported area (no roof intersections).
    from shapely import contains_xy
    roof=pts[cls==6]; ground=pts[cls==2]
    for g in ground[::max(1,len(ground)//200)]:
        p=box(g[0]-6,g[1]-6,g[0]+6,g[1]+6)
        if not any(p.intersects(b.footprint.buffer(3)) for b in reference) and contains_xy(p,ground[:,0],ground[:,1]).sum() >= 15:
            stale.append(Building("injected-spurious",p,12.,float(g[2])))
            break
    theta=np.radians(yaw)
    r=np.array([[np.cos(theta),-np.sin(theta)],[np.sin(theta),np.cos(theta)]])
    t=np.array([shift,-.7*shift])
    stale=transform(stale,r,t)
    meta["injected_errors"]={"yaw_deg":yaw,"translation_m":t.tolist(),"height_bias_m":height_bias,"omitted_every_nth_building":6,"spurious_buildings":int(any(b.id=="injected-spurious" for b in stale)),"retained_density":density}
    return pts,cls,reference,stale,meta
