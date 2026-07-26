import './style.css'
import L from 'leaflet'
import { createMap, LA } from './map.js'
import { BASEMAPS, OVERLAYS, GROUPS } from './layers.js'
import { createFires } from './fires.js'
import { createChat } from './chat.js'
import { PROXY } from './config.js'

const $ = (id) => document.getElementById(id)

const mapApi = createMap($('map'))
const { map } = mapApi
const fires = createFires(map)

const overlayState = new Map(OVERLAYS.map((o) => [o.id, false]))
let labelsOn = true
mapApi.toggleLabels(true)

// ── Availability probe ───────────────────────────────────────────────────────
// A third of the catalogue lives on JPL or firepanel hosts that do not answer
// from the public internet. Their rows stay hidden until one of them actually
// returns a tile, so an off-network visitor gets a working map instead of a
// panel full of layers that silently fail.
const gatedIds = OVERLAYS.filter((o) => o.gated).map((o) => o.id)
let gatedReachable = false

function probeGated() {
  const spec = OVERLAYS.find((o) => o.gated && o.kind === 'wmts')
  if (!spec) return Promise.resolve(false)
  const url = `${spec.host}/wmts/epsg3857/best/${spec.layer}/default/${currentDate()}/${spec.tms}/3/3/1.${spec.ext}`
  return new Promise((resolve) => {
    const img = new Image()
    const done = (ok) => resolve(ok)
    const t = setTimeout(() => done(false), 8000)
    img.onload = () => (clearTimeout(t), done(true))
    img.onerror = () => (clearTimeout(t), done(false))
    img.src = url
  })
}

// ── Layer panel ──────────────────────────────────────────────────────────────
const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  )

function row({ id, type, name, group, meta, checked, opacity, onChange, onOpacity }) {
  const label = document.createElement('label')
  label.className = 'layer-row' + (checked ? '' : ' is-off')

  const input = document.createElement('input')
  input.type = type
  if (type === 'radio') input.name = group
  input.id = id
  input.checked = !!checked
  // Browsers restore form state across a same-URL reload, which would leave
  // the panel showing a previous session's selection rather than the defaults.
  input.autocomplete = 'off'
  input.addEventListener('change', () => {
    label.classList.toggle('is-off', !input.checked)
    onChange(input.checked)
  })

  const text = document.createElement('div')
  text.className = 'layer-text'
  text.innerHTML =
    `<div class="layer-name">${esc(name)}</div>` +
    `<div class="layer-meta">${esc(meta || '')}</div>`

  label.append(input, text)

  if (onOpacity) {
    const slider = document.createElement('input')
    slider.type = 'range'
    slider.className = 'layer-opacity'
    slider.min = '0'
    slider.max = '1'
    slider.step = '0.05'
    slider.value = String(opacity ?? 1)
    slider.setAttribute('aria-label', `${name} opacity`)
    slider.addEventListener('input', () => onOpacity(Number(slider.value)))
    slider.addEventListener('click', (e) => e.preventDefault())
    label.appendChild(slider)
  }
  return label
}

function groupLabel(text, id) {
  const d = document.createElement('div')
  d.className = 'layer-group'
  d.textContent = text
  if (id) d.id = id
  return d
}

