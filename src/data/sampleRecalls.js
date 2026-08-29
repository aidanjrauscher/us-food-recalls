// Deterministic, offline stand-in for both recall feeds. Records use the same
// raw shapes the real APIs return (`field_*` for FSIS, openFDA fields for FDA),
// so they flow through the normal adapters. Used only when an API is
// unreachable.

function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SEASON = [0.7, 0.7, 0.9, 1.0, 1.15, 1.35, 1.4, 1.35, 1.1, 1.0, 1.15, 0.95]

const REASONS = [
  'May be contaminated with Listeria monocytogenes',
  'May be contaminated with Salmonella',
  'May be contaminated with E. coli O157:H7',
  'Contains undeclared milk, a known allergen',
  'Contains undeclared soy and wheat',
  'Contains undeclared peanuts and tree nuts',
  'Undeclared FD&C Yellow #5',
  'Possible foreign material contamination (metal / hard plastic)',
  'Produced or imported without required inspection / documentation',
  'Mislabeling — label does not reflect actual contents',
]

const STATE_POOLS = [
  ['CA', 'NV', 'AZ', 'OR'],
  ['NY', 'NJ', 'PA', 'CT', 'MA'],
  ['TX', 'OK', 'LA', 'AR'],
  ['IL', 'IN', 'OH', 'MI', 'WI'],
  ['FL', 'GA', 'AL', 'SC'],
  ['Nationwide'],
  ['WA', 'ID', 'MT'],
]

function weightedPick(rng, table) {
  const roll = rng()
  let acc = 0
  for (const row of table) {
    acc += row[row.length - 1]
    if (roll <= acc) return row
  }
  return table[table.length - 1]
}

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)]

// ---- USDA FSIS -------------------------------------------------------------

const FSIS_RISK = [
  ['High - Class I', 'Class I', 0.7],
  ['Low - Class II', 'Class II', 0.16],
  ['Marginal - Class III', 'Class III', 0.04],
  ['Public Health Alert', 'Public Health Alert', 0.1],
]

const FSIS_PRODUCTS = [
  'Ground beef chubs', 'Fully cooked chicken strips', 'Raw pork sausage links',
  'Sliced deli turkey breast', 'Beef jerky sticks', 'Frozen breaded chicken nuggets',
  'Smoked ham steaks', 'Pork bratwurst', 'Chicken salad kits', 'Beef ravioli entrees',
  'Frozen pepperoni pizza', 'Chicken bacon ranch wraps', 'Beef taquito snack packs',
  'Liquid whole egg product', 'Rotisserie chicken',
]

const FSIS_PROCESSING = [
  'Fully Cooked - Not Shelf Stable', 'Heat Treated - Shelf Stable',
  'Raw - Intact', 'Raw - Non-Intact', 'Not Applicable',
]

const FSIS_FIRMS = [
  'Prairie Foods Inc.', 'Coastal Provisions LLC', 'Great Lakes Meat Co.',
  'Sunrise Poultry Processors', 'Heartland Packing Company', 'Blue Ridge Foods',
  'Metro Provision Company', 'Northgate Frozen Foods', 'Cornerstone Deli Brands',
]

// ---- FDA -----------------------------------------------------------------

const FDA_CLASS = [
  ['Class I', 0.34],
  ['Class II', 0.56],
  ['Class III', 0.08],
  ['Not Yet Classified', 0.02],
]

const FDA_PRODUCTS = [
  'Bagged romaine lettuce', 'Diced yellow onions', 'Whole cantaloupe',
  'Spring mix salad greens', 'Sliced Gala apples', 'Fresh cilantro bunches',
  'Frozen cooked shrimp', 'Smoked salmon fillets', 'Refrigerated crab cakes',
  'Shredded cheddar cheese', 'Brie soft cheese wheels', 'Vanilla ice cream tubs',
  'Creamy peanut butter jars', 'Roasted almond snack packs', 'Tahini sesame paste',
  'Ground cinnamon', 'Whole wheat sandwich bread', 'Chocolate chip cookies',
  'Granola cereal clusters', 'Tortilla chips', 'Bottled apple juice',
  'Oat milk cartons', 'Hummus dip tubs', 'Frozen chicken alfredo bowls',
  'Dark chocolate almond bars', 'Elderberry immune gummy supplement',
  'Moringa leaf powder capsules dietary supplement', 'Bottled apple cider',
]

const FDA_FIRMS = [
  'Green Valley Produce Co.', 'Harborline Seafoods Inc.', 'Meadowbrook Dairy LLC',
  'Golden Grain Bakers', 'Sunbelt Nut & Spice Company', 'Clearwater Beverage Group',
  'Fresh Harvest Foods', 'Nutmeg Lane Confections', 'Pacific Cold Storage Inc.',
  'Orchard & Vine Distributing', 'Wholesome Pantry Brands', 'Riverside Snack Foods',
]

