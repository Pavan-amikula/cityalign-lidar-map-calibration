import json
import time
from pathlib import Path
import numpy as np
from .data import scenario
from .core import calibrate,evaluate,collection,blocked
from .export import export_all


def execute(root, name="synthetic",seed=7,shift=4.,yaw=1.,height_bias=5.,density=1.,alignment=True,export=True):
    root=Path(root)
    start=time.perf_counter()
    points,classes,reference,stale,meta=scenario(root/"data",name,seed,shift,yaw,height_bias,density)
    corrected,observed,report=calibrate(points,classes,stale,alignment=alignment)
    report.update({"scenario":name,"seed":seed,"alignment":alignment,"before":evaluate(stale,reference),"after":evaluate(corrected,reference),"provenance":meta})
    ref_by_id={b.id:b for b in reference}; old_by_id={b.id:b for b in stale}; new_by_id={b.id:b for b in corrected}
    paired_ids=sorted(ref_by_id.keys() & old_by_id.keys() & new_by_id.keys())
    report["paired_existing_height"]={"count":len(paired_ids),"before_mae_m":float(np.mean([abs(old_by_id[k].height-ref_by_id[k].height) for k in paired_ids])),"after_mae_m":float(np.mean([abs(new_by_id[k].height-ref_by_id[k].height) for k in paired_ids])),"definition":"Same retained original object IDs in both stages; injected-corruption truth is used only for evaluation"}
    # Use the same fixed radio links for before/after/reference comparisons.
    bounds=np.array([b.footprint.bounds for b in reference])
    lo=bounds[:,:2].min(0)-20; hi=bounds[:,2:].max(0)+20
    base=float(np.median([b.base for b in reference]))
    tx=[float(lo[0]),float(lo[1]),base+22]
    receivers=[[float(x),float(y),base+1.5] for x in np.linspace(lo[0],hi[0],12) for y in np.linspace(lo[1],hi[1],12)]
    truth=np.array([blocked(tx,rx,reference) for rx in receivers])
    old=np.array([blocked(tx,rx,stale) for rx in receivers])
    new=np.array([blocked(tx,rx,corrected) for rx in receivers])
    report["visibility_proxy"]={"links":len(receivers),"before_disagreement":float(np.mean(old!=truth)),"after_disagreement":float(np.mean(new!=truth)),"description":"Binary LoS to a pseudo-reference for real data; no diffraction, reflection, material or RF power prediction"}
    complex_counts={str(c):int(np.sum(classes==c)) for c in [17,19,70,71,77] if np.any(classes==c)}
    report["complex_structure_review"]={"class_counts":complex_counts,"action":"review-only; LoD1 cannot represent bridges, overhangs, or vertical openings"}
    report["end_to_end_s"]=round(time.perf_counter()-start,4)
    idx=np.random.default_rng(101).choice(len(points),min(18000,len(points)),replace=False)
    view={"before":collection(stale),"after":collection(corrected),"reference":collection(reference),"evidence":collection(observed),"points":np.round(points[idx],2).tolist(),"classes":classes[idx].tolist(),"report":report,"links":{"tx":tx,"receivers":receivers,"before":old.tolist(),"after":new.tolist(),"reference":truth.tolist()}}
    if export:
        out=root/"results"/name
        out.mkdir(parents=True,exist_ok=True)
        report["exports"]=export_all(corrected,out)
        (out/"report.json").write_text(json.dumps(report,indent=2))
        (out/"viewer.json").write_text(json.dumps(view,separators=(",",":")))
        for key,buildings in [("before",stale),("reference",reference),("evidence",observed)]:
            (out/f"{key}.geojson").write_text(json.dumps(collection(buildings)))
        (out/"provenance.json").write_text(json.dumps(meta,indent=2))
    return view
