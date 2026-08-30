import {
  normalizeRisk,
  inferProductType,
  isTruthyFlag,
} from './categorize.js'

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
}

/**
 * Recall dates come through in a few shapes across the two feeds / archives:
 *   "Jul 22, 2024" | "2024-07-22" | "07/22/2024" | "20240722" (openFDA)
 * Return a Date (local midnight) or null.
 */
export function parseRecallDate(raw, fallbackYear) {
  if (!raw) return yearOnly(fallbackYear)
  const s = String(raw).trim()

  let m = s.match(/^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})$/)
  if (m) {
    const mon = MONTHS[m[1].slice(0, 3).toLowerCase()]
    if (mon != null) return new Date(+m[3], mon, +m[2])
  }

  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return new Date(+m[1], +m[2] - 1, +m[3])

  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return new Date(+m[3], +m[1] - 1, +m[2])

  m = s.match(/^(\d{4})(\d{2})(\d{2})$/) // openFDA YYYYMMDD
  if (m) return new Date(+m[1], +m[2] - 1, +m[3])

  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? yearOnly(fallbackYear) : d
}

function yearOnly(year) {
  const y = parseInt(year, 10)
  return Number.isFinite(y) ? new Date(y, 0, 1) : null
}

export function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(key) {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  })
}

const stripHtml = (s) =>
  String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Turn a raw USDA FSIS recall record into the flat shape the dashboard uses. */
export function normalizeFsisRecord(r) {
  // FSIS publishes a single date per recall (the notice date) — it has no
  // separate initiation vs. report date, so both bases resolve to the same day.
  const date = parseRecallDate(r.field_recall_date, r.field_year)
  const states = String(r.field_states || '')
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)

  // `field_recall_type` is FSIS's real open/closed signal:
  // "Active Recall" | "Closed Recall" | "Public Health Alert".
  // `field_active_notice` only ever flags the single front-page notice, so it's
  // used just as a fallback for feeds (e.g. the sample data) that lack the type.
  const recallType = String(r.field_recall_type || '').trim()
  const active = recallType
    ? /^active/i.test(recallType)
    : isTruthyFlag(r.field_active_notice) && !isTruthyFlag(r.field_archive_recall)

  return {
    id: r.field_recall_number || r.field_recall_number_export || r.field_title || crypto.randomUUID(),
    number: r.field_recall_number || r.field_recall_number_export || '',
    title: stripHtml(r.field_title) || 'Untitled recall',
    date,
    initiationDate: date,
    reportDate: date,
    monthKey: date ? monthKey(date) : null,
    year: date ? date.getFullYear() : parseInt(r.field_year, 10) || null,
    // `field_recall_classification` is clean ("Class I".."Class III", "Public
    // Health Alert"); `field_risk_level` has swapped word/number prefixes in the
    // live data ("Low - Class II"), so only fall back to it.
    risk: normalizeRisk(r.field_recall_classification || r.field_risk_level),
    riskRaw: r.field_risk_level || r.field_recall_classification || '',
    productType: inferProductType(r),
    active,
    recallType: recallType || (active ? 'Active Recall' : 'Closed Recall'),
    archived: isTruthyFlag(r.field_archive_recall),
    closedYear: String(r.field_closed_year || '').trim(),
    reason: stripHtml(r.field_recall_reason) || 'Not specified',
    processing: stripHtml(r.field_processing) || '',
    establishment: stripHtml(r.field_establishment) || '',
    company: stripHtml(r.field_company) || stripHtml(r.field_establishment) || '',
    states,
    summary: stripHtml(r.field_summary),
    url: r.field_recall_url || r.url || '',
    agency: 'USDA FSIS',
  }
}

const FDA_STATUS_ACTIVE = /^(ongoing|pending)/i

