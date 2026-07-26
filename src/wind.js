import L from 'leaflet'

/**
 * Animated wind layer for an arbitrary Leaflet CRS.
 *
 * Renders in two passes, the way Windy does:
 *   1. a smooth interpolated speed raster, redrawn only when the view changes
 *   2. pale animated particles on top, carrying direction and texture
 *
 * Splitting the two is what makes it readable — speed lives in the colour
 * field, so the particles can be one quiet colour that never fights the
 * basemap, and the raster gives them contrast over bright ice and cloud.
 *
 * How the motion works
 * --------------------
 * Reprojecting every particle every frame is far too slow in a polar
 * stereographic CRS. Instead, whenever the view changes we bake a coarse
 * *screen-space* velocity field once (three projections per grid node), then
 * the animation loop only does bilinear lookups and adds — pure arithmetic.
 *
 * Particle direction is geographically exact (the local east/north basis comes
 * straight from the projection, so it stays correct right across the pole).
 * Apparent speed is stylised to stay legible at every zoom; true wind speed is
 * the raster colour, the legend, and the cursor readout.
 */

/**
 * Wind speed (m/s) -> colour, following the familiar Windy ramp: deep indigo
 * through blue, teal and green to yellow, orange, red and violet.
 *
 * Speed is carried by the raster, not the particles — that separation is what
 * makes the Windy look readable, and it frees the particles to be a single
 * pale colour that never fights the basemap.
 */
const RAMP = [
  [0, [40, 48, 120]],
  [2, [52, 76, 160]],
  [4, [60, 120, 190]],
  [6, [70, 168, 190]],
  [8, [88, 190, 150]],
  [11, [130, 205, 95]],
  [14, [205, 215, 80]],
  [17, [230, 165, 70]],
  [21, [222, 95, 70]],
  [26, [190, 70, 150]],
  [33, [235, 220, 240]],
]

const RAMP_MAX = RAMP[RAMP.length - 1][0]

/** Interpolate the ramp. @returns {[r,g,b]} */
function rampRgb(s) {
  if (!(s >= 0)) return [255, 255, 255]
  let i = 0
  while (i < RAMP.length - 2 && s > RAMP[i + 1][0]) i++
  const [s0, c0] = RAMP[i]
  const [s1, c1] = RAMP[i + 1]
  const t = Math.min(1, Math.max(0, (s - s0) / (s1 - s0)))
  return [
    Math.round(c0[0] + (c1[0] - c0[0]) * t),
    Math.round(c0[1] + (c1[1] - c0[1]) * t),
    Math.round(c0[2] + (c1[2] - c0[2]) * t),
  ]
}

