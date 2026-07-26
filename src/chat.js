import { api } from './config.js'

/**
 * Conversational assistant panel.
 *
 * The model runs on Bedrock behind the proxy, but its *tools* execute here in
 * the browser, against the live map. That keeps the proxy stateless and means
 * the assistant always reads exactly what the user is looking at — the same
 * layer states, the same viewport, the same perimeters currently drawn.
 *
 * Loop: send history -> stream text -> if the turn stopped for tool use, run
 * the tools locally, append the results, and send again.
 */

const MAX_TOOL_ROUNDS = 5

/**
 * Opening suggestions.
 *
 * Chosen so that between them they exercise every tool the assistant has —
 * map state, fire perimeters, layer control and the timeline — because the useful
 * thing to convey on first open is not "you may type here" but what this
 * particular assistant can actually reach. Each is phrased as the user would
 * type it, so clicking one teaches the shape of a question that works.
 */
const SUGGESTIONS = [
  { label: "What's burning now?", text: 'What fire perimeters are currently in view?' },
  { label: 'Show active fires', text: 'Turn on the current fire perimeters layer.' },
  { label: 'Thermal hotspots', text: 'Turn on the VIIRS NOAA-20 thermal anomalies layer.' },
  { label: 'Smoke and air quality', text: 'Which layers show smoke or air quality, and can you turn one on?' },
  { label: 'Vegetation dryness', text: 'Show me a vegetation index layer so I can judge fuel dryness.' },
  { label: 'Zoom to Palisades', text: 'Fly to the Pacific Palisades area of Los Angeles.' },
]

