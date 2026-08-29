import {
  RISK_LEVELS,
  RISK_COLORS,
  PRODUCT_TYPES,
  PRODUCT_COLORS,
  AGENCIES,
  AGENCY_COLORS,
} from './lib/categorize.js'

const WINDOWS = [
  { value: 12, label: '12 mo' },
  { value: 24, label: '24 mo' },
  { value: 36, label: '36 mo' },
  { value: 60, label: '5 yr' },
  { value: 0, label: 'Since 2016' },
]

export function renderShell(root) {
  root.innerHTML = /* html */ `
    <div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header class="mb-6">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 class="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              U.S. Food Recall Dashboard
            </h1>
            <p class="mt-1 text-sm text-slate-400">
              Monthly recall volume, risk class, active status and product type, combining the
              <a class="underline decoration-slate-600 underline-offset-2 hover:text-slate-200"
                 href="https://www.fsis.usda.gov/science-data/developer-resources/recall-api"
                 target="_blank" rel="noopener">USDA&nbsp;FSIS</a> and
              <a class="underline decoration-slate-600 underline-offset-2 hover:text-slate-200"
                 href="https://open.fda.gov/apis/food/enforcement/"
                 target="_blank" rel="noopener">openFDA</a> recall APIs.
            </p>
          </div>
          <div id="source-badge" class="text-xs sm:text-right"></div>
        </div>
      </header>

      <section id="stat-cards" class="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"></section>

      <section class="mb-6 space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3 sm:p-4">
        <div class="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div class="flex items-center gap-2">
            <span class="text-xs font-medium uppercase tracking-wide text-slate-500">Window</span>
            <div id="window-toggle" class="flex overflow-hidden rounded-lg border border-slate-700"></div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs font-medium uppercase tracking-wide text-slate-500">Stack chart by</span>
            <div id="stack-toggle" class="flex overflow-hidden rounded-lg border border-slate-700"></div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs font-medium uppercase tracking-wide text-slate-500" title="FDA only — USDA FSIS publishes a single recall date">Date basis</span>
            <div id="datebasis-toggle" class="flex overflow-hidden rounded-lg border border-slate-700"></div>
          </div>
          <label class="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input id="active-only" type="checkbox" autocomplete="off" class="h-4 w-4 rounded border-slate-600 bg-slate-800 accent-red-500" />
            Active recalls only
          </label>
        </div>
        <div class="flex flex-wrap items-start gap-x-4 gap-y-1 border-t border-slate-800 pt-3">
          <span class="mt-0.5 w-24 shrink-0 text-xs font-medium uppercase tracking-wide text-slate-500">Agency</span>
          <div class="flex flex-1 flex-wrap items-center gap-x-4 gap-y-2" id="agency-filters"></div>
        </div>
        <div class="flex flex-wrap items-start gap-x-4 gap-y-1">
          <span class="mt-0.5 w-24 shrink-0 text-xs font-medium uppercase tracking-wide text-slate-500">Risk class</span>
          <div class="flex flex-1 flex-wrap items-center gap-x-4 gap-y-2" id="risk-filters"></div>
        </div>
        <div class="flex flex-wrap items-start gap-x-4 gap-y-1">
          <span class="mt-0.5 w-24 shrink-0 text-xs font-medium uppercase tracking-wide text-slate-500">Product type</span>
          <div class="flex flex-1 flex-wrap items-center gap-x-4 gap-y-2" id="type-filters"></div>
        </div>
      </section>

      <section class="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <h2 class="text-sm font-semibold text-slate-200">Recalls per month</h2>
        <p id="chart-note" class="mb-3 text-xs text-slate-500"></p>
        <div class="h-[340px] sm:h-[400px]"><canvas id="monthly-chart"></canvas></div>
      </section>

      <section class="mb-6 grid gap-4 lg:grid-cols-2">
        <div class="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 class="mb-3 text-sm font-semibold text-slate-200">By risk class</h2>
          <div class="h-[300px]"><canvas id="risk-chart"></canvas></div>
        </div>
        <div class="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 class="mb-1 text-sm font-semibold text-slate-200">By product type</h2>
          <p class="mb-3 text-xs text-slate-500">Inferred from the product description &mdash; keyword heuristic.</p>
          <div class="h-[300px]"><canvas id="type-chart"></canvas></div>
        </div>
      </section>

      <section class="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-sm font-semibold text-slate-200">Recalls in view</h2>
          <span id="table-count" class="text-xs text-slate-500"></span>
        </div>
        <div class="scroll-thin max-h-[460px] overflow-auto rounded-lg border border-slate-800">
          <table class="w-full text-left text-sm">
            <thead class="sticky top-0 bg-slate-900 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th id="date-col-head" class="whitespace-nowrap px-3 py-2 font-medium">Date</th>
                <th class="px-3 py-2 font-medium">Agency</th>
                <th class="px-3 py-2 font-medium">Recall</th>
                <th class="px-3 py-2 font-medium">Risk</th>
                <th class="px-3 py-2 font-medium">Type</th>
                <th class="px-3 py-2 font-medium">Status</th>
                <th class="px-3 py-2 font-medium">States</th>
              </tr>
            </thead>
            <tbody id="table-body" class="divide-y divide-slate-800"></tbody>
          </table>
        </div>
      </section>

      <footer class="mx-auto mt-8 max-w-3xl space-y-2 text-center text-xs leading-relaxed text-slate-600">
        <p>Data: USDA FSIS Recall API + openFDA Food Enforcement API, both from January 2016 on.</p>
        <p>
          <span class="text-slate-500">Date basis</span> &mdash;
          <b class="font-medium text-slate-500">Initiated</b> uses the day the recalling firm began
          the recall (removing product, notifying customers); it dates each bar to when the food-safety
          problem actually surfaced.
          <b class="font-medium text-slate-500">Reported</b> uses the day FDA published the recall in
          its weekly Enforcement Report, which happens only after FDA classifies it &mdash; typically
          weeks to months later. So <i>Reported</i> is more complete for the most recent weeks but
          back-dates events (a recall started in June and posted in August shows under August). USDA
          FSIS publishes a single notice date, used under both settings.
        </p>
        <p>Product type is a keyword heuristic and may be imperfect.</p>
      </footer>
    </div>
  `

  return {
    sourceBadge: root.querySelector('#source-badge'),
    statCards: root.querySelector('#stat-cards'),
    windowToggle: root.querySelector('#window-toggle'),
    stackToggle: root.querySelector('#stack-toggle'),
    dateBasisToggle: root.querySelector('#datebasis-toggle'),
    activeOnly: root.querySelector('#active-only'),
    agencyFilters: root.querySelector('#agency-filters'),
    riskFilters: root.querySelector('#risk-filters'),
    typeFilters: root.querySelector('#type-filters'),
    chartNote: root.querySelector('#chart-note'),
    monthlyCanvas: root.querySelector('#monthly-chart'),
    riskCanvas: root.querySelector('#risk-chart'),
    typeCanvas: root.querySelector('#type-chart'),
    tableBody: root.querySelector('#table-body'),
    tableCount: root.querySelector('#table-count'),
    dateColHead: root.querySelector('#date-col-head'),
  }
}

