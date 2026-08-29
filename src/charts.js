import Chart from 'chart.js/auto'
import { monthLabel } from './lib/transform.js'
import {
  RISK_LEVELS,
  RISK_COLORS,
  PRODUCT_TYPES,
  PRODUCT_COLORS,
  AGENCIES,
  AGENCY_COLORS,
} from './lib/categorize.js'

Chart.defaults.color = '#94a3b8' // slate-400
Chart.defaults.font.family =
  "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
Chart.defaults.borderColor = 'rgba(148, 163, 184, 0.12)'

const GRID = { color: 'rgba(148, 163, 184, 0.10)' }

/** Stacked monthly bar chart of recall counts. */
export function createMonthlyChart(ctx) {
  return new Chart(ctx, {
    type: 'bar',
    data: { labels: [], datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { autoSkipPadding: 12 } },
        y: {
          stacked: true,
          beginAtZero: true,
          grid: GRID,
          ticks: { precision: 0 },
          title: { display: true, text: 'Recalls' },
        },
      },
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 12, boxHeight: 12, usePointStyle: true } },
        tooltip: {
          callbacks: {
            footer: (items) =>
              'Total: ' + items.reduce((sum, i) => sum + (i.parsed.y || 0), 0),
          },
        },
      },
    },
  })
}

const STACK_CONFIG = {
  risk: { groups: RISK_LEVELS, colors: RISK_COLORS, bucketKey: 'byRisk' },
  type: { groups: PRODUCT_TYPES, colors: PRODUCT_COLORS, bucketKey: 'byType' },
  agency: { groups: AGENCIES, colors: AGENCY_COLORS, bucketKey: 'byAgency' },
}

export function updateMonthlyChart(chart, series, stackBy) {
  const { groups, colors, bucketKey } = STACK_CONFIG[stackBy] || STACK_CONFIG.risk

  chart.data.labels = series.keys.map(monthLabel)
  chart.data.datasets = groups
    .map((g) => ({
      label: g,
      data: series.keys.map((k) => series.buckets[k]?.[bucketKey]?.[g] || 0),
      backgroundColor: colors[g],
      borderWidth: 0,
      borderRadius: 2,
    }))
    .filter((ds) => ds.data.some((v) => v > 0))
  chart.update()
}

function createDoughnut(ctx, title) {
  return new Chart(ctx, {
    type: 'doughnut',
    data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderWidth: 0 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, boxHeight: 12, usePointStyle: true, padding: 12 } },
        title: { display: Boolean(title), text: title },
        tooltip: {
          callbacks: {
            label: (i) => {
              const total = i.dataset.data.reduce((a, b) => a + b, 0) || 1
              return ` ${i.label}: ${i.parsed} (${Math.round((i.parsed / total) * 100)}%)`
            },
          },
        },
      },
    },
  })
}

export const createRiskChart = (ctx) => createDoughnut(ctx)
export const createTypeChart = (ctx) => createDoughnut(ctx)

export function updateBreakdownChart(chart, tallyObj, order, colorMap) {
  const entries = order
    .map((k) => [k, tallyObj[k] || 0])
    .filter(([, v]) => v > 0)
  chart.data.labels = entries.map(([k]) => k)
  chart.data.datasets[0].data = entries.map(([, v]) => v)
  chart.data.datasets[0].backgroundColor = entries.map(([k]) => colorMap[k])
  chart.update()
}
