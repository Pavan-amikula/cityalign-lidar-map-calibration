# Interface direction: a cartographic atlas

The interface uses warm paper, charcoal ink, terracotta corrections, olive proposals and restrained survey notation. Serif titles give the project an editorial identity; monospace labels distinguish measured values and coordinates. Geometry and observation evidence occupy the primary workspace. There is no invented street basemap beneath the LiDAR.

## References reviewed

- [Felt — tour the interface](https://help.felt.com/getting-started/tour-the-interface): its documented map, toolbar, legend, detail panel and bottom table informed the separation between spatial exploration and detailed evidence. The implementation uses its own layout, typography, colors and controls.
- [Cesium ion](https://cesium.com/platform/cesium-ion/): reviewed its spatial previews and 3D content workflow as a reference for giving geometry the dominant area of the interface.
- [QGIS — elevation profile view](https://docs.qgis.org/3.44/en/docs/user_manual/map_views/elevation_profile.html): the docked data-view workflow informed the collapsible evidence register and persistent map workspace. CityAlign does not implement an elevation-profile tool.
- [kepler.gl](https://kepler.gl/), including its public demo: reviewed spatial navigation and compact mapping controls. No kepler.gl code or assets are used.

## Implemented interaction model

The top tabs choose original, calibrated or reference geometry. The Compare maps control reveals a keyboard-accessible divider for original/calibrated rendering in the same coordinate system. Visibility links are disabled in split mode so that a single link result is not misrepresented across two maps. The same pan/zoom transform applies to both halves.

The right desk contains data selection, error injection, recalculation and a before/after result sheet. The bottom change register collapses to give the map additional space. Map navigation has explicit zoom and fit controls alongside the existing drag/scroll interaction. The footer reports the cursor's local metric coordinates projected onto the ground plane; in 3D it is a coordinate-plane readout, not picking a roof's XYZ position. Building selection opens its evidence details. Mobile uses a stacked map, register and inspector layout.

The original experiment qualifications, data attribution and distinction between temporary live results and saved downloadable exports remain visible. Styling changes do not change the calibration algorithm or measured benchmark results.
