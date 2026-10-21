# Professional point-cloud workspace: reference review and design

The interface is organized as an engineering tool: project/entity explorer on the left, a dominant 3D viewport, calibration and object properties on the right, and a linked change table below. Neutral application chrome keeps the classified point cloud and proposal geometry visually distinct. System typography, compact controls, and numeric evidence replace the earlier editorial presentation.

## Relevant tools reviewed or screened

Primary documentation and public examples were reviewed on 21 October 2026. The depth of access is stated below; reviewing a product page is not the same as operating its licensed application.

| Tool and primary source | What was reviewed / implication |
| --- | --- |
| [CloudCompare GUI](https://www.cloudcompare.org/doc/wiki/index.php/GUI), [entity tree](https://www.cloudcompare.org/doc/wiki/index.php/DB_tree) | Documented database tree, selected-entity properties, viewport and console. Basis for a persistent layer explorer and inspection panel. |
| [Potree examples](https://potree.org/potree/examples/page.html), [classification example](https://potree.org/potree/examples/classifications.html) | Point-cloud controls, classification and spatial navigation. The live classification page was inspected, but its remote cloud had not populated at capture time; it was not a throughput benchmark. |
| [Autodesk ReCap UI](https://help.autodesk.com/cloudhelp/ENU/Reality-Capture/files/Getting_Started/recap_ui.html) | Official project-screen image visually inspected: large spatial viewport and contextual tools, rather than a marketing-style page. |
| [Leica Cyclone 3DR interface](https://cyclone3dr.leica-geosystems.com/help/2025.1/3DReshaperScreen.html) | Official annotated interface image visually inspected: explorer, scene, analysis display and camera tools. Informed the separation between entities, processing and visual analysis. |
| [QGIS 3D map view](https://docs.qgis.org/3.44/en/docs/user_manual/map_views/3d_map_view.html) | Official 3D workspace image visually inspected, along with documented navigation and fit controls. |
| [ArcGIS Scene Viewer](https://doc.arcgis.com/en/arcgis-online/get-started/get-started-with-scenes.htm) | Documented local/global scenes, layers and configurable content. Reinforces explicit local-coordinate labeling and layer controls. |
| [Trimble RealWorks](https://geospatial.trimble.com/en/products/software/trimble-realworks) | Official product descriptions and screenshots cover registration, analysis and point-cloud deliverables. Product-page review only; the licensed application was not run. |
| [Bentley iTwin Capture](https://www.bentley.com/wp-content/uploads/bentley-campus-digital-twin-guide_part-3_v1.pdf) | Official digital-twin guide covers reality capture, alignment and viewer workflows. Document review only, not a live iTwin session. |
| [NavVis IVION interface](https://knowledge.navvis.com/docs/navvis-ivion-interface) | Documented persistent tools, 2D/3D controls, data-layer visibility and validation. Informed clear display controls and comparison behavior. |
| [RIEGL RiSCAN Pro official datasheet listing](https://www.riegl.com/fileadmin/media/Products/07_Software_Packages/RiSCAN_PRO/RiSCAN-PRO_DataSheet_2025-07-14.pdf) | Screened in search as a relevant 2D/3D point-cloud tool. The direct PDF returned 404; no detailed interface or performance claim is based on it. |
| [3DBAG](https://docs.3dbag.nl/en/), [viewer/download documentation](https://3dbag.nl/download) | Reviewed its open building-model workflow and per-tile deliverables. The live viewer timed out during direct access; documentation, not live interaction, informed the review. |
| [Giro3D point-cloud example](https://giro3d.org/latest/examples/point-cloud-intersecting-volumes.html) | Reviewed its public code and UI controls for displayed/total point counts, point size and CRS. Particularly relevant because the example also uses Autzen data. No Giro3D code is copied. |

Cesium ion, Felt and kepler.gl were also considered in an earlier pass. The final direction prioritizes point-cloud processing tools and their operational layouts.

## Implemented behavior

- **Genuine WebGL scene:** Three.js perspective camera, OrbitControls, classified/elevation/uniform vertex colors, point-size control, building extrusions with courtyard holes, geometry edges, raycast selection, an orbit-linked ENU axis indicator and camera fit/zoom. It displays a seeded sample of up to 18,000 points, not the entire estimator input. No streaming octree is claimed.
- **Layer explorer:** independent point-cloud, building, grid and visibility switches. Original/calibrated/reference stage controls preserve the view. The original map and corrected proposal share the local metric frame.
- **Comparison:** a shared-camera scissor divider renders original and calibrated geometry in WebGL, with a corresponding 2D comparison path. Visibility links and object picking are disabled in split mode to avoid ambiguous interpretations.
- **Inspection:** select a building in the viewport or a change-table row to display height, base, evidence support and overlap. Table selection can focus the 3D camera. The table filters height corrections, candidates, review items and unsupported objects.
- **Processing evidence:** the right panel controls the actual injected-error experiment. Metrics retain their pseudo-reference qualifications. The convergence plot uses saved trimmed ICP residuals, not invented performance data.
- **Fallback and responsiveness:** separate 2D plan renderer, a WebGL-unavailable fallback, a collapsible results table and a stacked mobile layout. In 3D the status bar states the metric reference frame; it does not pretend to pick an XYZ surface coordinate on hover.

Three.js 0.180.0 and OrbitControls are locally vendored under MIT with the upstream license. There are no copied product logos, screenshots or proprietary UI assets in the application. Research/provenance content, calibration algorithms and benchmark measurements retain their prior meaning.
