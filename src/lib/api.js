import { generateSampleRecalls } from '../data/sampleRecalls.js'
import { normalizeFsisAll, normalizeFdaAll, finalizeRecords } from './transform.js'

// USDA FSIS: no CORS + rejects non-browser UAs → must go through the Vite dev
// proxy (see vite.config.js). Override with VITE_RECALL_API in production.
const FSIS_ENDPOINT = import.meta.env.VITE_RECALL_API || '/api/recall'

// openFDA: sends `Access-Control-Allow-Origin: *`, so the browser can call it
// directly in dev and prod. Override with VITE_FDA_API if you want a proxy.
const FDA_ENDPOINT = import.meta.env.VITE_FDA_API || 'https://api.fda.gov/food/enforcement.json'

// Both feeds are clipped to the same window so the charts compare like with like.
export const START_YEAR = 2016
const MIN_DATE = new Date(START_YEAR, 0, 1)

const FDA_PAGE = 1000
const FDA_SKIP_CAP = 25000 // openFDA rejects skip beyond this without an API key

async function fetchJson(url, { timeoutMs = 20000 } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

// Keep a record if either date basis puts it in range, so switching bases in
// the UI doesn't drop rows near the START_YEAR boundary.
const sinceStart = (records) =>
  records.filter((r) => (r.initiationDate || r.date) >= MIN_DATE || (r.reportDate || r.date) >= MIN_DATE)

async function loadFsis() {
  const data = await fetchJson(FSIS_ENDPOINT)
  const raw = Array.isArray(data) ? data : data.results || data.data || []
  const records = sinceStart(normalizeFsisAll(raw))
  if (!records.length) throw new Error('no records')
  return records
}

async function loadFda() {
  const search = `recall_initiation_date:%5B${START_YEAR}0101+TO+99991231%5D`
  const base = `${FDA_ENDPOINT}?search=${search}&sort=recall_initiation_date:desc&limit=${FDA_PAGE}`

  const first = await fetchJson(`${base}&skip=0`)
  const total = Math.min(first?.meta?.results?.total || 0, FDA_SKIP_CAP)

  const skips = []
  for (let skip = FDA_PAGE; skip < total; skip += FDA_PAGE) skips.push(skip)
  const rest = await Promise.all(
    skips.map((skip) =>
      fetchJson(`${base}&skip=${skip}`).then(
        (d) => d?.results || [],
        () => [], // tolerate a single page failing
      ),
    ),
  )

  const raw = [...(first?.results || []), ...rest.flat()]
  const records = sinceStart(normalizeFdaAll(raw))
  if (!records.length) throw new Error('no records')
  return records
}

function summarize(agency, records) {
  return {
    agency,
    count: records.length,
    oldest: records.length ? records[records.length - 1].date : null,
    newest: records.length ? records[0].date : null,
  }
}

/**
 * Load both agencies in parallel, each clipped to START_YEAR. Either source
 * falls back to its slice of the bundled sample data independently, so one API
 * being down never blanks the app.
 *
 * @returns {Promise<{records: object[], sources: Array<object>}>}
 */
export async function loadAllRecalls() {
  const sample = generateSampleRecalls({ start: `${START_YEAR}-01` })

  const [fsisRes, fdaRes] = await Promise.allSettled([loadFsis(), loadFda()])

  const sources = []
  let records = []

  const add = (agency, res, sampleRaw, normalize) => {
    if (res.status === 'fulfilled') {
      records = records.concat(res.value)
      sources.push({ status: 'live', ...summarize(agency, res.value) })
    } else {
      const fallback = sinceStart(normalize(sampleRaw))
      records = records.concat(fallback)
      sources.push({
        status: 'sample',
        error: String(res.reason?.message || res.reason),
        ...summarize(agency, fallback),
      })
    }
  }

  add('USDA FSIS', fsisRes, sample.fsis, normalizeFsisAll)
  add('FDA', fdaRes, sample.fda, normalizeFdaAll)

  return { records: finalizeRecords(records), sources }
}
