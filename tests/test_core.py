import numpy as np
import pytest
from pathlib import Path
from shapely.geometry import box,Polygon
from urban_calibrator.core import Building,register,transform,blocked,calibrate,evaluate
from urban_calibrator.data import synthetic,scenario
from urban_calibrator.export import export_all


def test_registration_known_pose():
    original=[Building("a",box(0,0,17,24),10),Building("b",box(35,42,67,59),20),Building("c",box(60,-30,77,-10),12)]
    angle=.025;r=np.array([[np.cos(angle),-np.sin(angle)],[np.sin(angle),np.cos(angle)]]);t=np.array([2.,-1.])
    shifted=transform(original,r,t);ri,ti,_=register(shifted,original,trim=1.)
    assert np.max(np.abs(ri@r-np.eye(2))) < .003
    assert np.linalg.norm(t@ri.T+ti) < .15


def test_calibration_corrects_known_synthetic_errors(tmp_path):
    pts,cls,ref,stale,_=scenario(tmp_path,seed=7)
    fixed,_,report=calibrate(pts,cls,stale)
    before,after=evaluate(stale,ref),evaluate(fixed,ref)
    assert after["height_mae_m"] < .15
    assert after["height_mae_m"] < before["height_mae_m"]
    assert after["mean_iou"] > before["mean_iou"]
    assert after["recall"] == 1
    assert any(c["action"]=="unsupported-with-ground-evidence" for c in report["changes"])


def test_unobserved_geometry_is_retained_for_review(tmp_path):
    pts,cls,ref,stale,_=scenario(tmp_path)
    stale.append(Building("unobserved",box(500,500,520,520),12))
    fixed,_,_=calibrate(pts,cls,stale)
    assert any(b.id=="unobserved" and b.status=="review-insufficient-evidence" for b in fixed)


def test_visibility_checks_actual_intersection_height():
    buildings=[Building("a",box(4,-1,6,1),10)]
    assert blocked([0,0,5],[10,0,5],buildings)
    assert not blocked([0,0,12],[10,0,12],buildings)
    assert not blocked([0,3,5],[10,3,5],buildings)
    # Segment crosses prism footprint only at heights ABOVE roof.
    assert not blocked([0,0,30],[10,0,15],buildings)
    assert blocked([5,0,0],[5,0,20],buildings)


def test_no_ground_does_not_invent_height():
    with pytest.raises(ValueError,match="ground"):
        calibrate(np.ones((20,3)),np.full(20,6),[Building("a",box(0,0,10,10),10)])


def test_exports_roundtrip_and_hole(tmp_path):
    import trimesh
    from urban_calibrator.export import mesh
    p=Polygon([(0,0),(20,0),(20,20),(0,20)],holes=[[(5,5),(5,15),(15,15),(15,5)]])
    building=Building("courtyard",p,12)
    m=mesh([building]); roof=m.triangles[np.all(np.isclose(m.triangles[:,:,2],12),axis=1)]
    area=sum(np.linalg.norm(np.cross(t[1]-t[0],t[2]-t[0]))/2 for t in roof)
    assert area==pytest.approx(p.area)
    merged=m.copy();merged.merge_vertices()
    assert merged.is_watertight
    assert merged.is_winding_consistent
    assert merged.volume==pytest.approx(p.area*12)
    export_all([building],tmp_path)
    scene=trimesh.load(tmp_path/"calibrated.glb")
    assert scene.bounds[1,1]==pytest.approx(12)
    assert scene.bounds[0,2]==pytest.approx(-20)
    if (tmp_path/"calibrated.usdc").exists():
        from pxr import Usd,UsdGeom
        assert (tmp_path/"calibrated.usdc").read_bytes().startswith(b"PXR-USDC")
        stage=Usd.Stage.Open(str(tmp_path/"calibrated.usdc"))
        assert UsdGeom.GetStageMetersPerUnit(stage)==1.
        assert len(UsdGeom.Mesh(stage.GetPrimAtPath("/City")).GetPointsAttr().Get())>0


def test_concave_roof_is_closed_and_outward():
    from urban_calibrator.export import mesh
    p=Polygon([(0,0),(20,0),(20,5),(7,5),(7,20),(0,20)])
    # Deliberately clockwise to exercise normalized exterior winding.
    m=mesh([Building("concave",Polygon(list(p.exterior.coords)[::-1]),10)])
    m.merge_vertices()
    assert m.is_watertight and m.is_winding_consistent
    assert m.volume==pytest.approx(p.area*10)


def test_server_validation_and_saved_artifact_scope(tmp_path):
    from urban_calibrator.server import app
    client=app(tmp_path).test_client()
    assert client.get("/api/result/unknown").status_code==400
    assert client.post("/api/calibrate",json={"shift":100}).status_code==400
    assert client.get("/api/download/autzen/secrets.txt").status_code==404


def test_tile_seam_ownership():
    from urban_calibrator.spatial import extract_tiles
    pts,cls,truth,_=synthetic(7)
    objects,report=extract_tiles(pts,cls,tile_size=70,halo=40)
    assert len(objects)==len(truth)
    assert evaluate(objects,truth)["recall"]==1
    assert len({b.id for b in objects})==len(objects)


def test_street_qa_flags_conflict_without_inferring_road():
    from urban_calibrator.spatial import street_qa
    road={"type":"Feature","properties":{"id":"main"},"geometry":{"type":"LineString","coordinates":[[-5,5],[20,5]]}}
    b=Building("obstruction",box(0,0,10,10),12)
    points=np.array([[0,5,0],[1,5,12],[20,5,0]],float);classes=np.array([2,6,2])
    row=street_qa([road],[b],points,classes)[0]
    assert row["building_conflicts"]==["obstruction"]
    assert row["action"]=="review-conflict"
