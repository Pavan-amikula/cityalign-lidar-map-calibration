"""Metric, local-ENU-like coordinates: x/east, y/north, z/up in metres.

The estimator never receives the reference map. Classification is an INPUT,
not the output of a learned semantic model. Only planar pose is optimized.
"""
from dataclasses import dataclass, replace
import time
import numpy as np
from scipy import ndimage
from scipy.spatial import cKDTree
from scipy.optimize import linear_sum_assignment
from shapely.geometry import Polygon, box, mapping, shape, Point, LineString
from shapely.ops import unary_union
from shapely.affinity import affine_transform
from shapely import contains_xy


@dataclass
class Building:
    id: str
    footprint: Polygon
    height: float
    base: float = 0.0
    status: str = "original"
    confidence: float = 0.0
    support: int = 0

    def feature(self):
        return {"type": "Feature", "geometry": mapping(self.footprint), "properties": {
            "id": self.id, "height": round(float(self.height), 3), "base": round(float(self.base), 3),
            "status": self.status, "confidence": round(float(self.confidence), 3), "support": int(self.support)}}


def load_map(path):
    import json
    data = json.loads(path.read_text(encoding="utf-8"))
    return [Building(str(f["properties"].get("id", i)), shape(f["geometry"]),
                     float(f["properties"]["height"]), float(f["properties"].get("base", 0)))
            for i, f in enumerate(data["features"])]


def collection(buildings):
    return {"type": "FeatureCollection", "features": [b.feature() for b in buildings]}


def extract(points, classes, cell=1.5, min_area=35):
    """Raster connected components of class-6 returns; ground-normalized heights.

    Closing joins sampling gaps but may merge adjacent roofs. No reconstruction
    of roof facets, overhangs, or unobserved facades is claimed.
    """
    if len(points) == 0 or not np.isfinite(points).all():
        raise ValueError("Point cloud must contain finite XYZ coordinates")
    roof = points[classes == 6]
    ground = points[classes == 2]
    if len(ground) < 3 or len(roof) < 10:
        raise ValueError("Need classified ground (2) and building (6) returns")
    origin = np.floor(roof[:, :2].min(0) / cell) * cell - 2 * cell
    ij = np.floor((roof[:, :2] - origin) / cell).astype(int)
    dims = ij.max(0) + 3
    if np.prod(dims) > 12_000_000:
        raise ValueError("Tile exceeds raster budget; split into overlapping metric tiles")
    mask = np.zeros(dims, bool)
    mask[ij[:, 0], ij[:, 1]] = True
    mask = ndimage.binary_closing(mask, iterations=1)
    labels, _ = ndimage.label(mask)
    ground_tree = cKDTree(ground[:, :2])
    result = []
    for label, sl in enumerate(ndimage.find_objects(labels), 1):
        if sl is None:
            continue
        indices = np.argwhere(labels[sl] == label) + [sl[0].start, sl[1].start]
        if len(indices) * cell * cell < min_area:
            continue
        poly = unary_union([box(*(origin + p * cell), *(origin + (p + 1) * cell)) for p in indices])
        poly = poly.simplify(cell * .4, preserve_topology=True)
        if poly.geom_type != "Polygon" or not poly.is_valid:
            continue
        inside = contains_xy(poly.buffer(cell * .4), roof[:, 0], roof[:, 1])
        rp = roof[inside]
        if len(rp) < 10:
            continue
        _, nn = ground_tree.query(rp[:, :2], k=min(5, len(ground)))
        terrain = np.median(ground[nn, 2], axis=1)
        base = float(np.median(terrain))
        height = float(np.percentile(rp[:, 2] - terrain, 75))
        if 2 <= height <= 200:
            result.append(Building(f"lidar-{len(result):03}", poly, height, base, "observed", 1., len(rp)))
    return result


def boundary_samples(buildings, spacing=1.5):
    samples = []
    for b in buildings:
        line = b.footprint.exterior
        samples.extend([line.interpolate(d).coords[0] for d in np.linspace(0, line.length, max(12, int(line.length / spacing)), endpoint=False)])
    return np.asarray(samples).reshape(-1, 2)


def register(source, target, trim=.75, iterations=60):
    """Trimmed point-to-point SE(2) ICP. Returns map->evidence transform.

    Local convergence only; repeated urban layouts and large initial offsets
    require georeferencing or a coarse global registration stage.
    """
    a, b = boundary_samples(source), boundary_samples(target)
    if len(a) < 6 or len(b) < 6:
        raise ValueError("Registration needs nonempty building geometry")
    tree = cKDTree(b)
    r, t = np.eye(2), np.zeros(2)
    history = []
    for _ in range(iterations):
        moved = a @ r.T + t
        d, ids = tree.query(moved)
        keep = d <= min(np.quantile(d, trim), 30.)
        if keep.sum() < 6:
            raise ValueError("Insufficient registration overlap within 30 m")
        x, y = moved[keep], b[ids[keep]]
        xc, yc = x.mean(0), y.mean(0)
        u, _, vt = np.linalg.svd((x - xc).T @ (y - yc))
        dr = vt.T @ u.T
        if np.linalg.det(dr) < 0:
            vt[-1] *= -1
            dr = vt.T @ u.T
        dt = yc - xc @ dr.T
        r, t = dr @ r, t @ dr.T + dt
        history.append(float(np.sqrt(np.mean(d[keep] ** 2))))
        if np.linalg.norm(dt) < 1e-5 and np.linalg.norm(dr - np.eye(2)) < 1e-6:
            break
    return r, t, history


