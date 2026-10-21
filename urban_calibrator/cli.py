import argparse
import json
from pathlib import Path
import numpy as np
from .pipeline import execute
from .data import prepare_real
from .core import load_map,calibrate
from .export import export_all


def main():
    parser=argparse.ArgumentParser(description="CityAlign local metric LiDAR map calibration")
    parser.add_argument("command",choices=["demo","download","serve","calibrate","extract-tiles"])
    parser.add_argument("--root",type=Path,default=Path.cwd())
    parser.add_argument("--scenario",choices=["synthetic","autzen"],default="synthetic")
    parser.add_argument("--seed",type=int,default=7)
    parser.add_argument("--points",type=Path,help="NPZ with points Nx3 metres, classes N (ASPRS 2/6)")
    parser.add_argument("--map",type=Path,help="Local metric Polygon FeatureCollection; height/base properties")
    parser.add_argument("--output",type=Path,default=Path("results/custom"))
    parser.add_argument("--port",type=int,default=8846)
    parser.add_argument("--streets",type=Path,help="Optional local metric street-centerline GeoJSON for conflict QA")
    parser.add_argument("--tile-size",type=float,default=300.)
    parser.add_argument("--halo",type=float,default=80.)
    args=parser.parse_args()
    if args.command=="download":
        print(prepare_real(args.root/"data"))
    elif args.command=="serve":
        from .server import app
        app(args.root).run(host="127.0.0.1",port=args.port,threaded=True)
    elif args.command=="extract-tiles":
        if not args.points:
            parser.error("extract-tiles requires --points")
        from .spatial import extract_tiles
        from .core import collection
        data=np.load(args.points,allow_pickle=False)
        objects,report=extract_tiles(data["points"],data["classes"],args.tile_size,args.halo)
        args.output.mkdir(parents=True,exist_ok=True)
        (args.output/"observed.geojson").write_text(json.dumps(collection(objects)))
        (args.output/"tile_report.json").write_text(json.dumps(report,indent=2))
        print(json.dumps(report,indent=2))
    elif args.command=="calibrate":
        if not args.points or not args.map:
            parser.error("calibrate requires --points and --map")
        data=np.load(args.points,allow_pickle=False)
        pts,cls=data["points"],data["classes"]
        if pts.ndim!=2 or pts.shape[1]!=3 or len(cls)!=len(pts):
            parser.error("points must be Nx3 and classes must have length N")
        result,_,report=calibrate(pts,cls,load_map(args.map))
        if args.streets:
            from .spatial import street_qa
            features=json.loads(args.streets.read_text(encoding="utf-8"))["features"]
            report["street_qa"]=street_qa(features,result,pts,cls)
        export_all(result,args.output)
        (args.output/"report.json").write_text(json.dumps(report,indent=2))
        print(json.dumps(report,indent=2))
    else:
        print(json.dumps(execute(args.root,args.scenario,args.seed)["report"],indent=2))


if __name__=="__main__":
    main()
