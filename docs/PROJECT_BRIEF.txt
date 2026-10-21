# CityAlign — complete project brief for résumé tailoring and interviews

## Instruction for the next résumé-writing chat

Use the verified project facts below to tailor my résumé for Ericsson's master's thesis, “Automated LiDAR-based city-scale map calibration.” Use strong, relevant technical language, but preserve the scope and evaluation qualifications. Do not invent employment, Ericsson affiliation, independent field validation, model training, Sionna integration, or production city-scale deployment. Treat this as a portfolio research prototype. Select two or three concise bullets that fit the rest of my actual experience.

## Project identity

Name: **CityAlign: LiDAR-Based Urban Map Calibration**.

Repository: https://github.com/Pavan-amikula/cityalign-lidar-map-calibration

Type: runnable research and software engineering portfolio project, October 2026. Python geometric processing and local Flask API; JavaScript interactive map/point-cloud workbench; CLI; reproducible tests and benchmark outputs; browser demonstration; research review and data provenance. Code is MIT licensed. Real-data derivatives retain CC BY 4.0 attribution.

Problem: coarse urban maps may contain pose errors, incorrect vertical dimensions, missing buildings and unsupported objects. These errors affect whether a simulated radio link intersects geometry. The prototype uses existing classified airborne LiDAR to align and update a local 2.5D map, document each decision, and export geometry in formats relevant to a propagation-modeling workflow.

## Implemented pipeline

1. Read a checksum-verified LAZ source using laspy/lazrs. Stream its preparation in 500,000-point chunks. Read the compound CRS with pyproj, convert horizontal and vertical axis units separately to metres, and store a reproducible local origin/crop.
2. Use existing class labels: 2=ground, 6=building. This is not a learned classifier. Create a 1.5 m occupancy raster from building returns; apply morphological closing; identify connected components; construct/simplify footprint polygons using Shapely.
3. Estimate each footprint's base from nearby ground and its height from the 75th percentile of terrain-normalized roof returns. Filter very small or unsupported components.
4. Sample footprint boundaries and estimate a planar rigid transform with trimmed ICP: SciPy KD-tree nearest neighbors, 75% correspondence retention, SVD rotation/translation updates. The transform is SE(2), not full six-degree-of-freedom SE(3).
5. Perform one-to-one building association with the Hungarian assignment algorithm on footprint IoU. Use a minimum IoU threshold of 0.2. Correct heights for matched objects and retain the aligned existing footprint.
6. Propose unmatched observed footprints as missing-building candidates. For unsupported map objects, require at least 15 ground returns and fewer than three building returns before omitting the object from the corrected proposal. Preserve other unmatched objects for review.
7. Save a per-building evidence ledger, support counts, overlap heuristics, changes, registration history, runtime, metrics and provenance. Overlap “confidence” is not a statistically calibrated probability.
8. Export local metric GeoJSON, binary glTF/GLB, genuine binary USDC, and Mitsuba XML with a PLY mesh. glTF explicitly converts Z-up local coordinates to right-handed Y-up. OpenUSD metadata explicitly declares metres and Z-up.
9. Compute a visibility diagnostic using segment/prism intersections on 144 fixed transmitter/receiver links. This is geometric LoS sensitivity, not RF power prediction or a full propagation simulation.
10. Provide optional street-centerline corridor QA, reporting building conflicts and classified return support. It does not reconstruct streets or resolve grade separation. Complex bridge/overhead classes are flagged for review rather than converted to asserted LoD1 corrections.
11. Provide an overlapping-tile extraction path with halo handling and deterministic centroid ownership, plus a measured scaling fixture. Points remain in memory; structures exceeding the halo are skipped and recorded. Complete consistent city-map optimization is not implemented.

## Data and evaluation design