export function createChat({ ctx, els }) {
  const { log, form, input } = els
  /** Bedrock Converse message history. */
  const history = []
  // Plain text of the exchange, for the suggestion call. Kept separately from
  // `history` because that carries tool blocks, which would have to be paired
  // up to stay a valid transcript and are noise for this purpose anyway.
  const transcript = []
  let busy = false
  let chipsEl = null
  let suggestSeq = 0

  // ── UI helpers ────────────────────────────────────────────
  function bubble(cls, text = '') {
    const el = document.createElement('div')
    el.className = `msg ${cls}`
    el.textContent = text
    log.appendChild(el)
    log.scrollTop = log.scrollHeight
    return el
  }

  /**
   * Render the small subset of Markdown the model actually emits here —
   * bold, inline code, and bullet lists. Everything is escaped first, so
   * model output can never inject markup.
   */
  function renderMarkdown(el, raw) {
    const html = raw
      .replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/^\s*[-*]\s+(.*)$/gm, '<li>$1</li>')
      .replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>')
    el.innerHTML = html
  }

  function scrollDown() {
    log.scrollTop = log.scrollHeight
  }

  // Unlike the map layers, the assistant cannot fall back to static data —
  // every question needs a live model call, which needs a server holding the
  // Bedrock credential. Say so up front rather than failing on first send.
  const reachable = !!api('/api/chat')
  if (reachable) {
    bubble(
      'msg-sys',
      'Ask about active fires, smoke, winds or vegetation. I can read the map, move it, and switch layers for you.'
    )
    showSuggestions()
  } else {
    bubble(
      'msg-sys',
      'The assistant needs a credential proxy to reach Bedrock — a model call cannot be answered from static files. See README → “Why a proxy”.'
    )
    input.disabled = true
    input.placeholder = 'Assistant unavailable — no proxy configured'
    form.querySelector('button')?.setAttribute('disabled', '')
  }

  /**
   * Render the suggestions as clickable chips.
   *
   * They live inside the log rather than in a fixed strip above the input, so
   * they scroll with the conversation and cost no permanent height in a panel
   * that is only a few hundred pixels tall.
   */
  function showSuggestions() {
    const wrap = document.createElement('div')
    wrap.className = 'chat-chips'
    wrap.id = 'chat-chips'
    for (const s of SUGGESTIONS) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'chip'
      b.textContent = s.label
      // The chip's label is a shorthand; send the fuller phrasing so the
      // model gets an unambiguous question rather than a fragment.
      b.addEventListener('click', () => send(s.text))
      wrap.appendChild(b)
    }
    chipsEl = wrap
    log.appendChild(wrap)
    scrollDown()
  }

  /** Swap the chip set, keeping the element (and so its place in the log). */
  function setSuggestions(list) {
    if (!chipsEl || !list?.length) return
    chipsEl.replaceChildren()
    for (const s of list) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'chip'
      b.textContent = s.label
      b.title = s.text
      b.addEventListener('click', () => send(s.text))
      chipsEl.appendChild(b)
    }
  }

  /**
   * Ask the proxy for follow-ups that fit the conversation.
   *
   * Fire-and-forget: the answer is already on screen, and stale chips are a
   * far better failure than a blocked panel, so any error leaves the existing
   * set alone. The sequence guard drops a slow reply that lands after the user
   * has already moved on, which would otherwise offer follow-ups to a question
   * two turns old.
   */
  async function refreshSuggestions() {
    const url = api('/api/suggest')
    if (!url || !transcript.length) return
    const seq = ++suggestSeq
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ turns: transcript.slice(-8) }),
      })
      if (!r.ok) return
      const j = await r.json()
      if (seq !== suggestSeq) return
      setSuggestions(j.suggestions)
    } catch {
      // Keep the chips we have.
    }
  }

  /**
   * Move the chips back to the foot of the log.
   *
   * They stay available for the whole conversation, but only if they follow
   * it: left where they started they would scroll off the top after a couple
   * of exchanges and be no more use than deleting them. appendChild moves the
   * existing node, so the click handlers survive.
   */
  function parkSuggestions() {
    if (chipsEl) log.appendChild(chipsEl)
  }

  /** Chips are inert while a turn is in flight, and look it. */
  function setChipsDisabled(v) {
    if (!chipsEl) return
    for (const b of chipsEl.querySelectorAll('button')) b.disabled = v
  }

  // ── Tools, executed against the live map ──────────────────
  const tools = {
    get_map_state() {
      const c = ctx.map.getCenter()
      const b = ctx.map.getBounds()
      return {
        center: { lat: +c.lat.toFixed(3), lon: +c.lng.toFixed(3) },
        zoom: ctx.map.getZoom(),
        bounds: {
          north: +b.getNorth().toFixed(3),
          south: +b.getSouth().toFixed(3),
          west: +b.getWest().toFixed(3),
          east: +b.getEast().toFixed(3),
        },
        date: ctx.getDate(),
        basemap: ctx.getBasemap(),
        activeLayers: ctx.getActiveOverlays(),
        firePerimetersInView: ctx.fires.state.count,
      }
    },

    list_layers({ search }) {
      const all = ctx.layerIds()
      const q = String(search ?? '').trim().toLowerCase()
      const hits = q
        ? all.filter((l) => `${l.name} ${l.group}`.toLowerCase().includes(q))
        : all
      return {
        count: hits.length,
        totalAvailable: all.length,
        layers: hits.slice(0, 40),
        ...(hits.length > 40 ? { note: 'Truncated to 40 — search to narrow it.' } : {}),
      }
    },

    set_layer({ id, on }) {
      const ok = ctx.setLayerById(id, !!on)
      return ok ? { ok: true, id, on: !!on } : { error: `Unknown layer id "${id}".` }
    },

    list_fires({ limit = 10 }) {
      const list = ctx.fires.list(Math.min(Math.max(1, limit | 0), 40))
      return {
        count: list.length,
        inViewTotal: ctx.fires.state.count,
        fires: list,
        ...(list.length
          ? {}
          : {
              note:
                'No perimeters are loaded. Either the layer is off, or no fire ' +
                'intersects this view. Turn it on with set_fire_perimeters.',
            }),
      }
    },

    set_fire_perimeters({ mode }) {
      return ctx.setFires(mode === 'off' ? null : mode)
    },

    focus_fire({ name }) {
      const hit = ctx.fires.focus(name)
      return hit
        ? { ok: true, focused: hit }
        : { error: `No loaded perimeter matches "${name}".` }
    },

    fly_to({ lat, lon, zoom }) {
      const z = zoom == null ? Math.max(ctx.map.getZoom(), 9) : Math.max(3, Math.min(16, zoom))
      ctx.map.flyTo([lat, lon], z, { duration: 1.1 })
      return { ok: true, movedTo: { lat, lon, zoom: z } }
    },

    set_date({ date }) {
      return ctx.setDate(date)
    },

    animate_time({ from, to, stepDays, intervalMs, loop }) {
      return ctx.animate({ from, to, stepDays, intervalMs, loop })
    },

    stop_animation() {
      ctx.stopAnimation()
      return { ok: true, playing: false }
    },
  }

  async function runTools(content) {
    const results = []
    for (const block of content) {
      const tu = block.toolUse
      if (!tu) continue
      const note = bubble('msg-tool', `${tu.name}(${summarize(tu.input)})`)
      let payload
      try {
        const fn = tools[tu.name]
        payload = fn ? await fn(tu.input || {}) : { error: `Unknown tool ${tu.name}` }
      } catch (e) {
        payload = { error: e.message }
      }
      note.textContent = `${tu.name} · ${describe(tu.name, payload)}`
      results.push({
        toolResult: {
          toolUseId: tu.toolUseId,
          content: [{ json: payload }],
          ...(payload?.error ? { status: 'error' } : {}),
        },
      })
    }
    return results
  }

  // ── Transport ─────────────────────────────────────────────
  async function turn(onText) {
    const url = api('/api/chat')
    if (!url) throw new Error('No proxy configured — the assistant needs one to reach Bedrock.')

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: history }),
    })
    if (!res.ok || !res.body) {
      const t = await res.text().catch(() => '')
      throw new Error(parseErr(t) || `Proxy HTTP ${res.status}`)
    }

    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    let done = null
    let failed = null

    while (true) {
      const { value, done: fin } = await reader.read()
      if (fin) break
      buf += dec.decode(value, { stream: true })

      let idx
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const raw = buf.slice(0, idx)
        buf = buf.slice(idx + 2)
        let event = 'message'
        let data = ''
        for (const line of raw.split('\n')) {
          if (line.startsWith('event: ')) event = line.slice(7).trim()
          else if (line.startsWith('data: ')) data += line.slice(6)
        }
        if (!data) continue
        let p
        try {
          p = JSON.parse(data)
        } catch {
          continue
        }
        if (event === 'text') onText(p.text)
        else if (event === 'done') done = p
        else if (event === 'error') failed = p
      }
    }

    if (failed) throw new Error(failed.detail ? `${failed.message}: ${failed.detail}` : failed.message)
    if (!done) throw new Error('Stream ended without completing.')
    return done
  }

  async function send(text) {
    if (busy || !reachable || !text.trim()) return
    busy = true
    input.disabled = true
    setChipsDisabled(true)

    bubble('msg-user', text)
    history.push({ role: 'user', content: [{ text }] })
    transcript.push({ role: 'user', text })

    let out = bubble('msg-ai', '')
    out.textContent = '…'
    let started = false
    let raw = ''

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        raw = ''
        const done = await turn((chunk) => {
          if (!started) {
            out.textContent = ''
            started = true
          }
          // Stream as plain text (cheap, and never half-parsed markup),
          // then format once the turn is complete.
          raw += chunk
          out.textContent = raw
          scrollDown()
        })

        if (started && raw) renderMarkdown(out, raw)
        history.push({ role: 'assistant', content: done.content })

        if (done.stopReason !== 'tool_use') break

        const results = await runTools(done.content)
        if (!results.length) break
        history.push({ role: 'user', content: results })

        // The follow-up turn writes into a fresh bubble.
        out = bubble('msg-ai', '…')
        started = false
      }
      if (!started && out.textContent === '…') out.remove()
    } catch (e) {
      if (out.textContent === '…') out.remove()
      bubble('msg-sys', `⚠ ${e.message}`)
    } finally {
      busy = false
      input.disabled = false
      if (raw.trim()) transcript.push({ role: 'assistant', text: raw })
      setChipsDisabled(false)
      parkSuggestions()
      scrollDown()
      refreshSuggestions()
    }
  }

  // ── Wiring ────────────────────────────────────────────────
  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const text = input.value
    input.value = ''
    input.style.height = 'auto'
    send(text)
  })

  input.addEventListener('input', () => {
    input.style.height = 'auto'
    input.style.height = Math.min(input.scrollHeight, 120) + 'px'
  })

  input.addEventListener('keydown', (e) => {
    // Enter sends on pointer devices; on touch keep Enter as newline.
    if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) {
      e.preventDefault()
      form.requestSubmit()
    }
  })

  return { send, history }
}