export function buildSegmentedToggle(el, options, current, onChange) {
  el.innerHTML = ''
  for (const opt of options) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.dataset.value = String(opt.value)
    btn.textContent = opt.label
    btn.className = segClass(String(opt.value) === String(current))
    btn.addEventListener('click', () => onChange(opt.value))
    el.appendChild(btn)
  }
}

function segClass(active) {
  return (
    'px-3 py-1.5 text-xs font-medium transition-colors ' +
    (active
      ? 'bg-slate-100 text-slate-900'
      : 'bg-slate-800 text-slate-300 hover:bg-slate-700')
  )
}

export function buildWindowToggle(el, current, onChange) {
  buildSegmentedToggle(el, WINDOWS, current, onChange)
}

export function buildStackToggle(el, current, onChange) {
  buildSegmentedToggle(
    el,
    [
      { value: 'risk', label: 'Risk' },
      { value: 'type', label: 'Type' },
      { value: 'agency', label: 'Agency' },
    ],
    current,
    onChange,
  )
}

export function buildDateBasisToggle(el, current, onChange) {
  buildSegmentedToggle(
    el,
    [
      { value: 'initiation', label: 'Initiated' },
      { value: 'report', label: 'Reported' },
    ],
    current,
    onChange,
  )
}

function buildCheckList(el, items, colorMap, selectedSet, onChange) {
  el.innerHTML = ''
  for (const item of items) {
    const label = document.createElement('label')
    label.className = 'flex cursor-pointer items-center gap-1.5 text-xs text-slate-300'
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.checked = selectedSet.has(item)
    cb.className = 'h-3.5 w-3.5 rounded border-slate-600 bg-slate-800'
    cb.style.accentColor = colorMap[item]
    cb.addEventListener('change', () => {
      cb.checked ? selectedSet.add(item) : selectedSet.delete(item)
      onChange()
    })
    const dot = document.createElement('span')
    dot.className = 'inline-block h-2.5 w-2.5 rounded-full'
    dot.style.backgroundColor = colorMap[item]
    label.append(cb, dot, document.createTextNode(item))
    el.appendChild(label)
  }
}

export function buildAgencyFilters(el, selectedSet, onChange) {
  buildCheckList(el, AGENCIES, AGENCY_COLORS, selectedSet, onChange)
}

export function buildRiskFilters(el, selectedSet, onChange) {
  buildCheckList(el, RISK_LEVELS, RISK_COLORS, selectedSet, onChange)
}

export function buildTypeFilters(el, selectedSet, onChange) {
  buildCheckList(el, PRODUCT_TYPES, PRODUCT_COLORS, selectedSet, onChange)
}

const CARD_ACCENT = {
  total: 'text-slate-100',
  active: 'text-red-400',
  classI: 'text-amber-400',
  perMonth: 'text-sky-400',
}

