"""Measured spatial extraction stress test on repeated synthetic geometry."""
import json
from pathlib import Path
import numpy as np
from urban_calibrator.data import synthetic
from urban_calibrator.spatial import extract_tiles
from urban_calibrator.core import collection

ROOT=Path(__file__).resolve().parents[1]


def main():
    pts,cls,_,_=synthetic(7)
    rows=[]
    for n in [1,2,4]:
        clouds=[pts+[i*300,j*300,0] for i in range(n) for j in range(n)]
        points=np.concatenate(clouds);classes=np.tile(cls,n*n)
        objects,report=extract_tiles(points,classes)
        report.update({"fixture":"repeated synthetic blocks, not independent real geography","expected_buildings":16*n*n,"area_envelope_km2":(300*n/1000)**2})
        rows.append(report)
        print(n,len(points),len(objects),report["elapsed_s"],flush=True)
        if n==4:
            (ROOT/"results"/"tiled-observed.geojson").write_text(json.dumps(collection(objects)))
    (ROOT/"results"/"scaling.json").write_text(json.dumps(rows,indent=2))


if __name__=="__main__":main()