function buildPanel() {
  const host = $('layer-list')

  host.appendChild(groupLabel('Basemap'))
  for (const b of BASEMAPS) {
    host.appendChild(
      row({
        id: `base-${b.id}`,
        type: 'radio',
        group: 'basemap',
        name: b.name,
        meta: b.meta,
        checked: b.id === BASEMAPS[0].id,
        onChange: (on) => on && mapApi.setBasemap(b.id),
      })
    )
  }
  host.appendChild(
    row({
      id: 'x-labels',
      type: 'checkbox',
      name: 'Place labels',
      meta: 'Cities, roads and terrain names',
      checked: true,
      onChange: (on) => {
        labelsOn = on
        mapApi.toggleLabels(on)
      },
    })
  )

  // ── Fire perimeters, the live layer ──
  host.appendChild(groupLabel('Fire perimeters (live)'))
  for (const [id, mode, name, meta] of [
    ['fires-current', 'current', 'Current fire perimeters', 'WFIGS · refreshes as you pan'],
    ['fires-historic', 'historic', 'Historical fire perimeters', 'InterAgency archive'],
  ]) {
    host.appendChild(
      row({
        id,
        type: 'checkbox',
        name,
        meta,
        checked: false,
        onChange: (on) => {
          // The two share one layer, so turning one on releases the other.
          const other = id === 'fires-current' ? 'fires-historic' : 'fires-current'
          if (on && $(other)?.checked) $(other).checked = false
          fires.setMode(on ? mode : null)
          renderLive()
        },
      })
    )
  }

  // ── Everything from the catalogue, in the reference site's grouping ──
  for (const g of GROUPS) {
    const rows = OVERLAYS.filter((o) => o.group === g)
    if (!rows.length) continue
    host.appendChild(groupLabel(g, `grp-${g.replace(/\W+/g, '-').toLowerCase()}`))
    for (const o of rows) {
      const el = row({
        id: `ov-${o.id}`,
        type: 'checkbox',
        name: o.name,
        meta: [o.time ? 'time-aware' : null, o.gated ? 'JPL network' : null]
          .filter(Boolean)
          .join(' · '),
        checked: false,
        opacity: o.opacity ?? 1,
        onOpacity: (v) => mapApi.setOpacity(o.id, v),
        onChange: (on) => {
          overlayState.set(o.id, on)
          mapApi.toggleOverlay(o.id, on)
          renderLegend()
        },
      })
      el.id = `ovrow-${o.id}`
      if (o.gated) el.hidden = true
      host.appendChild(el)
    }
  }

  const note = document.createElement('div')
  note.className = 'layer-status'
  note.id = 'gated-note'
  note.textContent = `Checking availability of ${gatedIds.length} JPL/firepanel layers…`
  host.appendChild(note)
}

// ── Time ─────────────────────────────────────────────────────────────────────
const DAY = 86400000
const TIME_DAYS = 400
const today = new Date()
let dayOffset = 1

function currentDate() {
  return new Date(today.getTime() - dayOffset * DAY).toISOString().slice(0, 10)
}
function dateForOffset(o) {
  return new Date(today.getTime() - o * DAY).toISOString().slice(0, 10)
}
function offsetForDate(s) {
  const t = Date.parse(`${s}T00:00:00Z`)
  if (Number.isNaN(t)) return null
  return Math.round((Date.parse(`${today.toISOString().slice(0, 10)}T00:00:00Z`) - t) / DAY)
}

function applyTime() {
  const d = currentDate()
  mapApi.setTime(d)
  $('time-label').textContent = dayOffset === 1 ? `${d} · yesterday` : d
  renderLegend()
}

const slider = $('time-slider')
slider.min = '0'
slider.max = String(TIME_DAYS)
slider.value = String(TIME_DAYS - dayOffset)
slider.addEventListener('input', () => {
  stopAnimation()
  dayOffset = TIME_DAYS - Number(slider.value)
  applyTime()
})

function setDate(dateStr) {
  const off = offsetForDate(dateStr)
  if (off == null) return { error: `Not a date I can read: "${dateStr}". Use YYYY-MM-DD.` }
  const clamped = Math.max(0, Math.min(TIME_DAYS, off))
  dayOffset = clamped
  slider.value = String(TIME_DAYS - dayOffset)
  applyTime()
  return clamped === off
    ? { ok: true, date: currentDate() }
    : {
        ok: true,
        date: currentDate(),
        clamped: true,
        range: { earliest: dateForOffset(TIME_DAYS), latest: dateForOffset(0) },
      }
}

// ── Animation ────────────────────────────────────────────────────────────────
// Paced by tile loads rather than a fixed interval: each frame re-requests
// every visible tile, and over satellite imagery a frame reliably takes longer
// than a timer would allow, so a blind interval just queues requests until the
// tab stops responding.
let anim = null
let animTimer = null

function stopAnimation() {
  anim = null
  if (animTimer) clearTimeout(animTimer)
  animTimer = null
  syncPlay()
}

