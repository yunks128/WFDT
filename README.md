# WFDT — Wildfire Digital Twin, Los Angeles

A fast, static wildfire situational-awareness map for the Los Angeles basin, with
a built-in assistant that can read and drive it.

Layers are taken from the [firepanel.ai](https://firepanel.ai/?mission=Wildfire)
`Wildfire` MMGIS mission — all 92 of them — and re-served directly from their
upstream endpoints, so the site itself is a few hundred kilobytes of static
files with no backend behind it.

## Why there is no server

Everything the map draws comes straight to the browser:

- **Raster layers** are public tile endpoints (NASA GIBS, Esri, Carto).
- **Fire perimeters** come from the interagency WFIGS ArcGIS service, which is
  keyless and CORS-open, queried for the visible extent as you pan.

Only the assistant needs a credential, because it calls Amazon Bedrock. That
runs in a Cloudflare Worker holding the token as a Worker secret, pushed
straight from GitHub Secrets by the deploy workflow so it never touches a
laptop or the repository.

## Layers

92 layers in the groups the reference mission uses: fire perimeters and thermal
anomalies (MODIS, VIIRS, GOES), vegetation indices, land surface temperature,
SMAP soil moisture, OPERA disturbance, smoke and air quality (TROPOMI, TEMPO,
MERRA-2, MAIAC), IMERG precipitation, and Landsat surface reflectance.

**24 of them are hidden unless you are on the JPL network.** The Predict What
We Breathe forecasts, FDEO fire danger, AVIRIS FireSense quicklooks and the
HRRR weather fields are served from `ideas-digitaltwin.jpl.nasa.gov`,
`popo.jpl.nasa.gov` and `firepanel.ai/veloserver`, none of which answer from
the public internet. A probe at startup decides: if the host replies the rows
appear, otherwise they stay hidden and the panel says why. Showing them
unconditionally would fill the panel with layers that silently fail.

Google's tile servers, which the reference mission uses for two basemaps and
its label overlay, are replaced with Esri World Imagery and Carto. Calling
Google's endpoints without a key from a public repository is not something to
ship.

## Assistant

The model runs on Bedrock behind the Worker; its *tools* execute in the browser
against the live map, so it always reads exactly what you are looking at. It
can list and toggle any layer, show and list fire perimeters, zoom to a named
incident, move the timeline and play a time-lapse.

It is told to ground every factual claim in a tool call, to report a null field
as unknown rather than guessing, and never to issue or imply an evacuation
instruction — for orders it points to CAL FIRE, local emergency services and
watchduty.org.

## Run

```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # → dist/
```

Set `VITE_PROXY_URL` to the deployed Worker URL to enable the assistant; without
it the map works fully and the assistant explains that it needs a proxy.

## Caveats worth knowing

**Perimeters are not a fire front.** WFIGS polygons are the official reported
footprint and lag reality, sometimes by more than a day.

**Thermal anomalies are heat, not fire.** MODIS and VIIRS flag industrial heat
sources and reflective surfaces alongside actual fires.

**A 404 tile is normal.** Every source in this catalogue returns 404 for a tile
it holds no data for, rather than a blank image, so missing tiles are drawn as
nothing rather than as broken.

## Counting acreage

Summing the perimeters drawn on the map gives a floor, not a total: the layer
fetches a bounded number of full polygons for the visible extent. `get_fire_stats`
asks the service the same question with `returnGeometry=false` and only the
acreage column, which is cheap enough to return every matching record — the
2018 archive over Los Angeles is 162 fires and 146,873 acres, against the 156
and ~145,500 you get by adding up what is drawn.

`outStatistics` would be the obvious tool for this and is not usable: the
service charges it against a request-unit quota that a spatial sum exceeds
every time, returning 429 regardless of how long you wait. Attribute-only
paging is the way through, and the query reports `exceededTransferLimit` so a
truncated answer is labelled a floor rather than presented as a total.

## Wind

NOAA GFS 10 m wind over southern California (30–40°N, 125–110°W) at the native
quarter-degree spacing, prebuilt into ~21 KiB of static JSON per forecast hour
by `scripts/build_wind.py` and refreshed every six hours by a scheduled
workflow. It renders as an interpolated speed raster with pale particles over
it, and the assistant can sample speed and direction at any point.

The reference mission's own wind layers are HRRR, served from firepanel's
`veloserver`, which does not answer publicly — so this is GFS rather than HRRR,
coarser but reachable by anyone.

```bash
pip install eccodes
npm run wind          # → public/data/wind/{index,f000,f006,…}.json
```
