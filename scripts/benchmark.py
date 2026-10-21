"""Reproducible multi-seed ablations; records failures instead of dropping them."""
import csv
import json
import platform
import sys
from pathlib import Path
import importlib.metadata
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from urban_calibrator.pipeline import execute

ROOT=Path(__file__).resolve().parents[1]


def main():
    rows=[]
    cases=[("standard",True,1.,4.,1.),("no_alignment",False,1.,4.,1.),("density_25pct",True,.25,4.,1.),("large_offset",True,1.,12.,3.)]
    for scenario in ["synthetic","autzen"]:
        for seed in [7,11,23]:
            for label,align,density,shift,yaw in cases:
                row={"scenario":scenario,"seed":seed,"case":label,"alignment":align,"density":density,"shift_m":shift,"yaw_deg":yaw}
                try:
                    r=execute(ROOT,scenario,seed,shift,yaw,density=density,alignment=align,export=False)["report"]
                    row.update({"status":"ok","points":r["input_points"],"calibration_s":r["elapsed_s"],"mean_iou_before":r["before"]["mean_iou"],"mean_iou_after":r["after"]["mean_iou"],"height_mae_before_m":r["before"]["height_mae_m"],"height_mae_after_m":r["after"]["height_mae_m"],"recall_before":r["before"]["recall"],"recall_after":r["after"]["recall"],"paired_height_before_m":r["paired_existing_height"]["before_mae_m"],"paired_height_after_m":r["paired_existing_height"]["after_mae_m"],"los_before":r["visibility_proxy"]["before_disagreement"],"los_after":r["visibility_proxy"]["after_disagreement"]})
                except Exception as error:
                    row.update({"status":"failed","error":str(error)})
                rows.append(row)
                print(scenario,seed,label,row["status"],flush=True)
    out=ROOT/"results"; out.mkdir(exist_ok=True)
    (out/"benchmark.json").write_text(json.dumps(rows,indent=2))
    fields=list(dict.fromkeys(k for row in rows for k in row))
    with (out/"benchmark.csv").open("w",newline="") as f:
        writer=csv.DictWriter(f,fieldnames=fields);writer.writeheader();writer.writerows(rows)
    env={"python":sys.version,"platform":platform.platform(),"processor":platform.processor(),"packages":{name:importlib.metadata.version(name) for name in ["numpy","scipy","shapely","laspy","trimesh","flask","pyproj","usd-core"]},"timing":"Calibration includes evidence extraction, registration, matching; excludes data preparation, visibility evaluation and export. Single machine; no real-time deadline guarantee."}
    (out/"environment.json").write_text(json.dumps(env,indent=2))
    summary=[]
    for scenario in ["synthetic","autzen"]:
        for label,*_ in cases:
            group=[r for r in rows if r["scenario"]==scenario and r["case"]==label and r["status"]=="ok"]
            s={"scenario":scenario,"case":label,"successful_runs":len(group),"total_runs":3}
            for metric in ["mean_iou_after","paired_height_after_m","recall_after","calibration_s","los_after"]:
                a=[r[metric] for r in group];s[metric]={"mean":float(np.mean(a)),"std":float(np.std(a)),"min":float(np.min(a)),"max":float(np.max(a))} if a else None
            summary.append(s)
    (out/"benchmark_summary.json").write_text(json.dumps(summary,indent=2))
    plt.style.use('dark_background');fig,axes=plt.subplots(1,3,figsize=(13,4),layout='constrained');fig.patch.set_facecolor('#101823')
    for ax,metric,title in zip(axes,["mean_iou_after","paired_height_after_m","los_after"],["Footprint IoU ↑","Paired height MAE (m) ↓","Visibility disagreement ↓"]):
        for i,scenario in enumerate(["synthetic","autzen"]):
            group=[s for s in summary if s["scenario"]==scenario];x=np.arange(4)+(i-.5)*.36
            ax.bar(x,[g[metric]["mean"] for g in group],width=.34,yerr=[g[metric]["std"] for g in group],label=scenario,color=['#36d5b4','#a9abff'][i],capsize=3)
        ax.set_xticks(range(4),['Standard','No pose','25% density','Large offset'],rotation=18,ha='right',fontsize=8);ax.set_title(title,fontsize=12);ax.set_facecolor('#101823');ax.spines[['top','right']].set_visible(False);ax.tick_params(labelsize=8)
    axes[0].legend(fontsize=8);fig.suptitle('CityAlign | 3 seeds per condition · real LiDAR uses a pseudo-reference',fontsize=13)
    fig.savefig(out/"benchmark.png",dpi=180);plt.close(fig)
    print(json.dumps(summary,indent=2))


if __name__=="__main__":main()
