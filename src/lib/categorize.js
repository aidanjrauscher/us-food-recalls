// Helpers that turn raw agency field strings into the small, stable set of
// buckets this dashboard visualizes: agency, risk class and product type.

export const AGENCIES = ['USDA FSIS', 'FDA']

export const AGENCY_COLORS = {
  'USDA FSIS': '#2563eb', // blue-600
  FDA: '#0d9488', // teal-600
}

export const RISK_LEVELS = [
  'Class I (High)',
  'Class II (Marginal)',
  'Class III (Low)',
  'Public Health Alert',
  'Unclassified',
]

export const RISK_COLORS = {
  'Class I (High)': '#ef4444', // red-500
  'Class II (Marginal)': '#f59e0b', // amber-500
  'Class III (Low)': '#3b82f6', // blue-500
  'Public Health Alert': '#a855f7', // purple-500
  Unclassified: '#64748b', // slate-500
}

export const PRODUCT_TYPES = [
  'Meat & Poultry',
  'Seafood',
  'Produce',
  'Dairy & Eggs',
  'Nuts, Seeds & Spices',
  'Bakery & Snacks',
  'Beverages',
  'Supplements',
  'Prepared & Packaged',
  'Other',
]

export const PRODUCT_COLORS = {
  'Meat & Poultry': '#f43f5e', // rose-500
  Seafood: '#0ea5e9', // sky-500
  Produce: '#22c55e', // green-500
  'Dairy & Eggs': '#facc15', // yellow-400
  'Nuts, Seeds & Spices': '#b45309', // amber-700
  'Bakery & Snacks': '#f97316', // orange-500
  Beverages: '#14b8a6', // teal-500
  Supplements: '#d946ef', // fuchsia-500
  'Prepared & Packaged': '#a78bfa', // violet-400
  Other: '#64748b', // slate-500
}

/**
 * Normalize a risk/classification string ("High - Class I", "Class II",
 * "Public Health Alert", "Not Yet Classified", ...) into one of RISK_LEVELS.
 */
export function normalizeRisk(raw) {
  const s = String(raw || '').toLowerCase()
  if (s.includes('class i') && !s.includes('class ii') && !s.includes('class iii')) {
    return 'Class I (High)'
  }
  if (s.includes('class ii') && !s.includes('class iii')) return 'Class II (Marginal)'
  if (s.includes('class iii')) return 'Class III (Low)'
  if (s.includes('public health alert') || s.includes('alert')) return 'Public Health Alert'
  return 'Unclassified'
}

