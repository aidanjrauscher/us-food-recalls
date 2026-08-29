# U.S. Food Recall Dashboard

A Vite + vanilla JS + Tailwind v4 dashboard that combines **USDA FSIS** and
**FDA** food recalls into one view: monthly recall volume, risk class, active vs.
closed status, agency, and inferred product type.

Data sources:

- [USDA FSIS Recall API](https://www.fsis.usda.gov/science-data/developer-resources/recall-api)
  — `https://www.fsis.usda.gov/fsis/api/recall/v/1` (meat, poultry, egg products)
- [openFDA Food Enforcement API](https://open.fda.gov/apis/food/enforcement/)
  — `https://api.fda.gov/food/enforcement.json` (everything else FDA regulates)

Both feeds are clipped to **January 2016 onward** (`START_YEAR` in
`src/lib/api.js`) so the two agencies compare like with like.

## Run

```bash
npm install
npm run dev
```

Open the printed URL (default http://localhost:5173).

## How data is fetched

- **USDA FSIS** sends **no CORS headers** and rejects non-browser requests, so
  the front-end never calls it directly:
  - *Dev:* `vite.config.js` proxies `/api/recall` → the FSIS endpoint (adding a
    browser `User-Agent`).
  - *Prod:* point `VITE_RECALL_API` at your own proxy (serverless function,
    nginx, Cloudflare Worker, …).
- **openFDA** sends `Access-Control-Allow-Origin: *`, so the browser calls
  `https://api.fda.gov/food/enforcement.json` directly. It's fetched in pages of
  1 000 (`sort=recall_initiation_date:desc`, `skip` up to the 25 000 no-key cap).
  Override with `VITE_FDA_API`.
- **Fallback:** each source independently falls back to its slice of a
  deterministic bundled sample dataset (`src/data/sampleRecalls.js`) and shows an
  amber "sample" badge, so one API being down never blanks the app.

## What you can slice

| Control | Effect |
|---|---|
| Window (12 / 24 / 36 mo / 5 yr / Since 2016) | Time span for every chart, card, table |
| Stack chart by (Risk / Type / Agency) | How the monthly bar chart is segmented |
| Date basis (Initiated / Reported) | Which FDA date places each recall in time — `recall_initiation_date` (firm started the recall) vs `report_date` (FDA published it in the Enforcement Report). FSIS has one date, used for both. |
| Active recalls only | Ongoing / open recalls only |
| Agency checkboxes | USDA FSIS / FDA |
| Risk class checkboxes | Class I / II / III / Public Health Alert / Unclassified |
| Product type checkboxes | Meat & Poultry, Seafood, Produce, Dairy & Eggs, Nuts/Seeds/Spices, Bakery & Snacks, Beverages, Supplements, Prepared & Packaged, Other |

## Notes / API quirks handled

- **openFDA classification lag:** the enforcement report for a recall is
  published only *after* FDA assigns it a classification, so the most recent
  ~4–8 weeks of FDA data are incomplete on the **Initiated** date basis. The
  fda.gov recalls *page* lists newer press-release recalls that aren't in the
  API yet. The **Reported** basis (`report_date`) is more current at the tail —
  it reflects FDA's publication cadence — but back-dates the food-safety event
  (a recall initiated in June, published in August, lands on August). The chart
  note shows how far the FDA data reaches for the current basis.
- **FSIS bilingual duplicates:** every recall with a Spanish translation appears
  twice (`langcode` `"English"` / `"Spanish"`) under one recall number.
  `normalizeFsisAll()` keeps English and dedupes.
- **Risk class:**
  - FSIS: `field_recall_classification` (`"Class I"`..`"Class III"`, `"Public
    Health Alert"`). `field_risk_level` has swapped word/number prefixes in the
    live data (`"Low - Class II"`), so it's only a fallback.
  - FDA: `classification` (`"Class I"`..`"Class III"`, `"Not Yet Classified"`).
- **Active / open:**
  - FSIS: `field_recall_type` (`"Active Recall"` / `"Closed Recall"` / `"Public
    Health Alert"`) — `field_active_notice` only flags one front-page notice.
  - FDA: `status` (`"Ongoing"` / `"Pending"` → active; `"Completed"` /
    `"Terminated"` → closed).
- **Product type** has no field in either API — it's a keyword heuristic
  (`src/lib/categorize.js`) over the product / reason text. Treat as approximate.
- **Dates:** FSIS ISO (`2026-08-26`) or `"Jul 22, 2024"`; FDA `YYYYMMDD`
  (`20260722`). All handled by `parseRecallDate()`.

## Structure

```
src/
  main.js                state + wiring
  lib/api.js             parallel dual-source fetch, START_YEAR clip, sample fallback
  lib/transform.js       date parsing, FSIS + FDA normalizers, monthly aggregation
  lib/categorize.js      agency / risk / product-type buckets + colors + heuristic
  charts.js              Chart.js config (1 stacked bar + 2 doughnuts)
  ui.js                  DOM shell, filter controls, stat cards, table
  data/sampleRecalls.js  offline stand-in for both feeds
```
