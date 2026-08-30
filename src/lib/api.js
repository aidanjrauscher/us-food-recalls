import { generateSampleRecalls } from '../data/sampleRecalls.js'
import { normalizeFsisAll, normalizeFdaAll, finalizeRecords } from './transform.js'

// USDA FSIS actually sends `Access-Control-Allow-Origin: *`, so a real browser
// on a normal connection can call it directly — that's what we do in a
// production build. Its Akamai edge only blocks datacenter/hosting IPs (a
// Vercel/Lambda proxy gets 403), so proxying server-side would be worse, not
// better. In dev we still route through the Vite proxy (see vite.config.js) to
// keep the request same-origin and quiet. Override either with VITE_RECALL_API.
const FSIS_ENDPOINT =
  import.meta.env.VITE_RECALL_API ||
  (import.meta.env.DEV ? '/api/recall' : 'https://www.fsis.usda.gov/fsis/api/recall/v/1')

// openFDA: sends `Access-Control-Allow-Origin: *`, so the browser can call it
// directly in dev and prod. Override with VITE_FDA_API if you want a proxy.
const FDA_ENDPOINT = import.meta.env.VITE_FDA_API || 'https://api.fda.gov/food/enforcement.json'

// Both feeds are clipped to the same window so the charts compare like with like.
export const START_YEAR = 2016
const MIN_DATE = new Date(START_YEAR, 0, 1)

const FDA_PAGE = 1000
const FDA_YEAR_CONCURRENCY = 4 // gentle on openFDA's 240 req/min limit

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchJson(url, { timeoutMs = 20000, retries = 0 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal })
      if (res.ok) return await res.json()
      // Retry only transient failures (rate limit / upstream hiccup).
      if (attempt < retries && (res.status === 429 || res.status >= 500)) {
        await sleep(500 * 2 ** attempt)
        continue
      }
      throw new Error(`HTTP ${res.status}`)
    } catch (err) {
      if (attempt < retries && err.name !== 'AbortError') {
        await sleep(500 * 2 ** attempt)
        continue
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }
}

// Run `fn` over `items` with at most `limit` in flight; preserves order.
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let cursor = 0
  const worker = async () => {
    while (cursor < items.length) {
      const i = cursor++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

// Keep a record if either date basis puts it in range, so switching bases in
// the UI doesn't drop rows near the START_YEAR boundary.
const sinceStart = (records) =>
  records.filter((r) => (r.initiationDate || r.date) >= MIN_DATE || (r.reportDate || r.date) >= MIN_DATE)

async function loadFsis() {
  const data = await fetchJson(FSIS_ENDPOINT, { retries: 2 })
  const raw = Array.isArray(data) ? data : data.results || data.data || []
  const records = sinceStart(normalizeFsisAll(raw))
  if (!records.length) throw new Error('no records')
  return records
}

// openFDA hard-caps `skip` at 25 000, so we page one calendar year at a time —
// each year holds ~1–2k records, well under the ceiling — which also scales
// indefinitely as the archive grows. Every request retries transient failures;
// a year that still can't be completed throws (→ FDA falls back to sample data)
// rather than silently dropping ~a year of recalls.
async function loadFdaYear(year) {
  const search = `recall_initiation_date:%5B${year}0101+TO+${year}1231%5D`
  const base = `${FDA_ENDPOINT}?search=${search}&sort=recall_initiation_date:desc&limit=${FDA_PAGE}`

  const first = await fetchJson(`${base}&skip=0`, { retries: 3 })
  const results = first?.results || []
  const total = first?.meta?.results?.total || results.length
  if (results.length >= total) return results

  const skips = []
  for (let skip = FDA_PAGE; skip < total; skip += FDA_PAGE) skips.push(skip)
  const pages = await Promise.all(
    skips.map((skip) => fetchJson(`${base}&skip=${skip}`, { retries: 3 }).then((d) => d?.results || [])),
  )

  const all = [...results, ...pages.flat()]
  if (all.length < total) throw new Error(`FDA ${year}: got ${all.length}/${total} records`)
  return all
}

async function loadFda() {
  const endYear = new Date().getFullYear()
  const years = []
  for (let y = START_YEAR; y <= endYear; y++) years.push(y)

  const raw = (await mapLimit(years, FDA_YEAR_CONCURRENCY, loadFdaYear)).flat()
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
