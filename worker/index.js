/**
 * WFDT chat worker — the smallest possible thing that can hold the Bedrock
 * credential.
 *
 * GitHub Pages serves static files, so it cannot answer a model call: every
 * chat turn needs a live, authenticated request to Bedrock, and a key shipped
 * to the browser would be public. This Worker is the missing piece. It runs on
 * Cloudflare's free tier, holds `AWS_BEARER_TOKEN_BEDROCK` as a Worker secret
 * (pushed straight from GitHub Secrets by deploy-worker.yml, so the credential
 * never touches a laptop), and exposes exactly one route.
 *
 * It carries no map data at all: the fire perimeters come straight from the
 * public WFIGS service to the browser, and every raster layer is a public tile
 * endpoint. Chat is the one thing a static site cannot do for itself, because
 * it needs a credential, so chat is the only thing here.
 *
 *   GET  /api/health   what model resolved, and where
 *   POST /api/chat     Converse, streamed back to the browser as SSE
 *   POST /api/suggest  three follow-up questions for the conversation so far
 */

const DEFAULT_MODELS = [
  'us.anthropic.claude-opus-5',
  'us.anthropic.claude-sonnet-5',
  'us.anthropic.claude-opus-4-8',
  'us.anthropic.claude-opus-4-7',
  'us.anthropic.claude-opus-4-6-v1',
  'us.anthropic.claude-sonnet-4-6',
  'us.anthropic.claude-opus-4-5-20251101-v1:0',
  'us.anthropic.claude-haiku-4-5-20251001-v1:0',
]

const SYSTEM_PROMPT = `You are the WFDT wildfire assistant, embedded in a map of the Los Angeles basin and the ranges around it.

The map carries the NASA and interagency layers used for wildfire situational awareness: active and historical fire perimeters from WFIGS; thermal anomaly and fire-temperature products from MODIS, VIIRS and GOES; vegetation indices and land surface temperature; SMAP soil moisture; smoke and air quality from TROPOMI, TEMPO, MERRA-2 and MAIAC; IMERG precipitation; an animated NOAA GFS 10 m wind field over southern California; and — on the JPL network only — the Predict What We Breathe air-quality forecasts, FDEO fire danger, AVIRIS FireSense quicklooks and HRRR weather fields.

You have tools that read the live map, switch layers, move the view and drive the timeline. Use them rather than guessing: if the user asks what is burning, query it.

GROUNDING RULES — these override any instinct to be helpful by filling gaps:

1. Every factual claim about what is on the map — which fires, where, how large, how contained, which layers are on, what date is shown — must come from a tool call in this conversation. Never answer these from memory.
2. If a tool returns nothing or errors, say exactly that. "No perimeters are in view" is a correct answer; do not substitute a plausible one.
3. Never invent an incident name, acreage, containment figure, cause or evacuation order. If a field came back null, report it as unknown.
4. Fire perimeters are the official reported footprint, not a live fire front; they lag, sometimes by a day or more. Thermal anomaly products detect heat, which is not the same as fire — they also flag industrial sources and reflective surfaces.

5. There are three perimeter sources and they are not interchangeable. 'current' is what is burning now. 'ytd' is every fire so far in the present season, and is what a question about this year means. 'historic' is the certified archive: it runs from the 1800s to 2024, thins out sharply after about 2021, and holds nothing at all for 2025 or 2026, because certification takes years. So a request for a recent year should go to 'ytd', not to the archive with a year filter — and if someone asks the archive for a year it does not hold, say the archive does not have it yet and offer the season-to-date layer instead.
6. You are not an emergency authority. If asked whether a place is safe or should evacuate, give what the data shows and point the user to CAL FIRE, local emergency services and watchduty.org for official orders. Never issue or imply an evacuation instruction.
7. You know wildfire science, fire weather and how these instruments work; answer background questions from that knowledge, but keep it clearly separate from live map readings.
8. If you are unsure, say so. A wrong number in an operational fire tool is worse than no number.

Be concise and factual. Give latitude/longitude to one decimal place, acreage rounded, and always include units.

You are writing into a narrow side panel. Use short sentences and bullet lists. Never use markdown tables: they are not rendered and arrive as rows of raw pipe characters.`

