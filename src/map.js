import L from 'leaflet'
import { BASEMAPS, LABELS, OVERLAYS, overlayUrl, tmsMaxZoom } from './layers.js'

/**
 * Web Mercator map for the Los Angeles basin.
 *
 * Unlike the polar case, nothing here needs a custom CRS: every source in the
 * catalogue publishes EPSG:3857 tiles, so Leaflet's default projection is both
 * correct and the one the upstream tile matrices were cut for.
 */

// Los Angeles County and the surrounding ranges that carry its fire weather.
export const LA = { center: [34.1, -118.3], zoom: 9 }
export const LA_BOUNDS = L.latLngBounds([33.4, -119.5], [34.9, -117.0])

// The wind layer defaults to a pane called 'wind'; without it the canvases
// have nowhere to attach and the layer silently draws nothing.
const PANES = { basemap: 200, raster: 400, wind: 450, vector: 500, labels: 550 }

export function createMap(el) {
  const map = L.map(el, {
    center: LA.center,
    zoom: LA.zoom,
    minZoom: 3,
    maxZoom: 18,
    zoomControl: true,
    attributionControl: true,
    preferCanvas: true,
  })

  // Panes exist before any layer so ordering never depends on add order.
  for (const [name, z] of Object.entries(PANES)) {
    map.createPane(name).style.zIndex = String(z)
  }

  // Pass `subdomains` only when the URL actually has an {s} placeholder.
  // Setting it to undefined does not fall back to Leaflet's default — it
  // overwrites it, and _getSubdomain then reads .length of undefined on the
  // first tile, which takes the whole module down before the panel is built.
  const labels = L.tileLayer(LABELS.url, {
    pane: 'labels',
    ...(LABELS.subdomains ? { subdomains: LABELS.subdomains } : {}),
    maxZoom: 18,
    maxNativeZoom: LABELS.maxZoom,
    attribution: LABELS.attribution,
  })

  let base = null
  const setBasemap = (id) => {
    const spec = BASEMAPS.find((b) => b.id === id) || BASEMAPS[0]
    if (base) map.removeLayer(base)
    base = L.tileLayer(spec.url, {
      pane: 'basemap',
      ...(spec.subdomains ? { subdomains: spec.subdomains } : {}),
      maxZoom: 18,
      maxNativeZoom: spec.maxZoom,
      attribution: spec.attribution,
    }).addTo(map)
    return spec
  }
  setBasemap(BASEMAPS[0].id)

  // ── Overlays ──────────────────────────────────────────────────────────────
  const overlays = new Map()
  let currentDate = null

  const build = (spec) => {
    const url = overlayUrl(spec, currentDate)
    const opts = {
      pane: 'raster',
      opacity: spec.opacity ?? 1,
      maxZoom: 18,
      maxNativeZoom: spec.kind === 'wmts' ? tmsMaxZoom(spec.tms) : 12,
      // Every source in this catalogue answers 404 for a tile it has no data
      // for, which is normal rather than an error; a blank beats a broken icon.
      errorTileUrl:
        'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      attribution: spec.gated ? 'JPL / firepanel' : 'NASA GIBS',
    }
    if (spec.kind === 'wms') {
      // The thermal-anomaly products are WMS, so Leaflet composes the request
      // rather than us templating {z}/{y}/{x}.
      const base = spec.url.split('?')[0]
      return L.tileLayer.wms(base, {
        ...opts,
        layers: spec.wmsLayer,
        format: 'image/png',
        transparent: true,
        ...(spec.time && currentDate ? { time: String(currentDate).slice(0, 10) } : {}),
      })
    }
    return L.tileLayer(url, opts)
  }

  return {
    map,
    setBasemap,
    toggleLabels: (on) => (on ? labels.addTo(map) : map.removeLayer(labels)),
    toggleOverlay(id, on) {
      const spec = OVERLAYS.find((o) => o.id === id)
      if (!spec) return false
      if (on) {
        if (!overlays.has(id)) overlays.set(id, build(spec))
        overlays.get(id).addTo(map)
      } else if (overlays.has(id)) {
        map.removeLayer(overlays.get(id))
      }
      return true
    },
    setOpacity: (id, v) => overlays.get(id)?.setOpacity(v),
    isOn: (id) => !!overlays.get(id) && map.hasLayer(overlays.get(id)),
    /** Re-point every time-aware layer at a new date. */
    setTime(date) {
      currentDate = date
      for (const [id, layer] of overlays) {
        const spec = OVERLAYS.find((o) => o.id === id)
        if (!spec?.time) continue
        if (spec.kind === 'wms') layer.setParams({ time: String(date).slice(0, 10) })
        else layer.setUrl(overlayUrl(spec, date))
      }
    },
  }
}
