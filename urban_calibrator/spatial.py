"""Bounded-raster extraction and optional street geometry diagnostics."""
import time
import numpy as np
from shapely import contains_xy
from shapely.geometry import shape
from .core import extract,iou


def extract_tiles(points,classes,tile_size=300.,halo=80.,cell=1.5):
    """Extract with overlapping tiles and deterministic centroid ownership.

    Input arrays remain resident in memory. Tile masks bound raster work, not
    the input cloud's memory. Oversized boundary structures are skipped and
    explicitly counted; this is not a full distributed reconstruction system.
    """
    if tile_size<=0 or halo<cell*2:
        raise ValueError("Positive tile size and halo >= 2 cells required")
    start=time.perf_counter()
    roofs=points[classes==6]
    tile_ids=np.unique(np.floor(roofs[:,:2]/tile_size).astype(int),axis=0)
    accepted=[];records=[]
    for tile_id in tile_ids:
        lo=tile_id*tile_size;hi=lo+tile_size
        keep=np.all(points[:,:2]>=lo-halo,axis=1)&np.all(points[:,:2]<hi+halo,axis=1)
        pts,cls=points[keep],classes[keep]
        row={"tile":tile_id.tolist(),"points":len(pts),"accepted":0,"skipped_boundary":0}
        if (cls==2).sum()<3 or (cls==6).sum()<10:
            row["status"]="insufficient-classified-evidence";records.append(row);continue
        objects=extract(pts,cls,cell)
        for obj in objects:
            c=np.array(obj.footprint.centroid.coords[0])
            if not np.all((c>=lo)&(c<hi)):
                continue
            bounds=np.array(obj.footprint.bounds)
            if np.any(bounds[:2]<=lo-halo+2*cell) or np.any(bounds[2:]>=hi+halo-2*cell):
                row["skipped_boundary"]+=1;continue
            if any(iou(obj.footprint,x.footprint)>.5 for x in accepted):
                continue
            obj.id=f"tile-{tile_id[0]}-{tile_id[1]}-{row['accepted']}"
            accepted.append(obj);row["accepted"]+=1
        row["status"]="complete";records.append(row)
    return accepted,{"elapsed_s":round(time.perf_counter()-start,4),"input_points":len(points),"tile_size_m":tile_size,"halo_m":halo,"buildings":len(accepted),"tiles":records,"limitations":"In-memory point arrays; bounded per-tile rasters; centroid ownership; structures exceeding halo skipped, not reconstructed"}


def street_qa(features,buildings,points,classes,half_width=3.):
    """Audit supplied street corridors against building geometry and returns.

    Ground is not a road class. This reports conflict evidence only and does
    not infer road semantics or change street alignments.
    """
    ground=points[classes==2];roof=points[classes==6];rows=[]
    for i,feature in enumerate(features):
        line=shape(feature["geometry"])
        if line.geom_type not in ["LineString","MultiLineString"]:
            raise ValueError("Street geometry must be LineString/MultiLineString in local metres")
        corridor=line.buffer(half_width)
        conflicts=[b.id for b in buildings if corridor.intersection(b.footprint).area>1.]
        rows.append({"street_id":feature.get("properties",{}).get("id",str(i)),"corridor_half_width_m":half_width,"building_conflicts":conflicts,"ground_returns":int(contains_xy(corridor,ground[:,0],ground[:,1]).sum()),"roof_returns":int(contains_xy(corridor,roof[:,0],roof[:,1]).sum()),"action":"review-conflict" if conflicts else "no-building-conflict","caution":"Ground returns are not proof of a street; bridge height separation requires 3D road geometry"})
    return rows
