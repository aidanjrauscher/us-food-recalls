import './style.css'
import { inject } from '@vercel/analytics'
import { loadAllRecalls } from './lib/api.js'
import { buildMonthlySeries, monthLabel, tally, applyDateBasis } from './lib/transform.js'
import {
  RISK_LEVELS,
  RISK_COLORS,
  PRODUCT_TYPES,
  PRODUCT_COLORS,
  AGENCIES,
} from './lib/categorize.js'
import {
  createMonthlyChart,
  updateMonthlyChart,
  createRiskChart,
  createTypeChart,
  updateBreakdownChart,
} from './charts.js'
import {
  renderShell,
  buildWindowToggle,
  buildStackToggle,
  buildDateBasisToggle,
  buildAgencyFilters,
  buildRiskFilters,
  buildTypeFilters,
  renderStatCards,
  renderTable,
  renderSourceBadges,
} from './ui.js'

const state = {
  all: [],
  anchor: null, // Date of the newest recall across the whole dataset
  months: 24,
  stackBy: 'risk',
  dateBasis: 'initiation', // 'initiation' | 'report' — which date drives every view
  activeOnly: false,
  search: '', // free-text filter for the "Recalls in view" table only
  agencies: new Set(AGENCIES),
  risks: new Set(RISK_LEVELS),
  types: new Set(PRODUCT_TYPES),
}

// The facet-filtered set from the last render(); the table search narrows this
// without re-touching the charts.
let lastFiltered = []

// Vercel Web Analytics — no-ops off Vercel; logs to the console in dev.
// Also enable it in the Vercel project dashboard (Analytics tab).
inject()

const els = renderShell(document.getElementById('app'))
const monthlyChart = createMonthlyChart(els.monthlyCanvas)
const riskChart = createRiskChart(els.riskCanvas)
const typeChart = createTypeChart(els.typeCanvas)

const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0)

// Number of month buckets the current window spans (YTD = Jan..anchor month).
function windowMonths() {
  if (state.months === 'ytd') return (state.anchor?.getMonth() ?? 0) + 1
  return state.months
}

