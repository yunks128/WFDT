import L from 'leaflet'

/**
 * Active and historical wildfire perimeters from the interagency WFIGS
 * service.
 *
 * This is the live layer of the twin: unlike the raster catalogue it is
 * queried rather than tiled, and it is keyless and CORS-open, so it works from
 * a static site with no proxy at all.
 *
 * Only perimeters intersecting the requested extent are fetched. The national
 * set runs to a couple of hundred active fires and far more historical ones,
 * and pulling all of them to draw a county would be slow for no benefit.
 */

const CURRENT =
  'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/' +
  'WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query'
const HISTORIC =
  'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/' +
  'InterAgencyFirePerimeterHist/FeatureServer/0/query'

const FIELDS = [
  'poly_IncidentName',
  'poly_GISAcres',
  'attr_FireDiscoveryDateTime',
  'attr_PercentContained',
  'attr_IncidentTypeCategory',
  'attr_POOState',
].join(',')

function esriQuery(url, bounds, extra = {}) {
  const q = new URLSearchParams({
    where: '1=1',
    outFields: extra.outFields ?? FIELDS,
    geometryType: 'esriGeometryEnvelope',
    geometry: [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    ].join(','),
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outSR: '4326',
    f: 'geojson',
    resultRecordCount: String(extra.limit ?? 400),
  })
  return `${url}?${q}`
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

function normalise(f) {
  const p = f.properties || {}
  return {
    name: p.poly_IncidentName || p.INCIDENT || p.FIRE_NAME || 'Unnamed incident',
    acres: num(p.poly_GISAcres ?? p.GIS_ACRES),
    discovered: p.attr_FireDiscoveryDateTime ?? null,
    contained: num(p.attr_PercentContained),
    category: p.attr_IncidentTypeCategory || null,
    state: p.attr_POOState || null,
  }
}

/** Acreage drives the colour: the big ones should read first. */
function style(acres) {
  const a = acres ?? 0
  const colour = a > 50000 ? '#ff3b30' : a > 5000 ? '#ff8c1a' : a > 500 ? '#ffc400' : '#ffe08a'
  return { color: colour, weight: 1.6, opacity: 0.95, fillColor: colour, fillOpacity: 0.22 }
}

function popupHtml(d) {
  const esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  const rows = []
  if (d.acres != null) rows.push(['Size', `${Math.round(d.acres).toLocaleString()} acres`])
  if (d.contained != null) rows.push(['Contained', `${Math.round(d.contained)}%`])
  if (d.discovered) rows.push(['Discovered', new Date(d.discovered).toISOString().slice(0, 10)])
  if (d.category) rows.push(['Type', d.category])
  if (d.state) rows.push(['State', d.state])
  return (
    `<div class="pop"><div class="pop-head"><h3>${esc(d.name)}</h3></div>` +
    `<table class="pop-tbl">${rows
      .map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`)
      .join('')}</table>` +
    `<div class="pop-src">WFIGS interagency perimeters</div></div>`
  )
}

export function createFires(map) {
  const layer = L.geoJSON(null, {
    pane: 'vector',
    style: (f) => style(f.properties?.poly_GISAcres ?? f.properties?.GIS_ACRES),
    onEachFeature: (f, l) => l.bindPopup(popupHtml(normalise(f)), { maxWidth: 300 }),
  })

  let mode = null
  let seq = 0
  const state = { count: 0, loading: false, error: null }

  async function load() {
    if (!mode) return
    const mine = ++seq
    state.loading = true
    state.error = null
    try {
      const url = esriQuery(mode === 'historic' ? HISTORIC : CURRENT, map.getBounds(), {
        limit: mode === 'historic' ? 300 : 400,
        ...(mode === 'historic' ? { outFields: 'INCIDENT,FIRE_YEAR,GIS_ACRES' } : {}),
      })
      const r = await fetch(url)
      if (!r.ok) throw new Error(`WFIGS HTTP ${r.status}`)
      const gj = await r.json()
      // A slower earlier request must not overwrite a newer view.
      if (mine !== seq) return
      layer.clearLayers()
      layer.addData(gj)
      state.count = (gj.features || []).length
    } catch (e) {
      if (mine === seq) state.error = e.message
    } finally {
      if (mine === seq) state.loading = false
      map.fire('fires:update')
    }
  }

  map.on('moveend', () => mode && load())

  return {
    layer,
    state,
    setMode(next) {
      mode = next
      if (!next) {
        map.removeLayer(layer)
        layer.clearLayers()
        state.count = 0
        map.fire('fires:update')
        return
      }
      layer.addTo(map)
      load()
    },
    /** Perimeters currently drawn, for the assistant to read. */
    list(limit = 20) {
      const out = []
      layer.eachLayer((l) => {
        const d = normalise(l.feature)
        const c = l.getBounds?.().getCenter?.()
        out.push({ ...d, lat: c ? +c.lat.toFixed(3) : null, lon: c ? +c.lng.toFixed(3) : null })
      })
      out.sort((a, b) => (b.acres ?? 0) - (a.acres ?? 0))
      return out.slice(0, limit)
    },
    focus(name) {
      let hit = null
      layer.eachLayer((l) => {
        if (hit) return
        const d = normalise(l.feature)
        if (d.name.toLowerCase().includes(String(name).toLowerCase())) hit = { l, d }
      })
      if (!hit) return null
      map.fitBounds(hit.l.getBounds(), { maxZoom: 12 })
      hit.l.openPopup()
      return hit.d
    },
  }
}