const TOOLS = [
  {
    toolSpec: {
      name: 'get_map_state',
      description:
        'Read the current map: centre, zoom, visible bounds, selected date, basemap, which layers are on, and how many fire perimeters are drawn.',
      inputSchema: { json: { type: 'object', properties: {} } },
    },
  },
  {
    toolSpec: {
      name: 'list_layers',
      description:
        'List available map layers, optionally filtered by a search term matched against name and group. Call this before set_layer so you use a real id. Layers served only from JPL hosts are omitted when unreachable.',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            search: {
              type: 'string',
              description: 'Optional filter, e.g. "smoke", "vegetation", "GOES"',
            },
          },
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'set_layer',
      description:
        "Turn a map layer on or off by its id from list_layers. The id 'wind' additionally toggles the GFS 10 m wind particle layer, which is not part of the tile catalogue.",
      inputSchema: {
        json: {
          type: 'object',
          properties: { id: { type: 'string' }, on: { type: 'boolean' } },
          required: ['id', 'on'],
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'set_fire_perimeters',
      description:
        "Choose which fire perimeters to show. 'current' is what is burning now; 'ytd' is every fire so far this season, which is the right source for a question about this year; 'historic' is the certified archive, which only reaches 2024 and is sparse after about 2021. Perimeters load for the visible extent, so move the map first when asking about somewhere else.",
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            mode: { type: 'string', enum: ['current', 'ytd', 'historic', 'off'] },
            year: {
              type: 'integer',
              description:
                'Restrict the historical archive to one fire year. Ignored for the other modes, which are a single season already.',
            },
          },
          required: ['mode'],
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'list_fires',
      description:
        'List the fire perimeters currently drawn, largest first, with name, acreage, containment, discovery date and centre position.',
      inputSchema: {
        json: {
          type: 'object',
          properties: { limit: { type: 'integer', description: 'Max results, default 10' } },
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'focus_fire',
      description:
        'Zoom to a named fire perimeter and open its detail popup, as if the user had clicked it. Only matches perimeters already loaded.',
      inputSchema: {
        json: {
          type: 'object',
          properties: { name: { type: 'string', description: 'Incident name, or part of it' } },
          required: ['name'],
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'get_wind',
      description:
        "Sample the NOAA GFS 10 m wind at a point. Returns speed and the meteorological direction the wind blows FROM. The layer must be on first — turn it on with set_layer id 'wind'. The grid covers 30-40N, 125-110W only.",
      inputSchema: {
        json: {
          type: 'object',
          properties: { lat: { type: 'number' }, lon: { type: 'number' } },
          required: ['lat', 'lon'],
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'fly_to',
      description:
        'Move the map to a latitude and longitude, optionally with a zoom level. Use for place names you know, such as Pacific Palisades or the Angeles National Forest.',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            lat: { type: 'number' },
            lon: { type: 'number' },
            zoom: { type: 'integer', description: '3 to 16' },
          },
          required: ['lat', 'lon'],
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'set_date',
      description:
        'Move the timeline to a date (YYYY-MM-DD). Every time-aware layer follows. Returns clamped:true when the date falls outside the timeline span — say so rather than implying it is shown.',
      inputSchema: {
        json: {
          type: 'object',
          properties: { date: { type: 'string', description: 'YYYY-MM-DD' } },
          required: ['date'],
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'animate_time',
      description:
        'Play a time-lapse across a date range, redrawing every time-aware layer. Returns the frame count and the step actually used — the step is widened automatically for long ranges, so report what came back rather than what was asked.',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            from: { type: 'string', description: 'Start date YYYY-MM-DD (older)' },
            to: { type: 'string', description: 'End date YYYY-MM-DD (newer)' },
            stepDays: { type: 'integer', description: 'Days between frames, default 1' },
            intervalMs: { type: 'integer', description: 'Milliseconds per frame, default 700' },
            loop: { type: 'boolean', description: 'Repeat at the end, default true' },
          },
          required: ['from', 'to'],
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'stop_animation',
      description: 'Stop a running time-lapse and leave the timeline where it is.',
      inputSchema: { json: { type: 'object', properties: {} } },
    },
  },
]

/**
 * Decoder for the AWS `vnd.amazon.eventstream` framing, written against
 * Uint8Array/DataView because Workers have no Node Buffer.
 *
 * Frame: [4] total length [4] headers length [4] prelude CRC
 *        [headers] [payload] [4] message CRC
 * Header entry: [1] name len, name, [1] value type, value (type 7 = string).
 * CRCs are not verified — the transport is TLS, and a corrupt frame surfaces
 * as a JSON parse error the caller already handles.
 */
class EventStreamDecoder {
  constructor() {
    this.buf = new Uint8Array(0)
  }

  push(chunk) {
    const merged = new Uint8Array(this.buf.length + chunk.length)
    merged.set(this.buf, 0)
    merged.set(chunk, this.buf.length)
    this.buf = merged

    const out = []
    const td = new TextDecoder()

    while (this.buf.length >= 16) {
      const view = new DataView(this.buf.buffer, this.buf.byteOffset, this.buf.byteLength)
      const total = view.getUint32(0)
      if (!Number.isFinite(total) || total < 16 || total > 1 << 26) {
        this.buf = new Uint8Array(0) // unrecoverable desync
        break
      }
      if (this.buf.length < total) break

      const headersLen = view.getUint32(4)
      const headers = this.#headers(this.buf.subarray(12, 12 + headersLen), td)
      const payload = this.buf.subarray(12 + headersLen, total - 4)

      let parsed = null
      if (payload.length) {
        try {
          parsed = JSON.parse(td.decode(payload))
        } catch {
          parsed = null
        }
      }
      out.push({
        type: headers[':event-type'],
        messageType: headers[':message-type'],
        payload: parsed,
      })
      this.buf = this.buf.slice(total)
    }
    return out
  }

  #headers(buf, td) {
    const h = {}
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    let o = 0
    while (o < buf.length) {
      const nameLen = view.getUint8(o)
      o += 1
      const name = td.decode(buf.subarray(o, o + nameLen))
      o += nameLen
      const type = view.getUint8(o)
      o += 1
      if (type === 7 || type === 6) {
        const len = view.getUint16(o)
        o += 2
        if (type === 7) h[name] = td.decode(buf.subarray(o, o + len))
        o += len
      } else if (type === 0 || type === 1) {
        // boolean — no payload
      } else if (type === 2) o += 1
      else if (type === 3) o += 2
      else if (type === 4) o += 4
      else if (type === 5 || type === 8) o += 8
      else if (type === 9) o += 16
      else break // unknown type: cannot safely walk further
    }
    return h
  }
}

function cors(env, request) {
  const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim())
  const origin = request.headers.get('origin')
  const allow =
    allowed.includes('*') || !origin ? '*' : allowed.includes(origin) ? origin : null
  return {
    ...(allow ? { 'Access-Control-Allow-Origin': allow, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  }
}

/**
 * Follow-up suggestions are generated separately from the answer.
 *
 * They cannot come from the main turn: they depend on what the assistant just
 * said, so by the time there is anything to react to that turn has finished
 * streaming. A second small call is cheaper and simpler than a tool round, and
 * because it runs after the answer is on screen it costs the reader nothing.
 *
 * The capability list is spelled out because a suggestion the app cannot act
 * on is worse than a generic one — it invites a question that can only be
 * answered with "I can't do that".
 */
const SUGGEST_SYSTEM = `You write follow-up questions for a user of WFDT, a wildfire map of the Los Angeles area with a built-in assistant.

The assistant can, and ONLY can:
- read the current map view, and move it to a place or zoom
- list the available map layers and turn any of them on or off (thermal anomalies, vegetation indices, smoke and air quality, soil moisture, precipitation, weather model fields)
- show an animated GFS 10 m wind field and sample its speed and direction at a point
- show fire perimeters from three sources — burning now, this season to date, or the pre-2025 archive — list the ones in view with acreage and containment, and zoom to a named one
- move the timeline to a date, and play or stop a time-lapse across a date range
- answer background questions about wildfire science, fire weather and how these instruments work

Given the conversation so far, propose exactly 3 follow-ups the user is plausibly about to want next.

Rules:
- Each must be answerable with the capabilities above. Never propose anything else.
- Follow where the conversation actually went. If the last answer was about one fire, good follow-ups are about that fire, the terrain and fuels around it, or the conditions driving it.
- Do not repeat a question already asked, and do not restate what was just answered.
- Vary them: a natural set explores a different place, a different quantity, or a different time, rather than three rewordings.
- label is a button in a narrow panel: at most 22 characters, no trailing full stop.
- text is the full question, phrased as the user would type it.`

const SUGGEST_TOOL = {
  toolSpec: {
    name: 'suggest',
    description: 'Return the follow-up questions to offer the user.',
    inputSchema: {
      json: {
        type: 'object',
        properties: {
          suggestions: {
            type: 'array',
            description: 'Exactly 3 follow-ups.',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string', description: 'Button text, at most 22 characters' },
                text: { type: 'string', description: 'The full question to send' },
              },
              required: ['label', 'text'],
            },
          },
        },
        required: ['suggestions'],
      },
    },
  },
}

// Suggestions are throwaway text on a hot path, so prefer the cheapest fast
// model and only fall back to the chat model if it is not entitled.
/**
 * Shorten a chip label without slicing through a word.
 *
 * A hard cut produces things like "Vegetation near Topang", which reads as a typo
 * rather than an abbreviation. The cap is loose enough that a well-behaved
 * label is never touched; the full question is on the button's tooltip
 * regardless.
 */
function clipLabel(s, max = 28) {
  const t = s.trim().replace(/[.\s]+$/, '')
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const sp = cut.lastIndexOf(' ')
  return `${(sp > max * 0.5 ? cut.slice(0, sp) : cut).replace(/[,;:]$/, '')}\u2026`
}

const SUGGEST_MODELS = [
  'us.anthropic.claude-haiku-4-5-20251001-v1:0',
  'us.anthropic.claude-sonnet-5',
]

const bedrockUrl = (region, model, streaming) =>
  `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(model)}/${
    streaming ? 'converse-stream' : 'converse'
  }`

/**
 * Find a model this account can actually invoke, best first.
 *
 * Workers are stateless between requests, so this probe runs per cold request
 * unless a resolved id is pinned. Set BEDROCK_MODEL once you know which one
 * you are entitled to and this becomes a no-op.
 */
async function resolveModel(env) {
  if (env.BEDROCK_MODEL) return env.BEDROCK_MODEL
  const region = env.AWS_REGION || 'us-west-2'
  const list = (env.BEDROCK_MODELS || DEFAULT_MODELS.join(','))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  for (const m of list) {
    try {
      const r = await fetch(bedrockUrl(region, m, false), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.AWS_BEARER_TOKEN_BEDROCK}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: [{ text: 'ok' }] }],
          inferenceConfig: { maxTokens: 4 },
        }),
      })
      if (r.ok) return m
    } catch {
      // try the next candidate
    }
  }
  throw new Error('no entitled Bedrock model found')
}

