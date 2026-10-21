# Research foundations and data provenance

Verified against primary sources on 21 October 2026. These sources motivate the design; citing a method does not imply that its full algorithm or reported accuracy is reproduced here.

## Research and implementation references

| Source | Relevant finding | Design implication |
| --- | --- | --- |
| [Open3D ICP tutorial](https://www.open3d.org/docs/release/tutorial/pipelines/icp_registration.html) | ICP estimates a rigid alignment using local correspondences. | Report registration separately from geometry changes; evaluate initial-pose sensitivity. |
| [Open3D robust kernels](https://www.open3d.org/docs/latest/tutorial/t_pipelines/t_robust_kernel.html) | Robust losses downweight registration residuals; documented point-to-plane implementations support kernels such as Huber and Tukey. | Use robust correspondence rejection/weighting and compare against an uncorrected baseline. A custom trimmed point-to-point ICP is not Open3D's point-to-plane implementation. |
| [Yang, Shi, Carlone: TEASER, 2020](https://arxiv.org/abs/2001.07715) | Truncated least squares and graph-based pruning address heavy correspondence outliers; TEASER++ uses graduated nonconvexity for rotation estimation. | Useful future global-initialization baseline when coarse georeferencing is unreliable; no TEASER++ implementation claim without running it. |
| [Huang et al.: City3D, 2022](https://arxiv.org/abs/2201.10276), [official implementation](https://github.com/tudelft3d/City3D) | Reconstructs compact building models from airborne LiDAR, using planar segments and hypothesized walls where facade returns are missing. | Airborne roof coverage does not establish facade geometry. Extruded footprints are a useful 2.5D representation but do not reproduce LoD2 roof topology. |
| [3DBAG roofer](https://innovation.3dbag.nl/roofer/) | Automatic LoD2 reconstruction takes a point cloud and building roofprint polygons. | Potential production extension for complex roofs; keep the current baseline and its limitations explicit. |
| [Liu et al.: Point2Building, 2024](https://arxiv.org/abs/2403.02136) | Autoregressive mesh generation addresses varied roofs and incomplete point coverage; evaluated on Zurich, Berlin and Tallinn. | A relevant learning-based comparison, with different training and compute requirements from a deterministic geometric prototype. |
| [Ait Aoudia et al.: Sionna RT technical report, 2025](https://arxiv.org/abs/2504.21719) | Documents propagation-path and radio-map algorithms and limitations. | Distinguish a geometric visibility/obstruction diagnostic from full multipath electromagnetic ray tracing. |

## Real LiDAR candidate: Autzen Stadium

[PDAL's dataset README](https://github.com/PDAL/data/blob/main/autzen/README.md) identifies the original provider as Aaron Reyna of Watershed Sciences, Inc. (2010), and a manual classification update by Max Sampson of Hobu, Inc. (2021). It describes 10,653,336 points, complex stadium/baseball/infrastructure geometry, and coordinates in US feet. The repository carries a [CC BY 4.0 license](https://github.com/PDAL/data/blob/main/LICENSE). Attribute the original providers and PDAL; identify any crop, downsampling, coordinate conversion, and generated derived geometry.

- Actual downloadable LAZ: [autzen-classified.laz](https://media.githubusercontent.com/media/PDAL/data/main/autzen/autzen-classified.laz).
- The raw.githubusercontent.com version is a Git LFS pointer, not the LAZ payload.
- Verified payload length: **74,416,814 bytes**.
- SHA-256 from the repository LFS pointer and matching payload ETag: `c8828215facfb4c9465c9a7db9d45cf2c0e9175a6eb5b21e89417978cc85cd51`.
- Documented class values include ground **2**, vegetation **5**, building **6**, water **9**, bridge deck **17**, overhead structure **19**, elevated walkway **70**, and covered walkway **71**.
- Read the file CRS and its axis units before processing; convert horizontal and vertical units explicitly to metres. Do not silently treat the source coordinates as metres or EPSG:4326.

This is real observed LiDAR but is one historical locality, not a city-wide deployment benchmark. A map derived from the same point cloud and subsequently perturbed is a **controlled corruption benchmark on real observations**, not independent historical-map validation. Hold out LiDAR samples from fitting, and report that the geometry reference still derives from the same acquisition. Class 6 building returns are an existing manual classification, not a trained building segmentation model. Lack of returns alone does not establish demolition, particularly under occlusion. Stadium roofs and walkways are valuable failure cases for simple extrusions.

The [laspy example file](https://laspy.readthedocs.io/en/latest/) contains only 1,065 points; it is useful for I/O smoke testing and not a convincing building-calibration benchmark.

## Larger external validation options

- [AHN official dataroom](https://www.ahn.nl/dataroom): LAZ point clouds include ground, water, buildings and structures from AHN3 onward. Products use Amersfoort/RD New with NAP height, compound **EPSG:7415**. AHN2/3/4/5 sheets cover 5 by 6.25 km; AHN6 uses 1 km tiles. [Open-data policy](https://www.ahn.nl/open-data). Pair with separately acquired footprints and account for acquisition dates and vertical datum.
- [USGS 3DEP](https://www.usgs.gov/3d-elevation-program): official products are free without use restrictions. [USGS public-cloud announcement](https://www.usgs.gov/news/technical-announcement/usgs-3dep-lidar-point-cloud-now-available-amazon-public-dataset) describes cloud point access. Select a manageable bounding box and independently versioned map, rather than downloading a whole city initially.

## Interchange and radio integration

- [Khronos glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html): glTF uses metres and a right-handed coordinate system with +Y up. A local east/north/up pipeline must explicitly transform axes when exporting, e.g. `(east, north, up) -> (east, up, -north)`. Store CRS and local origin as metadata; renderers do not automatically infer georeferencing.
- [OpenUSD FAQ](https://openusd.org/release/usdfaq.html): `.usda` is text, `.usdc` is binary Crate, and `.usd` can contain either. A text file renamed `.usdc` is invalid. Use the OpenUSD API for genuine binary export and verify it opens.
- [Mitsuba scene XML](https://mitsuba.readthedocs.io/en/stable/src/key_topics/scene_format.html): scenes describe plugins, mesh references and transforms. Validate every mesh path and its coordinate convention.
- [Sionna scene API](https://nvlabs.github.io/sionna/rt/api/scene.html): Sionna RT loads Mitsuba-format XML. Radio material plugins and transmitter/receiver settings require explicit handling; ordinary optical BSDF export is not sufficient evidence of a tested Sionna scene.
- [Sionna introduction](https://nvlabs.github.io/sionna/v2.1.0/rt/tutorials/Introduction.html) and [radio-map solver API](https://nvlabs.github.io/sionna/rt/api/radio_map_solvers.html): radio maps can represent path gain, RSS or SINR. A simplified line-of-sight model can demonstrate geometry sensitivity but must not be reported as measured network improvement, calibrated propagation prediction or a complete Sionna simulation.

## Evaluation protocol recommended for this prototype

Use deterministic seeds, saved parameters, source hashes and explicit train/holdout separation. Compare uncalibrated geometry against registered-only and registered-plus-updated geometry. Report roof/height error and footprint overlap separately from registration RMSE; include matched/unmatched buildings, missed objects, runtime, input size, and point density. Stress tests should vary initial translation/yaw, height corruption, missing buildings, outliers and point thinning. A small-scene runtime does not establish city-scale throughput. Record failures and inspect complex roofs, sparse observations, vegetation and terrain slope. City-scale readiness requires measured tiled processing, boundary reconciliation and independent multi-city validation.