function syncPlay() {
  const playing = !!anim
  $('btn-play').querySelector('.ico-play').hidden = playing
  $('btn-play').querySelector('.ico-pause').hidden = !playing
}

function whenTilesSettled(timeoutMs = 6000) {
  const grids = []
  map.eachLayer((l) => l instanceof L.GridLayer && grids.push(l))
  if (!grids.length) return Promise.resolve()
  return new Promise((resolve) => {
    let pending = 0
    let done = false
    const finish = () => {
      if (done) return
      done = true
      clearTimeout(cap)
      clearTimeout(idle)
      for (const g of grids) {
        g.off('tileloadstart', onStart)
        g.off('tileload', onEnd)
        g.off('tileerror', onEnd)
      }
      resolve()
    }
    const onStart = () => pending++
    const onEnd = () => --pending <= 0 && finish()
    for (const g of grids) {
      g.on('tileloadstart', onStart)
      g.on('tileload', onEnd)
      g.on('tileerror', onEnd)
    }
    const idle = setTimeout(() => pending === 0 && finish(), 150)
    const cap = setTimeout(finish, timeoutMs)
  })
}

function startAnimation({ from, to, stepDays = 1, intervalMs = 700, loop = true } = {}) {
  stopAnimation()
  const a = from == null ? 30 : offsetForDate(from)
  const b = to == null ? dayOffset : offsetForDate(to)
  if (a == null || b == null) return { error: 'Dates must be YYYY-MM-DD.' }
  const startOff = Math.max(0, Math.min(TIME_DAYS, Math.max(a, b)))
  const endOff = Math.max(0, Math.min(TIME_DAYS, Math.min(a, b)))
  const span = startOff - endOff
  if (span <= 0) return { error: 'The two dates land on the same day.' }

  const MAX_FRAMES = 120
  let step = Math.max(1, Math.round(stepDays))
  if (span / step > MAX_FRAMES) step = Math.ceil(span / MAX_FRAMES)
  const frames = Math.floor(span / step) + 1
  const ms = Math.max(120, Math.min(3000, Math.round(intervalMs)))

  anim = { startOff, endOff, step, loop, ms }
  dayOffset = startOff
  slider.value = String(TIME_DAYS - dayOffset)
  applyTime()
  syncPlay()
  run()
  return {
    ok: true,
    playing: true,
    from: dateForOffset(startOff),
    to: dateForOffset(endOff),
    stepDays: step,
    frames,
    minIntervalMs: ms,
    note: 'Frames advance as fast as the tiles load, never faster.',
  }
}

async function run() {
  while (anim) {
    const t0 = Date.now()
    await whenTilesSettled()
    if (!anim) return
    const held = Date.now() - t0
    if (held < anim.ms) {
      await new Promise((r) => {
        animTimer = setTimeout(r, anim.ms - held)
      })
    }
    if (!anim) return
    const next = dayOffset - anim.step
    if (next < anim.endOff) {
      if (!anim.loop) return stopAnimation()
      dayOffset = anim.startOff
    } else dayOffset = next
    slider.value = String(TIME_DAYS - dayOffset)
    applyTime()
  }
}

$('btn-play').addEventListener('click', () => {
  if (anim) return stopAnimation()
  startAnimation({ from: dateForOffset(30), to: dateForOffset(0), stepDays: 1 })
})

// ── Legend and readouts ──────────────────────────────────────────────────────
function renderLegend() {
  const el = $('legend')
  const on = OVERLAYS.filter((o) => overlayState.get(o.id))
  if (!on.length) {
    el.hidden = true
    return
  }
  el.innerHTML = on
    .map(
      (o) =>
        `<div class="legend-item"><h3>${esc(o.name)}</h3>` +
        `<img class="legend-img" alt="${esc(o.name)} colour scale" loading="lazy" ` +
        `src="https://gibs.earthdata.nasa.gov/legends/${encodeURIComponent(o.layer || '')}_H.svg" ` +
        `onerror="this.remove()">` +
        (o.time ? `<div class="legend-date">${currentDate()}</div>` : '') +
        `</div>`
    )
    .join('')
  el.hidden = false
}