const FDA_VOLUNTARY = [
  'Voluntary: Firm initiated', 'Voluntary: Firm initiated', 'FDA Mandated',
]

/**
 * @param {{start?: string, end?: Date}} [opts] start "YYYY-MM"
 * @returns {{fsis: object[], fda: object[]}} raw API-shaped records
 */
export function generateSampleRecalls(opts = {}) {
  const rng = mulberry32(20260829)
  const start = opts.start ? opts.start.split('-').map(Number) : [2016, 1]
  const end = opts.end ? new Date(opts.end) : new Date()

  const fsis = []
  const fda = []
  let n = 0
  const cursor = new Date(start[0], start[1] - 1, 1)

  while (cursor <= end) {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    const ageMonths = (end.getFullYear() - year) * 12 + (end.getMonth() - month)
    const iso = (d) => `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

    // FSIS: ~5/month. FDA: ~11/month (FDA handles the larger share).
    const fsisCount = Math.max(1, Math.round(5 * SEASON[month] + (rng() - 0.5) * 4))
    const fdaCount = Math.max(2, Math.round(11 * SEASON[month] + (rng() - 0.5) * 6))

    for (let i = 0; i < fsisCount; i++) {
      n += 1
      const product = pick(rng, FSIS_PRODUCTS)
      const [riskLevel, classification] = weightedPick(rng, FSIS_RISK)
      const firm = FSIS_FIRMS[n % FSIS_FIRMS.length]
      const isPHA = classification === 'Public Health Alert'
      const active = !isPHA && rng() < (classification === 'Class I' ? 0.5 : 0.28) * Math.max(0, 1 - ageMonths / 8)
      const qtyLb = (Math.floor(rng() * 900) + 20) * 12

      fsis.push({
        field_recall_number: `${String(n).padStart(3, '0')}-${year}`,
        field_title: `${firm} Recalls ${qtyLb.toLocaleString()} lbs. of ${product}`,
        field_recall_date: iso(1 + Math.floor(rng() * 27)),
        field_year: String(year),
        field_risk_level: riskLevel,
        field_recall_classification: classification,
        field_recall_type: isPHA ? 'Public Health Alert' : active ? 'Active Recall' : 'Closed Recall',
        field_active_notice: active ? 'True' : 'False',
        field_archive_recall: active ? 'False' : rng() < 0.6 ? 'True' : 'False',
        field_closed_year: active || isPHA ? '' : String(year),
        field_recall_url: 'https://www.fsis.usda.gov/recalls-alerts',
        field_recall_reason: pick(rng, REASONS),
        field_processing: pick(rng, FSIS_PROCESSING),
        field_product_items: `Various package sizes of "${product.toUpperCase()}"; lot codes vary.`,
        field_establishment: firm,
        field_company: firm,
        field_states: pick(rng, STATE_POOLS).join(', '),
        field_summary: `<p>${pick(rng, REASONS)}. Discovered after ${rng() < 0.5 ? 'routine testing' : 'consumer complaints'}.</p>`,
        langcode: 'English',
        _sample: true,
      })
    }

    for (let i = 0; i < fdaCount; i++) {
      n += 1
      const product = pick(rng, FDA_PRODUCTS)
      const [classification] = weightedPick(rng, FDA_CLASS)
      const firm = FDA_FIRMS[n % FDA_FIRMS.length]
      const ongoing = rng() < (classification === 'Class I' ? 0.45 : 0.3) * Math.max(0.05, 1 - ageMonths / 10)
      const status = ongoing ? 'Ongoing' : rng() < 0.5 ? 'Completed' : 'Terminated'
      const prefix = pick(rng, ['F', 'F', 'F', 'D'])

      fda.push({
        recall_number: `${prefix}-${1000 + n}-${year}`,
        event_id: String(80000 + n),
        status,
        classification,
        product_type: 'Food',
        recalling_firm: firm.toUpperCase(),
        product_description: `${product} — retail and foodservice packaging. ${pick(rng, REASONS)}.`,
        reason_for_recall: pick(rng, REASONS),
        recall_initiation_date: iso(1 + Math.floor(rng() * 27)).replace(/-/g, ''),
        report_date: iso(1 + Math.floor(rng() * 27)).replace(/-/g, ''),
        termination_date: status === 'Terminated' ? `${year + 1}0115` : '',
        voluntary_mandated: pick(rng, FDA_VOLUNTARY),
        distribution_pattern: pick(rng, STATE_POOLS).join(', '),
        state: pick(rng, ['CA', 'TX', 'NY', 'FL', 'IL', 'PA']),
        country: 'United States',
        _sample: true,
      })
    }

    cursor.setMonth(cursor.getMonth() + 1)
  }

  return { fsis, fda }
}