export function renderStatCards(el, stats) {
  const cards = [
    { key: 'total', label: 'Recalls in window', value: stats.total, sub: stats.agencySplit || stats.windowLabel },
    { key: 'active', label: 'Currently active', value: stats.active, sub: `${stats.activePct}% of window` },
    { key: 'classI', label: 'Class I (high risk)', value: stats.classI, sub: `${stats.classIPct}% of window` },
    { key: 'perMonth', label: 'Avg / month', value: stats.perMonth, sub: `peak ${stats.peak} in ${stats.peakMonth}` },
  ]
  el.innerHTML = cards
    .map(
      (c) => /* html */ `
      <div class="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div class="text-xs font-medium uppercase tracking-wide text-slate-500">${c.label}</div>
        <div class="mt-1 text-3xl font-bold tabular-nums ${CARD_ACCENT[c.key]}">${c.value}</div>
        <div class="mt-1 text-xs text-slate-500">${c.sub}</div>
      </div>`,
    )
    .join('')
}

const RISK_BADGE = {
  'Class I (High)': 'bg-red-500/15 text-red-300 ring-red-500/30',
  'Class II (Marginal)': 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  'Class III (Low)': 'bg-blue-500/15 text-blue-300 ring-blue-500/30',
  'Public Health Alert': 'bg-purple-500/15 text-purple-300 ring-purple-500/30',
  Unclassified: 'bg-slate-500/15 text-slate-300 ring-slate-500/30',
}

const AGENCY_BADGE = {
  'USDA FSIS': 'bg-blue-500/15 text-blue-300 ring-blue-500/30',
  FDA: 'bg-teal-500/15 text-teal-300 ring-teal-500/30',
}

const badge = (text, cls) =>
  `<span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}">${text}</span>`

export function renderTable(tbody, records, dateBasis = 'initiation') {
  if (!records.length) {
    tbody.innerHTML =
      '<tr><td colspan="7" class="px-3 py-8 text-center text-slate-500">No recalls match the current filters.</td></tr>'
    return
  }
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
  tbody.innerHTML = records
    .map((r) => {
      // Show the other date as a hint when the two differ (FDA only).
      const otherDate = dateBasis === 'report' ? r.initiationDate : r.reportDate
      const otherLabel = dateBasis === 'report' ? 'initiated' : 'reported'
      const dateHint =
        otherDate && r.date && otherDate.getTime() !== r.date.getTime()
          ? `<div class="mt-0.5 text-[11px] text-slate-600">${otherLabel} ${fmt(otherDate)}</div>`
          : ''
      const status = r.active
        ? badge('Active', 'bg-red-500/15 text-red-300 ring-red-500/30')
        : r.risk === 'Public Health Alert'
          ? badge('Alert', 'bg-purple-500/15 text-purple-300 ring-purple-500/30')
          : badge('Closed', 'bg-slate-600/20 text-slate-400 ring-slate-600/30')
      const states = r.states.length
        ? r.states.slice(0, 3).join(', ') + (r.states.length > 3 ? ` +${r.states.length - 3}` : '')
        : '—'
      const title = r.url
        ? `<a href="${escapeHtml(r.url)}" target="_blank" rel="noopener" class="font-medium text-slate-200 hover:text-white hover:underline">${escapeHtml(r.title)}</a>`
        : `<span class="font-medium text-slate-200">${escapeHtml(r.title)}</span>`
      const agencyShort = r.agency === 'USDA FSIS' ? 'USDA' : r.agency
      return /* html */ `
        <tr class="align-top hover:bg-slate-800/40">
          <td class="whitespace-nowrap px-3 py-2 text-slate-400 tabular-nums">${fmt(r.date)}${dateHint}</td>
          <td class="whitespace-nowrap px-3 py-2">${badge(agencyShort, AGENCY_BADGE[r.agency] || AGENCY_BADGE.FDA)}</td>
          <td class="px-3 py-2">
            <div>${title}</div>
            <div class="mt-0.5 text-xs text-slate-500">${escapeHtml(r.reason)}</div>
          </td>
          <td class="whitespace-nowrap px-3 py-2">${badge(r.risk.replace(/ \(.*\)/, ''), RISK_BADGE[r.risk])}</td>
          <td class="whitespace-nowrap px-3 py-2 text-slate-300">${r.productType}</td>
          <td class="whitespace-nowrap px-3 py-2">${status}</td>
          <td class="whitespace-nowrap px-3 py-2 text-slate-400">${states}</td>
        </tr>`
    })
    .join('')
}

export function renderSourceBadges(el, sources) {
  const fmtMonth = (d) =>
    d ? d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—'
  el.innerHTML = sources
    .map((s) => {
      const name = s.agency === 'USDA FSIS' ? 'USDA' : s.agency
      const pill =
        s.status === 'live'
          ? badge(`● ${name} live`, 'bg-green-500/15 text-green-300 ring-green-500/30')
          : badge(`● ${name} sample`, 'bg-amber-500/15 text-amber-300 ring-amber-500/30')
      const detail =
        s.status === 'live'
          ? `${s.count.toLocaleString()} records since ${fmtMonth(s.oldest)}`
          : escapeHtml(s.error || 'API unreachable')
      return `<div class="mt-1 first:mt-0">${pill}<span class="ml-2 text-[11px] text-slate-500">${detail}</span></div>`
    })
    .join('')
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c])
}