function renderReadout() {
  const c = map.getCenter()
  $('readout').textContent = `${c.lat.toFixed(2)}°, ${c.lng.toFixed(2)}° · z${map.getZoom()}`
}

function renderLive() {
  const s = fires.state
  $('live').textContent = s.error
    ? `perimeters: ${s.error}`
    : s.loading
      ? 'loading perimeters…'
      : s.count
        ? `${s.count} perimeter${s.count === 1 ? '' : 's'} in view`
        : ''
}

map.on('move zoom', renderReadout)
map.on('fires:update', renderLive)

// ── Panels ───────────────────────────────────────────────────────────────────
function togglePanel(id, btn) {
  const p = $(id)
  const open = p.hidden
  for (const other of ['panel-layers', 'panel-chat']) if (other !== id) $(other).hidden = true
  p.hidden = !open
  btn?.classList.toggle('on', open)
}
$('btn-layers').addEventListener('click', () => togglePanel('panel-layers', $('btn-layers')))
$('btn-chat').addEventListener('click', () => togglePanel('panel-chat', $('btn-chat')))
for (const b of document.querySelectorAll('[data-close]')) {
  b.addEventListener('click', () => ($(b.dataset.close).hidden = true))
}
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea')) return
  if (e.key === 'l' || e.key === 'L') togglePanel('panel-layers', $('btn-layers'))
  if (e.key === 'a' || e.key === 'A') togglePanel('panel-chat', $('btn-chat'))
})

// ── Assistant ────────────────────────────────────────────────────────────────
createChat({
  els: { log: $('chat-log'), form: $('chat-form'), input: $('chat-text') },
  ctx: {
    map,
    fires,
    getDate: currentDate,
    getBasemap: () => BASEMAPS.find((b) => $(`base-${b.id}`)?.checked)?.name ?? null,
    getActiveOverlays: () =>
      OVERLAYS.filter((o) => overlayState.get(o.id)).map((o) => ({ id: o.id, name: o.name })),
    layerIds: () =>
      OVERLAYS.filter((o) => !o.gated || gatedReachable).map((o) => ({
        id: o.id,
        name: o.name,
        group: o.group,
      })),
    setLayerById(id, on) {
      const spec = OVERLAYS.find((o) => o.id === id)
      if (!spec) return false
      const cb = $(`ov-${id}`)
      if (cb) {
        cb.checked = on
        cb.dispatchEvent(new Event('change'))
      } else {
        overlayState.set(id, on)
        mapApi.toggleOverlay(id, on)
        renderLegend()
      }
      return true
    },
    setFires(mode) {
      for (const [id, m] of [
        ['fires-current', 'current'],
        ['fires-historic', 'historic'],
      ]) {
        const cb = $(id)
        if (!cb) continue
        const want = mode === m
        if (cb.checked !== want) {
          cb.checked = want
          cb.dispatchEvent(new Event('change'))
        }
      }
      return { ok: true, mode: mode ?? 'off' }
    },
    setDate,
    animate: startAnimation,
    stopAnimation,
  },
})

// ── Boot ─────────────────────────────────────────────────────────────────────
buildPanel()
applyTime()
renderReadout()
renderLive()
map.setView(LA.center, LA.zoom)

probeGated().then((ok) => {
  gatedReachable = ok
  const note = $('gated-note')
  if (ok) {
    for (const id of gatedIds) {
      const r = $(`ovrow-${id}`)
      if (r) r.hidden = false
    }
    note?.remove()
  } else {
    // Forecasts, Model and FireSense are entirely JPL-hosted, so their
    // headings would otherwise sit over nothing at all.
    for (const g of GROUPS) {
      const any = OVERLAYS.some((o) => o.group === g && !o.gated)
      if (!any) {
        const el = $(`grp-${g.replace(/\W+/g, '-').toLowerCase()}`)
        if (el) el.hidden = true
      }
    }
  }
  if (!ok && note) {
    note.innerHTML =
      `${gatedIds.length} layers hidden — the Predict What We Breathe, FDEO, FireSense ` +
      `and HRRR products are served from JPL and firepanel hosts that only answer on those networks.`
  }
})

window.wfdt = { map, mapApi, fires, setDate, animate: startAnimation, stopAnimation }