function windowRecords() {
  if (!state.anchor || (!state.months && state.months !== 'ytd')) return state.all
  let cutoffKey
  if (state.months === 'ytd') {
    cutoffKey = `${state.anchor.getFullYear()}-01`
  } else {
    const cutoff = new Date(state.anchor)
    cutoff.setMonth(cutoff.getMonth() - (state.months - 1))
    cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}`
  }
  return state.all.filter((r) => r.monthKey >= cutoffKey)
}

const applyFilters = (records) =>
  records.filter(
    (r) =>
      state.agencies.has(r.agency) &&
      state.risks.has(r.risk) &&
      state.types.has(r.productType) &&
      (!state.activeOnly || r.active),
  )

function render() {
  const filtered = applyFilters(windowRecords())
  const series = buildMonthlySeries(filtered, windowMonths(), state.anchor)

  updateMonthlyChart(monthlyChart, series, state.stackBy)
  updateBreakdownChart(riskChart, tally(filtered, 'risk'), RISK_LEVELS, RISK_COLORS)
  updateBreakdownChart(typeChart, tally(filtered, 'productType'), PRODUCT_TYPES, PRODUCT_COLORS)

  const monthsWithData = series.keys.length || 1
  let peak = 0
  let peakKey = series.keys[0] || ''
  for (const k of series.keys) {
    const t = series.buckets[k]?.total || 0
    if (t >= peak) {
      peak = t
      peakKey = k
    }
  }

  const activeCount = filtered.filter((r) => r.active).length
  const classICount = filtered.filter((r) => r.risk === 'Class I (High)').length
  const byAgency = tally(filtered, 'agency')
  const agencySplit = AGENCIES.filter((a) => byAgency[a])
    .map((a) => `${byAgency[a]} ${a === 'USDA FSIS' ? 'USDA' : a}`)
    .join(' · ')

  renderStatCards(els.statCards, {
    total: filtered.length,
    agencySplit,
    windowLabel:
      state.months === 'ytd'
        ? `${state.anchor.getFullYear()} year to date`
        : state.months
          ? `last ${state.months} months`
          : 'all time',
    active: activeCount,
    activePct: pct(activeCount, filtered.length),
    classI: classICount,
    classIPct: pct(classICount, filtered.length),
    perMonth: (filtered.length / monthsWithData).toFixed(1),
    peak,
    peakMonth: peakKey ? monthLabel(peakKey) : '—',
  })

  lastFiltered = filtered
  updateTable()
}

// Renders just the "Recalls in view" table. Applies the free-text search
// (all whitespace-separated terms must appear in the recall title, reason, or
// product description) on top of the current facet filters.
function updateTable() {
  const terms = state.search.toLowerCase().split(/\s+/).filter(Boolean)
  const rows = terms.length
    ? lastFiltered.filter((r) => {
        const hay = `${r.title} ${r.reason} ${r.summary}`.toLowerCase()
        return terms.every((t) => hay.includes(t))
      })
    : lastFiltered

  els.dateColHead.textContent = state.dateBasis === 'report' ? 'Report date' : 'Initiation date'
  renderTable(els.tableBody, rows.slice(0, 300), state.dateBasis)

  const capped = rows.length > 300 ? ' · first 300 shown' : ''
  els.tableCount.textContent = terms.length
    ? `${rows.length} of ${lastFiltered.length} match${capped}`
    : `${rows.length} shown${capped}`
}

function rebaseDates() {
  applyDateBasis(state.all, state.dateBasis)
  state.anchor = state.all.length ? state.all[0].date : new Date()
  updateChartNote()
}

function updateChartNote() {
  let newestFda = null
  for (const r of state.all) {
    if (r.agency === 'FDA' && r.date && (!newestFda || r.date > newestFda)) newestFda = r.date
  }
  const word = state.dateBasis === 'report' ? 'report' : 'initiation'
  const usda = 'USDA FSIS uses its single notice date under either setting.'
  if (!newestFda) {
    els.chartNote.textContent = `Bars are placed by recall ${word} date. ${usda}`
    return
  }
  const through = newestFda.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  els.chartNote.textContent =
    `Bars are placed by recall ${word} date. openFDA data currently reaches ${through}; ` +
    `newer months fill in as FDA classifies and reports recalls. ${usda}`
}

// Segmented toggles rebuild themselves so the active button restyles on click.
function mountWindowToggle() {
  buildWindowToggle(els.windowToggle, state.months, (v) => {
    state.months = v
    mountWindowToggle()
    render()
  })
}
function mountStackToggle() {
  buildStackToggle(els.stackToggle, state.stackBy, (v) => {
    state.stackBy = v
    mountStackToggle()
    render()
  })
}
function mountDateBasisToggle() {
  buildDateBasisToggle(els.dateBasisToggle, state.dateBasis, (v) => {
    state.dateBasis = v
    mountDateBasisToggle()
    rebaseDates()
    render()
  })
}

function hideLoading() {
  const el = els.loading
  if (!el) return
  el.classList.add('opacity-0', 'pointer-events-none')
  setTimeout(() => el.remove(), 300)
}

async function init() {
  const { records, sources } = await loadAllRecalls()
  renderSourceBadges(els.sourceBadge, sources)

  state.all = records
  rebaseDates()

  mountWindowToggle()
  mountStackToggle()
  mountDateBasisToggle()
  buildAgencyFilters(els.agencyFilters, state.agencies, render)
  buildRiskFilters(els.riskFilters, state.risks, render)
  buildTypeFilters(els.typeFilters, state.types, render)
  els.activeOnly.checked = state.activeOnly // browsers restore checkbox state on reload
  els.activeOnly.addEventListener('change', (e) => {
    state.activeOnly = e.target.checked
    render()
  })

  state.search = els.tableSearch.value.trim() // browsers may restore the field on reload
  els.tableSearch.addEventListener('input', (e) => {
    state.search = e.target.value.trim()
    updateTable()
  })

  render()
  hideLoading()
}

init().catch((err) => {
  console.error('Failed to initialize dashboard', err)
  hideLoading()
})
