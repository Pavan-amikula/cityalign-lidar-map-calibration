"""Round-trip the actual committed outputs; optional Mitsuba load."""
import json
from pathlib import Path
import numpy as np
import trimesh
from pxr import Usd,UsdGeom

ROOT=Path(__file__).resolve().parents[1]


def main():
    results=[]
    for name in ['synthetic','autzen']:
        out=ROOT/'results'/name
        scene=trimesh.load(out/'calibrated.glb')
        stage=Usd.Stage.Open(str(out/'calibrated.usdc'))
        usd=UsdGeom.Mesh(stage.GetPrimAtPath('/City'))
        verts=np.array(usd.GetPointsAttr().Get())
        assert len(verts)>0
        assert UsdGeom.GetStageUpAxis(stage)=='Z'
        assert UsdGeom.GetStageMetersPerUnit(stage)==1.
        assert (out/'calibrated.usdc').read_bytes().startswith(b'PXR-USDC')
        glb_bounds=np.c_[verts[:,0],verts[:,2],-verts[:,1]]
        assert np.allclose(scene.bounds,np.array([glb_bounds.min(0),glb_bounds.max(0)]),atol=.001)
        loaded_mesh=trimesh.load(out/'calibrated.ply',force='mesh');loaded_mesh.merge_vertices()
        assert loaded_mesh.is_watertight and loaded_mesh.is_winding_consistent
        row={'scenario':name,'glb':'loaded; metric axis bounds verified','usdc':'opened with OpenUSD; binary magic, units, up-axis verified','mesh':'watertight with consistent winding after vertex merging','vertices':len(verts)}
        try:
            import mitsuba as mi
            mi.set_variant('scalar_rgb')
            mitsuba_scene=mi.load_file(str(out/'scene.xml'))
            assert len(mitsuba_scene.shapes())==1
            row['mitsuba']='loaded XML and PLY using scalar_rgb; 1 shape'
        except ImportError:
            row['mitsuba']='not installed; XML only'
        results.append(row)
    (ROOT/'results'/'artifact_validation.json').write_text(json.dumps(results,indent=2))
    print(json.dumps(results,indent=2))


if __name__=='__main__':main()