export function speedColor(s) {
  const c = rampRgb(s)
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

export const WIND_LEGEND = {
  title: 'Wind speed at 10 m',
  css: `linear-gradient(90deg, ${RAMP.map(
    (r) => `${speedColor(r[0])} ${(r[0] / RAMP_MAX) * 100}%`
  ).join(', ')})`,
  ticks: ['0', '11', '22', '33+ m/s'],
}

/** Grid holder with bilinear sampling in geographic space. */
class WindGrid {
  constructor(json) {
    Object.assign(this, json)
    this.absDLat = Math.abs(this.dlat)
    this.absDLon = Math.abs(this.dlon)
    this.latMin = this.lat0 + this.dlat * (this.ny - 1)
  }

  /** @returns {[number, number] | null} [u, v] in m/s, or null outside the grid. */
  sample(lat, lon) {
    if (lat > this.lat0 + 0.5 || lat < this.latMin) return null
    let lng = ((lon - this.lon0) % 360 + 360) % 360

    const fy = Math.min((this.lat0 - lat) / this.absDLat, this.ny - 1.0001)
    const fx = lng / this.absDLon
    const j = Math.floor(fy)
    const i = Math.floor(fx)
    const ty = fy - j
    const tx = fx - i

    const nx = this.nx
    const i0 = i % nx
    const i1 = (i + 1) % nx // wrap at the dateline
    const r0 = j * nx
    const r1 = Math.min(j + 1, this.ny - 1) * nx

    const u = this.u
    const v = this.v
    const w00 = (1 - tx) * (1 - ty)
    const w10 = tx * (1 - ty)
    const w01 = (1 - tx) * ty
    const w11 = tx * ty

    return [
      u[r0 + i0] * w00 + u[r0 + i1] * w10 + u[r1 + i0] * w01 + u[r1 + i1] * w11,
      v[r0 + i0] * w00 + v[r0 + i1] * w10 + v[r1 + i0] * w01 + v[r1 + i1] * w11,
    ]
  }
}

const CELL = 16 // screen-field resolution, px
const EPS = 0.05 // degrees used to derive the local east/north basis
const GAIN = 3.0 // px per second per (m/s) — visual pacing
const CALM = 0.5 // m/s below which we draw nothing (a still dot reads as noise)
const MAX_AGE = 140 // frames before a particle respawns
const TRAIL = 0.965 // per-frame trail persistence (0 = none, 1 = forever)
// Particles are a single pale colour, as on Windy — the speed raster beneath
// gives them contrast everywhere, so no per-particle halo is needed.
const PARTICLE = 'rgba(255,255,255,0.75)'
const PARTICLE_WIDTH = 1.1

export const WindLayer = L.Layer.extend({
  options: { pane: 'wind' },

  initialize(options) {
    L.setOptions(this, options)
    this._grid = null
    this._particles = []
    this._raf = null
    this._field = null
    this._paused = false
    this._rasterOpacity = options?.rasterOpacity ?? 0.45
  },

  onAdd(map) {
    this._map = map

    const mk = (cls) => {
      const c = L.DomUtil.create('canvas', cls)
      c.style.position = 'absolute'
      c.style.pointerEvents = 'none'
      this.getPane().appendChild(c)
      return c
    }

    // Two layers, as on Windy: a smooth speed raster that only changes when
    // the view does, and the animated particles above it.
    this._raster = mk('wind-raster')
    this._raster.style.opacity = String(this._rasterOpacity)
    this._rctx = this._raster.getContext('2d')

    this._canvas = mk('wind-canvas')
    this._canvas.style.willChange = 'transform'
    this._ctx = this._canvas.getContext('2d', { alpha: true, desynchronized: true })

    // Small offscreen buffer holding one pixel per field cell; scaling it up
    // with image smoothing is what produces the soft interpolated look.
    this._buf = document.createElement('canvas')
    this._bctx = this._buf.getContext('2d')

    map.on('moveend zoomend resize', this._reset, this)
    map.on('movestart zoomstart', this._hide, this)
    this._reset()
    this._start()
    return this
  },

  onRemove(map) {
    this._stop()
    map.off('moveend zoomend resize', this._reset, this)
    map.off('movestart zoomstart', this._hide, this)
    this._canvas.remove()
    this._raster.remove()
    return this
  },

  /** Opacity of the speed raster (the particles stay fully opaque). */
  setRasterOpacity(v) {
    this._rasterOpacity = v
    if (this._raster) this._raster.style.opacity = String(v)
    return this
  },

  /** Swap in a new forecast frame without restarting the animation. */
  setData(json) {
    this._grid = json ? new WindGrid(json) : null
    if (this._map) this._reset()
    return this
  },

  hasData() {
    return !!this._grid
  },

  /** Wind at a geographic point, for readouts. @returns {{u,v,speed,dir}|null} */
  at(lat, lon) {
    const s = this._grid?.sample(lat, lon)
    if (!s) return null
    const [u, v] = s
    return {
      u,
      v,
      speed: Math.hypot(u, v),
      // Meteorological convention: direction the wind blows *from*.
      dir: (270 - (Math.atan2(v, u) * 180) / Math.PI) % 360,
    }
  },

  setPaused(p) {
    this._paused = p
    if (!p && !this._raf && this._map) this._start()
  },

  // ── internals ─────────────────────────────────────────────

  _hide() {
    // Leaflet moves panes during drag; blank rather than smear.
    if (this._ctx) this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height)
  },

  _reset() {
    const map = this._map
    if (!map || !this._canvas) return

    const size = map.getSize()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this._w = size.x
    this._h = size.y
    this._dpr = dpr

    for (const c of [this._canvas, this._raster]) {
      c.width = Math.round(size.x * dpr)
      c.height = Math.round(size.y * dpr)
      c.style.width = size.x + 'px'
      c.style.height = size.y + 'px'
      // Pin to the map origin so both track pane transforms together.
      L.DomUtil.setPosition(c, map.containerPointToLayerPoint([0, 0]))
    }

    this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this._ctx.clearRect(0, 0, size.x, size.y)
    this._rctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this._rctx.clearRect(0, 0, size.x, size.y)

    this._buildField()
    this._drawRaster()
    this._seed()
  },

  /**
   * Paint the speed field as a smooth colour raster.
   *
   * The field grid is written one pixel per cell into a tiny offscreen canvas,
   * then scaled up with image smoothing — the browser's bilinear filter does
   * the interpolation for free, which is both faster and smoother than
   * shading each screen pixel by hand. The 16 px cell size is well matched to
   * the underlying 1 degree GFS grid, so nothing real is being invented.
   */
  _drawRaster() {
    const f = this._field
    const rctx = this._rctx
    if (!rctx) return
    rctx.clearRect(0, 0, this._w, this._h)
    if (!f) return

    const { cols, rows, sp } = f
    this._buf.width = cols
    this._buf.height = rows
    const img = this._bctx.createImageData(cols, rows)
    const d = img.data

    for (let i = 0; i < sp.length; i++) {
      const o = i * 4
      const s = sp[i]
      if (Number.isNaN(s)) {
        d[o + 3] = 0 // outside the grid — let the basemap through
        continue
      }
      const c = rampRgb(s)
      d[o] = c[0]
      d[o + 1] = c[1]
      d[o + 2] = c[2]
      d[o + 3] = 255
    }
    this._bctx.putImageData(img, 0, 0)

    rctx.imageSmoothingEnabled = true
    rctx.imageSmoothingQuality = 'high'
    // The grid is anchored at cell centres, so offset by half a cell.
    rctx.drawImage(
      this._buf,
      -CELL / 2,
      -CELL / 2,
      cols * CELL,
      rows * CELL
    )
  },

  /**
   * Bake the screen-space velocity field. One pass, ~2-3 projections per node,
   * so a 1920x1080 viewport costs ~8k nodes instead of ~6k per *frame*.
   */
  _buildField() {
    const map = this._map
    const grid = this._grid
    if (!map || !grid) {
      this._field = null
      return
    }

    const cols = Math.ceil(this._w / CELL) + 1
    const rows = Math.ceil(this._h / CELL) + 1
    const vx = new Float32Array(cols * rows)
    const vy = new Float32Array(cols * rows)
    const sp = new Float32Array(cols * rows)

    const D2R = Math.PI / 180
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const k = r * cols + c
        const px = c * CELL
        const py = r * CELL

        let ll
        try {
          ll = map.containerPointToLatLng([px, py])
        } catch {
          sp[k] = NaN
          continue
        }
        // The pole is a coordinate singularity for "east"; nudge off it.
        const lat = Math.max(-89.9, Math.min(89.9, ll.lat))
        const wind = grid.sample(lat, ll.lng)
        if (!wind) {
          sp[k] = NaN
          continue
        }

        const pC = map.latLngToContainerPoint([lat, ll.lng])
        const pN = map.latLngToContainerPoint([lat + EPS, ll.lng])
        const pE = map.latLngToContainerPoint([lat, ll.lng + EPS])

        // Unit screen vectors pointing local north and east.
        let nxv = pN.x - pC.x
        let nyv = pN.y - pC.y
        let exv = pE.x - pC.x
        let eyv = pE.y - pC.y
        const nl = Math.hypot(nxv, nyv) || 1
        const el = Math.hypot(exv, eyv) || 1
        nxv /= nl
        nyv /= nl
        exv /= el
        eyv /= el

        const [u, v] = wind
        vx[k] = (u * exv + v * nxv) * GAIN
        vy[k] = (u * eyv + v * nyv) * GAIN
        sp[k] = Math.hypot(u, v)
      }
    }

    this._field = { cols, rows, vx, vy, sp }
  },

  /** Bilinear lookup into the screen field. */
  _lookup(x, y, out) {
    const f = this._field
    if (!f) return false
    const fx = x / CELL
    const fy = y / CELL
    const c = fx | 0
    const r = fy | 0
    if (c < 0 || r < 0 || c >= f.cols - 1 || r >= f.rows - 1) return false

    const tx = fx - c
    const ty = fy - r
    const k00 = r * f.cols + c
    const k10 = k00 + 1
    const k01 = k00 + f.cols
    const k11 = k01 + 1

    // Any no-data corner means we're off the grid edge — respawn instead of
    // dragging a particle into a discontinuity.
    if (
      Number.isNaN(f.sp[k00]) ||
      Number.isNaN(f.sp[k10]) ||
      Number.isNaN(f.sp[k01]) ||
      Number.isNaN(f.sp[k11])
    )
      return false

    const w00 = (1 - tx) * (1 - ty)
    const w10 = tx * (1 - ty)
    const w01 = (1 - tx) * ty
    const w11 = tx * ty

    out.vx = f.vx[k00] * w00 + f.vx[k10] * w10 + f.vx[k01] * w01 + f.vx[k11] * w11
    out.vy = f.vy[k00] * w00 + f.vy[k10] * w10 + f.vy[k01] * w01 + f.vy[k11] * w11
    out.sp = f.sp[k00] * w00 + f.sp[k10] * w10 + f.sp[k01] * w01 + f.sp[k11] * w11
    return true
  },

  _seed() {
    const area = this._w * this._h
    // Denser than a plain vector field — Windy's texture comes from a lot of
    // short streaks rather than a few long ones.
    const n = Math.max(900, Math.min(7000, Math.round(area / 620)))
    const parts = (this._particles = new Array(n))
    for (let i = 0; i < n; i++) {
      parts[i] = { x: 0, y: 0, age: (Math.random() * MAX_AGE) | 0, sp: 0 }
      this._respawn(parts[i])
    }
  },

  _respawn(p) {
    p.x = Math.random() * this._w
    p.y = Math.random() * this._h
    p.age = (Math.random() * MAX_AGE) | 0
  },

  _start() {
    if (this._raf) return
    let last = performance.now()
    const probe = { vx: 0, vy: 0, sp: 0 }

    const tick = (now) => {
      this._raf = requestAnimationFrame(tick)
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      if (this._paused || !this._field || !this._particles.length) return

      const ctx = this._ctx
      const w = this._w
      const h = this._h

      // Fade previous frame toward transparent, leaving comet trails.
      ctx.globalCompositeOperation = 'destination-in'
      ctx.fillStyle = `rgba(0,0,0,${TRAIL})`
      ctx.fillRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'source-over'

      ctx.lineCap = 'round'
      ctx.strokeStyle = PARTICLE
      ctx.lineWidth = PARTICLE_WIDTH

      // Every particle is the same colour now, so the whole frame is one path
      // and one stroke — no per-bucket state changes at all.
      ctx.beginPath()

      for (let i = 0; i < this._particles.length; i++) {
        const p = this._particles[i]
        if (++p.age > MAX_AGE || !this._lookup(p.x, p.y, probe)) {
          this._respawn(p)
          continue
        }
        const nx = p.x + probe.vx * dt
        const ny = p.y + probe.vy * dt
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
          this._respawn(p)
          continue
        }

        // In near-calm air a particle barely moves; repeatedly stamping it in
        // place just accumulates a bright dot. Advance it, but draw nothing.
        if (probe.sp < CALM) {
          p.x = nx
          p.y = ny
          continue
        }

        ctx.moveTo(p.x, p.y)
        ctx.lineTo(nx, ny)

        p.x = nx
        p.y = ny
        p.sp = probe.sp
      }
      ctx.stroke()
    }
    this._raf = requestAnimationFrame(tick)
  },

  _stop() {
    if (this._raf) cancelAnimationFrame(this._raf)
    this._raf = null
  },
})

export const windLayer = (opts) => new WindLayer(opts)