// First match wins — ordered most-distinctive first. Every alternation is
// wrapped in \b(...)\b, so plural/compound forms are spelled out explicitly
// (e.g. "salmon" must NOT accidentally match "Salmonella").
const RULES = [
  ['Supplements', /\b(dietary supplements?|nutritional supplements?|supplement (capsules?|tablets?|powder|gummies)|multivitamins?|vitamin [a-e][0-9]?|probiotics?|moringa|ashwagandha|spirulina|herbal (remedy|remedies|supplements?)|protein powder|collagen (powder|peptides?)|amino acids?|creatine|fish oil|krill oil|melatonin|elderberry (gummies|capsules|syrup)|kratom|maca root|greens powder|liposomal)\b/i],
  ['Seafood', /\b(fish|salmon|tuna|shrimps?|prawns?|crab|crabmeat|lobster|oysters?|clams?|mussels?|scallops?|tilapia|cod|catfish|anchovy|anchovies|seafood|sardines?|calamari|squid|caviar|surimi|siluriformes|pollock|haddock|halibut|trout|herring|mackerel|mahi mahi)\b/i],
  // Nuts before Dairy so "peanut butter" / "almond butter" don't read as butter.
  ['Nuts, Seeds & Spices', /\b(peanuts?|almonds?|cashews?|walnuts?|pecans?|pistachios?|hazelnuts?|macadamias?|pine nuts?|brazil nuts?|mixed nuts|tree nuts?|nut butter|peanut butter|almond butter|cashew butter|tahini|sesame|sunflower seeds?|pumpkin seeds?|chia seeds?|flaxseed|trail mix|spices?|cinnamon|cumin|paprika|nutmeg|curry powder|black pepper|oregano|coriander|cardamom|ginger powder|seasoning blend)\b/i],
  // Dairy & Eggs before Meat so "in-shell chicken eggs" reads as eggs.
  ['Dairy & Eggs', /\b(milk|cheese|cheeses|cheddar|mozzarella|parmesan|ricotta|brie|feta|queso|requeson|yogurt|yoghurt|lassi|kefir|butter(?!nut)|ghee|cream(?! of)\b|creamer|ice cream|gelato|custard|egg|eggs|dairy|whey protein|casein)\b/i],
  ['Meat & Poultry', /\b(beef|pork|chicken|poultry|turkey|lamb|veal|bison|goat meat|mutton|venison|sausages?|bacon|ham|hams|jerky|frankfurters?|hot ?dogs?|salami|pepperoni|bologna|prosciutto|meatballs?|brisket|ground (beef|pork|turkey|chicken)|steaks?|pork ribs?|beef ribs?|carne|deli meat|charcuterie|liverwurst|bratwurst|chorizo|carnitas|barbacoa|rotisserie)\b/i],
  // Beverages before Produce so "apple juice" / "orange juice" read as drinks.
  ['Beverages', /\b(juices?|smoothies?|sodas?|soft drinks?|cola|lemonade|iced tea|kombucha|energy drinks?|sports drinks?|bottled water|sparkling water|coffee|espresso|latte|cold brew|almond milk|oat milk|soy milk|coconut milk|plant-based milk|beverages?|drink mix|cider|nectar)\b/i],
  ['Produce', /\b(salads?|lettuce|romaine|spinach|kale|arugula|spring mix|leafy greens?|onions?|garlic|tomatoes?|cucumbers?|melons?|cantaloupes?|watermelons?|honeydew|papayas?|mangoe?s?|apples?|peaches|nectarines?|pears?|(?:straw|blue|black|rasp|cran|goji|boysen)?berr(?:y|ies)|grapes?|sprouts?|carrots?|celery|broccoli|cauliflower|cabbage|bell peppers?|jalapenos?|squash|zucchini|avocados?|cilantro|parsley|basil|mushrooms?|potatoes?|vegetables?|fruits?|fresh produce|coconuts?|pineapples?|kiwis?|citrus|lemons?|limes?|oranges?)\b/i],
  ['Bakery & Snacks', /\b(bread|breads|buns?|rolls?|bagels?|tortillas?|pita|flour|dough|cookies?|crackers?|biscuits?|muffins?|cakes?|pastr(?:y|ies)|pies?|brownies?|donuts?|doughnuts?|croissants?|granola|cereal|oats|oatmeal|chips?|pretzels?|popcorn|snack bars?|candy|candies|chocolates?|confection(?:ery|s)?|fudge|caramel|gummies|marshmallows?|wafers?|cannoli)\b/i],
  ['Prepared & Packaged', /\b(soups?|stew|chili|entrees?|entrée|pizzas?|wraps?|burritos?|taquitos?|sandwich(?:es)?|bowls?|frozen (meal|dinner|entree)|dumplings?|ravioli|pasta|noodles?|fried rice|sauces?|gravy|dressings?|marinades?|salsa|dips?|hummus|guacamole|spreads?|pate|paté|meal kit|casserole|quiche|pot pie|sushi|spring rolls?|egg rolls?|appetizers?|canned|jarred|wrappers?)\b/i],
]

// Packaging idioms that collide with food keywords — e.g. "clam shell" /
// "clamshell" containers (berries, salads, pastries) vs. actual clams.
const PACKAGING_NOISE = /\bclam[\s-]?shells?\b/gi

/**
 * Neither agency exposes a single product-type field, so infer a coarse
 * category from the free-text product / reason fields. Heuristic — surfaced as
 * such in the UI.
 */
export function inferProductType(record) {
  const hay = [
    record.field_title,
    record.field_product_items,
    record.field_processing,
    record.field_summary,
    record.product_description,
    record.reason_for_recall,
  ]
    .filter(Boolean)
    .join(' \n ')
    .toLowerCase()
    .replace(PACKAGING_NOISE, ' ')

  for (const [label, re] of RULES) {
    if (re.test(hay)) return label
  }
  return 'Other'
}

export function isTruthyFlag(v) {
  return String(v).trim().toLowerCase() === 'true' || v === true || v === 1
}