/** Turn a raw openFDA food-enforcement record into the same flat shape. */
export function normalizeFdaRecord(r) {
  const classificationDate = parseRecallDate(r.center_classification_date)
  const initiationDate =
    parseRecallDate(r.recall_initiation_date) || parseRecallDate(r.report_date) || classificationDate
  const reportDate = parseRecallDate(r.report_date) || classificationDate || initiationDate
  const date = initiationDate // default basis; applyDateBasis() can switch it

  const states = String(r.distribution_pattern || r.state || '')
    .replace(/\bnationwide\b/i, 'Nationwide')
    .split(/[,;]|\band\b/)
    .map((s) => s.trim())
    .filter((s) => s && !/^(the|entire|us|usa|united states)$/i.test(s))

  const status = String(r.status || '').trim()
  const firm = stripHtml(r.recalling_firm)

  // openFDA has no per-recall page, and the recall number ("F-1234-2026") never
  // appears in the FDA site's press-release text — searching on it always came
  // back empty. Search the recalls page by firm name instead: it lands on the
  // press release for the higher-profile recalls that have one, and on a valid
  // FDA search-results page for that firm otherwise. Trim the "C/O <logistics>"
  // tail and a trailing legal suffix so more searches hit.
  const firmQuery = firm
    .replace(/\s+c\/o\b.*/i, '')
    .replace(/[,.]?\s+(inc|llc|l\.l\.c|lp|l\.p|corp|co|ltd|plc|company|incorporated)\.?\s*$/i, '')
    .trim()
  const FDA_RECALLS_URL = 'https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts'

  return {
    id: r.recall_number || r.event_id || crypto.randomUUID(),
    number: r.recall_number || '',
    title: firm
      ? `${firm} — ${truncate(stripHtml(r.product_description), 120)}`
      : truncate(stripHtml(r.product_description), 140) || 'Food recall',
    date,
    initiationDate,
    reportDate,
    monthKey: date ? monthKey(date) : null,
    year: date ? date.getFullYear() : null,
    risk: normalizeRisk(r.classification),
    riskRaw: r.classification || '',
    productType: inferProductType(r),
    active: FDA_STATUS_ACTIVE.test(status),
    recallType: status || 'Unknown',
    archived: /^(completed|terminated)/i.test(status),
    closedYear: (() => {
      const d = parseRecallDate(r.termination_date)
      return d ? String(d.getFullYear()) : ''
    })(),
    reason: stripHtml(r.reason_for_recall) || 'Not specified',
    processing: stripHtml(r.voluntary_mandated) || '',
    establishment: firm,
    company: firm,
    states,
    summary: stripHtml(r.product_description),
    url: firmQuery
      ? `${FDA_RECALLS_URL}?search_api_fulltext=${encodeURIComponent(firmQuery)}`
      : FDA_RECALLS_URL,
    agency: 'FDA',
  }
}

const truncate = (s, n) => (s && s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s || '')

/** Dedupe by agency + recall number, drop undated rows, newest first. */
export function finalizeRecords(records) {
  const seen = new Set()
  return records
    .filter((r) => r.date instanceof Date && !Number.isNaN(r.date.getTime()))
    .filter((r) => {
      const key = `${r.agency}:${r.number || r.id}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => b.date - a.date)
}

export function normalizeFsisAll(rawArray) {
  // The FSIS feed ships every bilingual recall twice (langcode "English" +
  // "Spanish") under one recall number. Keep English before deduping.
  return finalizeRecords(
    (Array.isArray(rawArray) ? rawArray : [])
      .filter((r) => {
        const lc = String(r.langcode || '').toLowerCase()
        return lc === '' || lc === 'en' || lc === 'english' || lc === 'und'
      })
      .map(normalizeFsisRecord),
  )
}

export function normalizeFdaAll(rawArray) {
  return finalizeRecords((Array.isArray(rawArray) ? rawArray : []).map(normalizeFdaRecord))
}

/**
 * Re-point every record's `date` / `monthKey` / `year` at the chosen date field
 * and re-sort newest-first. Mutates in place (records aren't shared).
 * @param {'initiation'|'report'} basis
 */
export function applyDateBasis(records, basis) {
  for (const r of records) {
    const d =
      basis === 'report'
        ? r.reportDate || r.initiationDate
        : r.initiationDate || r.reportDate
    r.date = d || r.date
    r.monthKey = r.date ? monthKey(r.date) : null
    r.year = r.date ? r.date.getFullYear() : null
  }
  records.sort((a, b) => b.date - a.date)
  return records
}

/**
 * Build a continuous list of month buckets (no gaps) spanning `months` back
 * from the most recent recall, each with a total plus per-risk and
 * per-product-type breakdowns.
 */
export function buildMonthlySeries(records, months, anchorDate) {
  const newest = anchorDate || (records.length ? records[0].date : null)
  if (!newest) return { keys: [], buckets: {} }

  const end = new Date(newest.getFullYear(), newest.getMonth(), 1)
  const keys = []
  const cursor = new Date(end)

  const span = months || 999
  for (let i = 0; i < span; i++) {
    keys.unshift(monthKey(cursor))
    cursor.setMonth(cursor.getMonth() - 1)
  }
  if (!months && records.length) {
    // "All time" — clamp to the oldest record we actually have.
    const oldestKey = monthKey(records[records.length - 1].date)
    while (keys.length && keys[0] < oldestKey) keys.shift()
  }

  const keySet = new Set(keys)
  const buckets = {}
  for (const k of keys) {
    buckets[k] = { total: 0, active: 0, byRisk: {}, byType: {}, byAgency: {} }
  }

  for (const r of records) {
    if (!keySet.has(r.monthKey)) continue
    const b = buckets[r.monthKey]
    b.total += 1
    if (r.active) b.active += 1
    b.byRisk[r.risk] = (b.byRisk[r.risk] || 0) + 1
    b.byType[r.productType] = (b.byType[r.productType] || 0) + 1
    b.byAgency[r.agency] = (b.byAgency[r.agency] || 0) + 1
  }

  return { keys, buckets }
}

export function tally(records, field) {
  const out = {}
  for (const r of records) out[r[field]] = (out[r[field]] || 0) + 1
  return out
}