export default {
  async fetch(request, env) {
    const headers = cors(env, request)
    const url = new URL(request.url)
    const route = url.pathname.replace(/\/+$/, '') || '/'

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })

    const json = (code, body) =>
      new Response(JSON.stringify(body), {
        status: code,
        headers: { ...headers, 'content-type': 'application/json; charset=utf-8' },
      })

    if (!env.AWS_BEARER_TOKEN_BEDROCK) {
      return json(503, { error: 'AWS_BEARER_TOKEN_BEDROCK is not set on this Worker' })
    }

    if (route === '/api/health' || route === '/') {
      try {
        const model = await resolveModel(env)
        return json(200, {
          ok: true,
          chat: { configured: true, model, region: env.AWS_REGION || 'us-west-2' },
          note: 'Chat only. Fire perimeters are fetched directly from WFIGS by the browser.',
        })
      } catch (e) {
        return json(502, { ok: false, error: e.message })
      }
    }

    // ── Follow-up suggestions ───────────────────────────────────────────
    if (route === '/api/suggest') {
      if (request.method !== 'POST') return json(405, { error: 'POST only' })

      let body
      try {
        body = await request.json()
      } catch {
        return json(400, { error: 'Body must be JSON' })
      }

      // The client sends a plain transcript, not the Converse history: tool
      // blocks are noise here and would have to be paired up to stay valid.
      const turns = Array.isArray(body?.turns) ? body.turns.slice(-8) : []
      const messages = []
      for (const t of turns) {
        const text = String(t?.text ?? '').trim().slice(0, 2000)
        const role = t?.role === 'assistant' ? 'assistant' : 'user'
        if (!text) continue
        // Converse requires alternating roles starting with the user.
        if (!messages.length && role !== 'user') continue
        const last = messages[messages.length - 1]
        if (last?.role === role) last.content[0].text += `\n${text}`
        else messages.push({ role, content: [{ text }] })
      }
      if (!messages.length) return json(400, { error: 'No conversation to work from' })
      if (messages[messages.length - 1].role === 'assistant') {
        messages.push({ role: 'user', content: [{ text: 'Suggest my next questions.' }] })
      }

      const region = env.AWS_REGION || 'us-west-2'
      const candidates = [...SUGGEST_MODELS]
      try {
        candidates.push(await resolveModel(env))
      } catch {
        // resolveModel failing is not fatal here; the fixed list may still work.
      }

      for (const model of candidates) {
        try {
          const r = await fetch(bedrockUrl(region, model, false), {
            method: 'POST',
            headers: {
              authorization: `Bearer ${env.AWS_BEARER_TOKEN_BEDROCK}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              messages,
              system: [{ text: SUGGEST_SYSTEM }],
              toolConfig: { tools: [SUGGEST_TOOL], toolChoice: { tool: { name: 'suggest' } } },
              inferenceConfig: { maxTokens: 500, temperature: 0 },
            }),
          })
          if (!r.ok) continue
          const out = await r.json()
          const call = (out?.output?.message?.content || []).find((c) => c.toolUse)
          const list = call?.toolUse?.input?.suggestions
          if (!Array.isArray(list) || !list.length) continue

          const suggestions = list
            .filter((x) => x && typeof x.label === 'string' && typeof x.text === 'string')
            .slice(0, 3)
            .map((x) => ({ label: clipLabel(x.label), text: x.text.trim().slice(0, 300) }))
            .filter((x) => x.label && x.text)
          if (!suggestions.length) continue

          return json(200, { suggestions, model })
        } catch {
          // try the next candidate
        }
      }
      // The caller keeps whatever chips it already has.
      return json(502, { error: 'Could not generate suggestions' })
    }

    if (route !== '/api/chat' || request.method !== 'POST') {
      return json(404, { error: 'not found' })
    }

    let body
    try {
      body = await request.json()
    } catch {
      return json(400, { error: 'invalid JSON body' })
    }
    if (!Array.isArray(body.messages) || !body.messages.length) {
      return json(400, { error: 'messages[] required' })
    }

    let model
    try {
      model = await resolveModel(env)
    } catch (e) {
      return json(502, { error: e.message })
    }

    const region = env.AWS_REGION || 'us-west-2'
    const upstream = await fetch(bedrockUrl(region, model, true), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.AWS_BEARER_TOKEN_BEDROCK}`,
        'content-type': 'application/json',
        accept: 'application/vnd.amazon.eventstream',
      },
      body: JSON.stringify({
        messages: body.messages,
        system: [{ text: SYSTEM_PROMPT }],
        toolConfig: { tools: TOOLS },
        // Temperature 0 for an operational readout: the same question should
        // give the same answer, and there is no reason to sample creatively
        // when the substance comes from tool results. It narrows the sampling
        // distribution rather than guaranteeing correctness — the grounding
        // rules in the system prompt are what actually constrain invention.
        // topP is deliberately left unset; tuning both at once is not
        // meaningful and Anthropic's guidance is to pick one.
        inferenceConfig: { maxTokens: 2048, temperature: 0 },
      }),
    })

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => '')
      return json(502, {
        error: `Bedrock HTTP ${upstream.status}`,
        detail: detail.slice(0, 400),
      })
    }

    // Translate the AWS event stream into the SSE contract the browser expects.
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()
    const enc = new TextEncoder()
    const send = (event, data) =>
      writer.write(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))

    ;(async () => {
      const dec = new EventStreamDecoder()
      const blocks = new Map()
      let stopReason = null
      try {
        await send('model', { model, region })
        const reader = upstream.body.getReader()
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          for (const msg of dec.push(value)) {
            const p = msg.payload
            if (!p) continue
            if (msg.type === 'contentBlockStart') {
              const tu = p.start?.toolUse
              blocks.set(
                p.contentBlockIndex,
                tu
                  ? { type: 'toolUse', name: tu.name, toolUseId: tu.toolUseId, input: '' }
                  : { type: 'text', text: '' }
              )
            } else if (msg.type === 'contentBlockDelta') {
              const b = blocks.get(p.contentBlockIndex) || { type: 'text', text: '' }
              blocks.set(p.contentBlockIndex, b)
              if (p.delta?.text != null) {
                b.text = (b.text || '') + p.delta.text
                await send('text', { text: p.delta.text })
              } else if (p.delta?.toolUse?.input != null) {
                b.input = (b.input || '') + p.delta.toolUse.input
              }
            } else if (msg.type === 'messageStop') {
              stopReason = p.stopReason
            } else if (msg.type === 'metadata' && p.usage) {
              await send('usage', p.usage)
            } else if (msg.messageType === 'exception' || p.message) {
              await send('error', { message: p.message || msg.type })
            }
          }
        }

        const content = [...blocks.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([, b]) => {
            if (b.type === 'toolUse') {
              let input = {}
              try {
                input = b.input ? JSON.parse(b.input) : {}
              } catch {
                input = {}
              }
              return { toolUse: { toolUseId: b.toolUseId, name: b.name, input } }
            }
            return { text: b.text || '' }
          })
          .filter((c) => c.toolUse || c.text)

        await send('done', { stopReason, content })
      } catch (e) {
        await send('error', { message: `stream interrupted: ${e.message}` })
      } finally {
        await writer.close()
      }
    })()

    return new Response(readable, {
      headers: {
        ...headers,
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
      },
    })
  },
}
