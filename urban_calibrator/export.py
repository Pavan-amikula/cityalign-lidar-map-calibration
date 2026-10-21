"""Interoperable LoD1 mesh outputs; no claim of RF material calibration."""
import json
from pathlib import Path
import numpy as np
import trimesh
from shapely import constrained_delaunay_triangles
from shapely.geometry.polygon import orient
from .core import collection


def mesh(buildings):
    vertices, faces = [], []
    def tri(coords):
        n=len(vertices); vertices.extend(coords); faces.append([n,n+1,n+2])
    for b in buildings:
        z0,z1=b.base,b.base+b.height
        footprint=orient(b.footprint,sign=1.)
        # Constrained triangulation keeps every concave boundary/hole edge;
        # filtering unconstrained Delaunay triangles can leave roof gaps.
        for t in constrained_delaunay_triangles(footprint).geoms:
            xy=list(orient(t,sign=1.).exterior.coords)[:3]
            tri([(x,y,z1) for x,y in xy])
            tri([(x,y,z0) for x,y in xy[::-1]])
        for ring in [footprint.exterior,*footprint.interiors]:
            pts=list(ring.coords)
            for (x,y),(u,v) in zip(pts,pts[1:]):
                tri([(x,y,z0),(u,v,z0),(u,v,z1)])
                tri([(x,y,z0),(u,v,z1),(x,y,z1)])
    return trimesh.Trimesh(np.array(vertices),np.array(faces),process=False)


def export_all(buildings, directory):
    directory=Path(directory); directory.mkdir(parents=True,exist_ok=True)
    (directory/"calibrated.geojson").write_text(json.dumps(collection(buildings),indent=2))
    m=mesh(buildings)
    m.export(directory/"calibrated.ply")
    # glTF has +Y up; right-handed ENU -> (east, up, -north).
    glb=m.copy()
    glb.vertices=np.c_[m.vertices[:,0],m.vertices[:,2],-m.vertices[:,1]]
    glb.export(directory/"calibrated.glb")
    xml='''<scene version="3.0.0">
  <integrator type="path"/>
  <bsdf type="diffuse" id="building"><rgb name="reflectance" value="0.55,0.6,0.65"/></bsdf>
  <shape type="ply" id="calibrated_city">
    <string name="filename" value="calibrated.ply"/>
    <ref id="building"/>
  </shape>
</scene>
'''
    (directory/"scene.xml").write_text(xml)
    status={"geojson":"written; local metric coordinates, not RFC7946 lon/lat","glb":"written; Y up, metres","mitsuba_xml":"written; Z up; diffuse optical material; validate with Mitsuba optional dependency"}
    try:
        from pxr import Usd,UsdGeom,Gf,Vt
        stage=Usd.Stage.CreateNew(str((directory/"calibrated.usdc").resolve()))
        UsdGeom.SetStageUpAxis(stage,UsdGeom.Tokens.z)
        UsdGeom.SetStageMetersPerUnit(stage,1.)
        obj=UsdGeom.Mesh.Define(stage,"/City")
        obj.CreatePointsAttr(Vt.Vec3fArray.FromNumpy(np.asarray(m.vertices,dtype=np.float32)))
        obj.CreateFaceVertexCountsAttr([3]*len(m.faces))
        obj.CreateFaceVertexIndicesAttr(m.faces.ravel().tolist())
        obj.CreateSubdivisionSchemeAttr("none")
        stage.SetDefaultPrim(obj.GetPrim()); stage.GetRootLayer().Save()
        status["usdc"]="written; binary USD crate, Z up, metres"
    except ImportError:
        status["usdc"]="unavailable; install usd-core (no disguised USDA fallback)"
    (directory/"export_status.json").write_text(json.dumps(status,indent=2))
    return status
