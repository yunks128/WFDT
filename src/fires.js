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

const HOST = 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services'

// The two archives are separate services with entirely different schemas, so
// each carries its own field list. The historical one is named
// InterAgencyFirePerimeterHistory_All_Years_View — the shorter name the
// reference mission used does not resolve, and asking for it returns a 400.
const SOURCES = {
  current: {
    label: 'WFIGS interagency perimeters (current)',
    url: `${HOST}/WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query`,
    fields: [
      'poly_IncidentName',
      'poly_GISAcres',
      'attr_FireDiscoveryDateTime',
      'attr_PercentContained',
      'attr_IncidentTypeCategory',
      'attr_POOState',
    ].join(','),
    limit: 400,
  },
  ytd: {
    label: 'WFIGS interagency perimeters (year to date)',
    url: `${HOST}/WFIGS_Interagency_Perimeters_YearToDate/FeatureServer/0/query`,
    fields: [
      'poly_IncidentName',
      'poly_GISAcres',
      'attr_FireDiscoveryDateTime',
      'attr_PercentContained',
      'attr_IncidentTypeCategory',
      'attr_POOState',
    ].join(','),
    limit: 400,
  },
  historic: {
    label: 'Interagency fire perimeter history',
    url: `${HOST}/InterAgencyFirePerimeterHistory_All_Years_View/FeatureServer/0/query`,
    fields: ['INCIDENT', 'FIRE_YEAR_INT', 'GIS_ACRES'].join(','),
    limit: 300,
  },
}