Real observations: PDAL's Autzen classified LiDAR, Eugene, Oregon. Original acquisition provided by Watershed Sciences / Aaron Reyna in 2010; manual classification update by Hobu / Max Sampson in 2021. Full file: 10,653,336 points, 74,416,814 bytes. Download hash is verified. Source is attributed under CC BY 4.0. A 900 × 760 m local crop keeps all roof/selected complex returns and every eighth other return.

Synthetic fixture: 16 seeded flat-roof buildings with independently known footprint/height geometry and sampled roof/ground returns.

Real experiment: randomly split cropped points into two disjoint halves. Extract a pseudo-reference from one half. Inject map translation, yaw, height bias, omissions and a spurious footprint. Run the estimator on the other half. Both halves share acquisition, classification and extraction assumptions. This measures controlled error recovery on real LiDAR; it is not independent survey validation or historical map-change detection.

Standard corruption: x-translation +4 m, y-translation −2.8 m, yaw +1°, height bias +5 m with per-building noise; omit one in six map objects and inject a ground-supported spurious footprint. Real held-out extraction for seed 7 receives 455,838 points. Threshold-dependent precision/recall evaluates geometric objects, not architectural building identities.

Benchmarks: 24 experiments from 2 datasets × 3 seeds × 4 conditions: standard, alignment disabled, 25% retained point density, and larger initial error (12 m x-translation / 3° yaw). Every run and failure status is retained in CSV/JSON. Per-condition mean, standard deviation, minimum and maximum are saved. Three seeds use one real geography, so they do not establish geographic generalization.

## Measured results that can be cited

**Real LiDAR, standard condition averaged across 3 seeds:**

- Mean footprint IoU after calibration: **0.973**; alignment-disabled baseline: **0.725**.
- Paired height MAE on the same retained original object IDs: **0.205 m**; alignment-disabled baseline: **1.791 m**.
- Mean calibration time: **1.54 s** on the recorded development machine. Includes extraction, registration and matching; excludes download, preparation, visibility evaluation and export. No hard real-time guarantee.
- At 25% point density: **0.955 IoU**, **0.412 m paired height MAE**, **1.21 s** mean calibration time.

**Real LiDAR, standard seed 7:**

- Footprint IoU: **0.418 → 0.969**.
- Matched-building height MAE: **4.760 m → 0.433 m**. The matched sets differ before/after, so do not present this as a strictly paired error reduction. The same-ID paired metric is saved separately in the report.
- Recall at IoU ≥ 0.2: **37.9% → 100%** relative to a LiDAR-derived pseudo-reference. Do not report “100% real-world building detection accuracy.”
- Visibility disagreement: **16.0% → 3.5%** over 144 fixed links relative to that same pseudo-reference. Do not translate it into network coverage or received-power improvement.

**Synthetic seed 7:** footprint IoU **0.805 → 0.939**; matched height MAE **5.007 m → 0.061 m**.

**Spatial extraction fixture:** **256 / 256 procedural buildings**, **845,312 points**, **1.44 km² envelope**, **7.66 s**. Repeated synthetic blocks, not diverse real-city validation. Do not claim full city-scale calibration from this experiment.

## Engineering validation and interface

The automated Python suite covers known-pose recovery, end-to-end synthetic calibration, evidence-aware retention of unobserved objects, segment-intersection-height visibility, missing-ground errors, courtyard mesh roof area, GLB axis conversion, OpenUSD format/units, API validation, tile-seam ownership and street conflict reporting. Saved output artifacts are additionally reopened with trimesh, OpenUSD and Mitsuba scalar mode.

The interface uses a custom canvas renderer with top/3D views, point evidence, before/after/reference switching, building inspection, pan/zoom, optional visibility links, experiment sliders, live backend recomputation, a decision table and export links. Browser checks cover dataset switching, a reduced-density rerun, 3D and LoS controls, and mobile horizontal overflow. The MP4 demonstration records actual browser interactions. Downloads refer to saved standard experiments; temporary live runs are explicitly labeled.

## Suggested résumé bullets

Choose bullets appropriate to the space available; keep “controlled” and “pseudo-reference” qualifications close to the metrics where needed.

