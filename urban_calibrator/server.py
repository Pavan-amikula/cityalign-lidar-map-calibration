"""Local-only research workbench. No cloud service, keys, or telemetry."""
import json
import threading
from pathlib import Path
from flask import Flask,jsonify,request,send_from_directory
from .pipeline import execute


def app(root):
    root=Path(root).resolve()
    server=Flask(__name__,static_folder=str(root/"web"),static_url_path="/assets")
    lock=threading.Lock()

    @server.get("/")
    def index():
        return send_from_directory(root/"web","index.html")

    @server.get("/api/result/<scenario>")
    def result(scenario):
        if scenario not in ["synthetic","autzen"]:
            return jsonify(error="Unknown scenario"),400
        path=root/"results"/scenario/"viewer.json"
        if not path.exists():
            return jsonify(error="Run this scenario first"),404
        return server.response_class(path.read_text(),mimetype="application/json")

    @server.post("/api/calibrate")
    def run():
        data=request.get_json(silent=True) or {}
        if not lock.acquire(blocking=False):
            return jsonify(error="Calibration in progress; try again after it completes"),409
        try:
            name=data.get("scenario","synthetic")
            if name not in ["synthetic","autzen"]:
                raise ValueError("Invalid scenario")
            shift=float(data.get("shift",4)); yaw=float(data.get("yaw",1)); density=float(data.get("density",1))
            if not -15<=shift<=15 or not -5<=yaw<=5 or not .1<=density<=1:
                raise ValueError("Parameters outside supported range")
            view=execute(root,name,shift=shift,yaw=yaw,density=density,export=False)
            return jsonify(view)
        except (ValueError,FileNotFoundError) as error:
            return jsonify(error=str(error)),400
        finally:
            lock.release()

    @server.get("/api/download/<scenario>/<filename>")
    def download(scenario,filename):
        if scenario not in ["synthetic","autzen"] or filename not in ["calibrated.glb","calibrated.usdc","calibrated.geojson","calibrated.ply","scene.xml","report.json","provenance.json"]:
            return jsonify(error="Unknown artifact"),404
        return send_from_directory(root/"results"/scenario,filename,as_attachment=True)
    return server