function esriQuery(src, bounds, year) {
  const q = new URLSearchParams({
    // The archive stores unusable sentinels in the year column — the range
    // runs from 0 to 9999 — so a year filter also has to exclude them, and an
    // unfiltered query still reports honest years to the caller.
    where: year ? `FIRE_YEAR_INT=${Number(year)}` : '1=1',
    outFields: src.fields,
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
    resultRecordCount: String(src.limit),
  })
  return `${src.url}?${q}`
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

function normalise(f) {
  const p = f.properties || {}
  return {
    name: p.poly_IncidentName || p.INCIDENT || 'Unnamed incident',
    acres: num(p.poly_GISAcres ?? p.GIS_ACRES),
    discovered: p.attr_FireDiscoveryDateTime ?? null,
    contained: num(p.attr_PercentContained),
    category: p.attr_IncidentTypeCategory || null,
    state: p.attr_POOState || null,
    year: p.FIRE_YEAR_INT ?? null,
  }
}

/** Acreage drives the colour: the big ones should read first. */
function style(acres) {
  const a = acres ?? 0
  const colour = a > 50000 ? '#ff3b30' : a > 5000 ? '#ff8c1a' : a > 500 ? '#ffc400' : '#ffe08a'
  return { color: colour, weight: 1.6, opacity: 0.95, fillColor: colour, fillOpacity: 0.22 }
}

function popupHtml(d, source) {
  const esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  const rows = []
  if (d.acres != null) rows.push(['Size', `${Math.round(d.acres).toLocaleString()} acres`])
  if (d.contained != null) rows.push(['Contained', `${Math.round(d.contained)}%`])
  if (d.discovered) rows.push(['Discovered', new Date(d.discovered).toISOString().slice(0, 10)])
  if (d.year != null) rows.push(['Year', String(d.year)])
  if (d.category) rows.push(['Type', d.category])
  if (d.state) rows.push(['State', d.state])
  return (
    `<div class="pop"><div class="pop-head"><h3>${esc(d.name)}</h3></div>` +
    `<table class="pop-tbl">${rows
      .map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`)
      .join('')}</table>` +
    `<div class="pop-src">${esc(source)}</div></div>`
  )
}

/**
 * Marker radius in pixels for an acreage.
 *
 * Most fires are small: a few hundred acres is a kilometre or two across,
 * which at the zoom you look at a whole county is under a pixel. Drawing the
 * true perimeter alone means the layer reports "3 perimeters in view" while
 * the map appears empty, so each one also gets a dot that stays legible.
 */
function markerRadius(acres) {
  const a = Math.max(1, acres ?? 1)
  return Math.max(4, Math.min(11, 3 + Math.log10(a) * 2))
}

export function createFires(map) {
  // Declared before the layer because the popup builder reads it to credit the
  // right archive.
  let mode = null
  let year = null

  const layer = L.geoJSON(null, {
    pane: 'vector',
    style: (f) => style(f.properties?.poly_GISAcres ?? f.properties?.GIS_ACRES),
    onEachFeature: (f, l) =>
      l.bindPopup(popupHtml(normalise(f), SOURCES[mode]?.label ?? ''), { maxWidth: 300 }),
  })
  // Dots live in their own layer so they can be shown and hidden per zoom
  // without touching the polygons.
  const dots = L.layerGroup([], { pane: 'vector' })

  /**
   * Show a dot only while its polygon is too small to see.
   *
   * Past that the perimeter itself carries the shape, and a dot sitting in the
   * middle of it would just be clutter.
   */
  function syncDots() {
    const z = map.getZoom()
    for (const d of dots.getLayers()) {
      const b = d._perimeter
      const nw = map.project(b.getNorthWest(), z)
      const se = map.project(b.getSouthEast(), z)
      const px = Math.max(Math.abs(se.x - nw.x), Math.abs(se.y - nw.y))
      d.setStyle({ opacity: px < 14 ? 1 : 0, fillOpacity: px < 14 ? 0.85 : 0 })
    }
  }
  map.on('zoomend', syncDots)

  let seq = 0
  const state = { count: 0, loading: false, error: null }

  async function load() {
    if (!mode) return
    const mine = ++seq
    state.loading = true
    state.error = null
    try {
      const url = esriQuery(SOURCES[mode], map.getBounds(), mode === 'historic' ? year : null)
      const r = await fetch(url)
      if (!r.ok) throw new Error(`WFIGS HTTP ${r.status}`)
      const gj = await r.json()
      // A slower earlier request must not overwrite a newer view.
      if (mine !== seq) return

      // ArcGIS reports its own failures as a 200 carrying {error:{...}}, and
      // handing that to addData makes Leaflet throw "Invalid GeoJSON object"
      // from deep inside the render — an unrecoverable-looking crash for what
      // is really just a transient service error. Check the shape first and
      // pass the service's own message through.
      if (gj?.error) throw new Error(gj.error.message || 'WFIGS rejected the query')
      if (gj?.type !== 'FeatureCollection' || !Array.isArray(gj.features)) {
        throw new Error('WFIGS returned something that is not a FeatureCollection')
      }

      // A feature with no geometry cannot be drawn; Leaflet skips it silently,
      // so count what actually made it onto the map rather than what arrived.
      const drawable = gj.features.filter((f) => f?.geometry?.type)
      layer.clearLayers()
      dots.clearLayers()
      layer.addData({ type: 'FeatureCollection', features: drawable })

      layer.eachLayer((l) => {
        const d = normalise(l.feature)
        const b = l.getBounds()
        const dot = L.circleMarker(b.getCenter(), {
          pane: 'vector',
          radius: markerRadius(d.acres),
          ...style(d.acres),
          weight: 1.4,
          fillOpacity: 0.85,
        })
        dot._perimeter = b
        dot.bindPopup(popupHtml(d, SOURCES[mode]?.label ?? ''), { maxWidth: 300 })
        dots.addLayer(dot)
      })
      syncDots()
      state.count = drawable.length
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
    /**
     * Restrict the archive to a single fire year.
     *
     * Only meaningful for the historical layer; the current and year-to-date
     * services are already a single season by definition.
     */
    setYear(y) {
      year = y ? Number(y) : null
      if (mode === 'historic') load()
      return { ok: true, year }
    },
    getYear: () => year,

    setMode(next) {
      mode = next
      if (!next) {
        map.removeLayer(layer)
        map.removeLayer(dots)
        layer.clearLayers()
        dots.clearLayers()
        state.count = 0
        map.fire('fires:update')
        return
      }
      layer.addTo(map)
      dots.addTo(map)
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