- Developed **CityAlign**, a Python/JavaScript LiDAR map-calibration prototype combining trimmed SE(2) ICP, terrain-normalized building-height estimation and geometric assignment; exported validated **GLB, binary USDC and Mitsuba XML/PLY** city geometry.
- Designed **24 reproducible experiments** on real classified airborne LiDAR and synthetic geometry; achieved **0.973 mean footprint IoU and 0.205 m paired height MAE** in controlled real-LiDAR error-recovery tests against a derived pseudo-reference, versus 0.725 IoU and 1.791 m without alignment.
- Built an interactive evidence-review workbench and tested overlapping-tile extraction on **845k points / 256 synthetic buildings**, with provenance tracking, missing-building proposals, street conflict QA and geometry-based visibility diagnostics.

Short version without crowded metrics:

“Built and evaluated a LiDAR-based 2.5D map-calibration pipeline using Python, SciPy, Shapely and JavaScript; implemented robust planar registration, building-height correction, evidence-led change proposals and validated glTF/USDC/Mitsuba exports.”

## Relevant keywords supported by the implementation

Python; JavaScript; LiDAR; classified point clouds; LAS/LAZ; laspy; lazrs; geometric registration; trimmed ICP; SE(2); SVD; nearest-neighbor search; KD-tree; SciPy; NumPy; Shapely; computational geometry; geospatial data; compound CRS; coordinate transformations; terrain normalization; building footprints; building-height estimation; 2.5D maps; LoD1; urban geometry; 3D meshes; glTF; GLB; USDC; OpenUSD; Mitsuba XML; PLY; radio-propagation geometry; line of sight; experiment design; ablation studies; robustness evaluation; point-density sensitivity; reproducibility; data provenance; Flask; REST API; interactive visualization; pytest; GitHub Actions; research prototyping; spatial tiling.

Topics researched but not implemented: Point2Building, City3D, roofer LoD2 reconstruction, TEASER++ global registration, Sionna radio materials and propagation solving. They may be described as literature reviewed, not skills demonstrated by running those systems.

## Interview discussion points

**Why geometric rather than learned?** A deterministic baseline is fast to inspect, needs no training labels beyond the supplied classification, and separates registration from roof-height and topology errors. A learned reconstruction comparison would require data split discipline, training/compute reporting and independent evaluation.

**What does the ICP optimize?** A trimmed squared-distance objective on sampled 2D footprint boundaries with nearest-neighbor correspondences, alternating correspondence assignment and rigid SVD updates. It converges locally; regular layouts and poor initialization can produce wrong matches.

**Why not replace all footprints?** Airborne roof returns are not surveyed wall or cadastral boundaries. Preserving aligned map footprints avoids equating raster roof occupancy with ground-truth facades. Missing candidates are explicitly proposals.

**What is the biggest validity risk?** The real pseudo-reference shares the same acquisition, labels and extraction procedure. Disjoint returns reduce direct reuse but do not make the reference independent. Independent map dates, surveyed heights and manual change labels are needed next.

**What matters for radio?** Small geometry changes can alter visibility. Reflection, diffraction, material properties and antennas require an RF solver; the project does not establish coverage improvement from the simplified diagnostic.

**What would you extend first?** Pair an independently dated map with AHN/3DEP, evaluate real changes and classification noise, add coarse global registration and consistent tile optimization, then test LoD2 reconstruction and Sionna materials with a fixed RF evaluation protocol.

## Main repository artifacts

`README.md`: recruiter-facing overview and setup. `docs/research.md`: primary-source reading review. `results/benchmark.csv` and JSON: all measured runs. `results/scaling.json`: spatial extraction test. `results/*/provenance.json`: source and experiment traceability. `results/demo.mp4`: browser demonstration. `results/autzen/`: actual map/mesh exports. `tests/test_core.py`: meaningful geometric and API checks. `.github/workflows/tests.yml`: automated synthetic checks.