def transform(buildings, r, t):
    return [replace(b, footprint=affine_transform(b.footprint, [r[0,0], r[0,1], r[1,0], r[1,1], t[0], t[1]])) for b in buildings]


def iou(a, b):
    return a.intersection(b).area / max(a.union(b).area, 1e-9)


def match(a, b, threshold=.2):
    if not a or not b:
        return []
    scores = np.array([[iou(x.footprint, y.footprint) for y in b] for x in a])
    rows, cols = linear_sum_assignment(-scores)
    return [(int(i), int(j), float(scores[i,j])) for i, j in zip(rows, cols) if scores[i,j] >= threshold]


def calibrate(points, classes, stale, cell=1.5, alignment=True, trim=.75):
    start = time.perf_counter()
    observed = extract(points, classes, cell)
    if not observed:
        raise ValueError("No usable buildings extracted")
    r, t, history = register(stale, observed, trim) if alignment else (np.eye(2), np.zeros(2), [])
    aligned = transform(stale, r, t)
    pairs = match(aligned, observed)
    used_a, used_b = {i for i,j,s in pairs}, {j for i,j,s in pairs}
    corrected, changes = [], []
    for i, j, score in pairs:
        old, obs = aligned[i], observed[j]
        # Preserve the map footprint: raster evidence is not a cadastral boundary.
        corrected.append(replace(old, height=obs.height, base=obs.base, status="height-calibrated", confidence=score, support=obs.support))
        changes.append({"id": old.id, "action": "height-calibrated", "delta_height_m": round(obs.height-old.height,3), "iou": round(score,3), "support": obs.support})
    ground = points[classes == 2]
    roof = points[classes == 6]
    for i, old in enumerate(aligned):
        if i in used_a:
            continue
        n_ground = int(contains_xy(old.footprint, ground[:,0], ground[:,1]).sum())
        n_roof = int(contains_xy(old.footprint, roof[:,0], roof[:,1]).sum())
        status = "unsupported-with-ground-evidence" if n_ground >= 15 and n_roof < 3 else "review-insufficient-evidence"
        if status.startswith("review"):
            corrected.append(replace(old, status=status))
        changes.append({"id":old.id,"action":status,"ground_returns":n_ground,"building_returns":n_roof})
    for j, obs in enumerate(observed):
        if j not in used_b:
            corrected.append(replace(obs, id="candidate-"+obs.id, status="missing-building-candidate", confidence=.6))
            changes.append({"id": "candidate-"+obs.id, "action":"missing-building-candidate", "support":obs.support})
    return corrected, observed, {"elapsed_s":round(time.perf_counter()-start,4), "rotation_deg":float(np.degrees(np.arctan2(r[1,0],r[0,0]))), "translation_m":t.tolist(), "icp_rmse_history_m":history,"changes":changes,"input_points":len(points),"observed_buildings":len(observed),"matched_buildings":len(pairs),"model":"SE(2) + robust roof-height estimation; LoD1 extrusions"}


def evaluate(candidate, reference):
    pairs = match(candidate, reference)
    errors = [candidate[i].height-reference[j].height for i,j,s in pairs]
    return {"matched":len(pairs), "precision":len(pairs)/max(len(candidate),1), "recall":len(pairs)/max(len(reference),1),
            "mean_iou":float(np.mean([s for i,j,s in pairs])) if pairs else 0.,
            "height_mae_m":float(np.mean(np.abs(errors))) if errors else None,
            "height_rmse_m":float(np.sqrt(np.mean(np.square(errors)))) if errors else None}


def blocked(tx, rx, buildings):
    """Prism segment intersection. Visibility proxy, NOT a propagation solver."""
    a, b = np.asarray(tx,float), np.asarray(rx,float)
    line = LineString([a[:2],b[:2]])
    length = line.length
    if length == 0:
        return any(x.footprint.covers(Point(a[:2])) and max(a[2],b[2]) >= x.base and min(a[2],b[2]) <= x.base+x.height for x in buildings)
    for obj in buildings:
        inter = line.intersection(obj.footprint)
        if inter.is_empty:
            continue
        parts = list(inter.geoms) if hasattr(inter,"geoms") else [inter]
        for part in parts:
            if not hasattr(part,"coords"):
                continue
            z = [a[2]+line.project(Point(p))/length*(b[2]-a[2]) for p in part.coords]
            if z and max(z) >= obj.base and min(z) <= obj.base+obj.height:
                return True
    return False