// ── formatting helpers ──────────────────────────────────────
function summarize(input) {
  if (!input || typeof input !== 'object') return ''
  return Object.entries(input)
    .map(([k, v]) => `${k}=${typeof v === 'number' ? +v.toFixed(2) : v}`)
    .join(', ')
}

function describe(name, out) {
  if (out?.error) return out.error
  switch (name) {
    case 'get_map_state':
      return `${out.firePerimetersInView} perimeters in view, ${out.activeLayers.length} layers on`
    case 'list_layers':
      return `${out.count} of ${out.totalAvailable} layers`
    case 'set_layer':
      return `${out.id} ${out.on ? 'on' : 'off'}`
    case 'list_fires':
      return `${out.count} fire${out.count === 1 ? '' : 's'}`
    case 'set_fire_perimeters':
      return `perimeters ${out.mode}`
    case 'focus_fire':
      return `focused ${out.focused.name}`
    case 'fly_to':
      return `moved to ${out.movedTo.lat.toFixed(1)}, ${out.movedTo.lon.toFixed(1)}`
    case 'set_date':
      return out.clamped ? `clamped to ${out.date}` : out.date
    case 'animate_time':
      return `${out.frames} frames, ${out.from} → ${out.to}`
    case 'stop_animation':
      return 'stopped'
    default:
      return 'ok'
  }
}

function parseErr(t) {
  try {
    return JSON.parse(t).error
  } catch {
    return null
  }
}
