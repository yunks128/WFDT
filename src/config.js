/**
 * Frozon configuration.
 *
 * Everything here is public. Secrets (AIS / OpenSky / Bedrock) live only on the
 * proxy — see server/index.js and README "Why a proxy".
 */

/** Where the credential proxy lives.
 *  - dev: Vite proxies /api -> localhost:8787
 *  - prod on GitHub Pages: set VITE_PROXY_URL at build time to your deployed proxy
 *    (e.g. https://frozon-proxy.yourname.workers.dev). Leave unset to run the map
 *    in "open data only" mode: imagery + sea ice + winds still work.
 */
export const PROXY = (import.meta.env.VITE_PROXY_URL || '').replace(/\/$/, '')

/** Full URL for a proxy route, or null when no proxy is configured. */
export function api(path) {
  if (PROXY) return PROXY + path
  // Same-origin (dev, or a deploy that reverse-proxies /api).
  if (import.meta.env.DEV) return path
  return null
}

/** NASA GIBS — public, CORS-enabled, no API key. EPSG:3413 (Arctic). */
export const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3413/best'

/**
 * EPSG:3413 — NSIDC Sea Ice Polar Stereographic North.
 * Resolution set and bounds copied from the MMGIS `frozon` mission so tiles
 * line up exactly with the GIBS EPSG:3413 tile matrix sets.
 */
export const CRS_3413 = {
  code: 'EPSG:3413',
  proj:
    '+proj=stere +lat_0=90 +lat_ts=70 +lon_0=-45 +x_0=0 +y_0=0 ' +
    '+datum=WGS84 +units=m +no_defs',
  origin: [-4194304, 4194304],
  bounds: [-4194304, -4194304, 4194304, 4194304],
  // GIBS 3413 matrix sets: 8192 m/px at z0, halving each level. The finest
  // set GIBS publishes here is 31.25m, which runs to 32 m/px at z8 — so the
  // view can go three levels deeper than the 250m imagery alone allows.
  // Layers coarser than the current zoom upscale rather than 404 (their
  // maxNativeZoom is set from the tile matrix set they actually have).
  // Levels past z8 exist for Esri World Imagery, which renders any bbox on
  // demand; GIBS layers simply upscale past their own native maximum.
  resolutions: [8192, 4096, 2048, 1024, 512, 256, 128, 64, 32, 16, 8],
  maxZoom: 10,
}

/** Initial camera. */
export const VIEW = { center: [90, 0], zoom: 1 }

/** Arctic bounding box used for vessel + aircraft subscriptions. */
export const ARCTIC = { latMin: 60, latMax: 90, lonMin: -180, lonMax: 180 }

/** How long a vessel/aircraft may go unheard-from before it's dropped (ms). */
export const STALE_MS = 45 * 60 * 1000

/** Track history retained per platform (positions). */
export const TRACK_LEN = 60
