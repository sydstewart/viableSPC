# 📊 StepChangeAnalysis.com — Bootstrap CUSUM SPC Analyser

**Free, browser-native step-change analysis for healthcare quality teams.**

🔗 **Live tool:** [stepchangeanalysis.com](https://stepchangeanalysis.com)  
📖 **About:** [stepchangeanalysis.carrd.co](https://stepchangeanalysis.carrd.co)

---

## What It Does

StepChangeAnalysis.com detects genuine step-changes in time series data using Bootstrap CUSUM analysis — a distribution-free method that works correctly on the skewed, spiky data typical of healthcare quality metrics.

Upload a CSV file, select your date and value columns, and get a statistically defensible change-point analysis in under 60 seconds. No installation. No login. No data leaving your computer.

---

## Why Bootstrap CUSUM?

Standard control charts (Shewhart X-mR, p-charts) assume normally distributed data. Most healthcare metrics — incident counts, prescribing volumes, referral rates, error rates — are not normally distributed. They're right-skewed, episodic, and lumpy.

Bootstrap CUSUM solves this by:
- Making **no assumptions** about your data's distribution
- **Earning** its confidence levels from your actual data by resampling (not assuming them from a formula)
- Detecting **multiple sequential step-changes** in a single analysis
- Producing results that hold up under scrutiny in board papers and CQC submissions

---

## Chart Types

| Tab | Chart | Purpose |
|-----|-------|---------|
| **Step Change Analysis** | Bootstrap CUSUM | Main governance chart — detects step-changes with confidence levels |
| **Stage Summary** | Statistical table | Start/end dates, mean, SD, confidence %, and % change per stage |
| **X-mR Chart** | Shewhart Individuals | UNPL, LNPL, and URL control limits |
| **Run Chart** | Median with run signals | Highlights runs of 6+ consecutive points above or below median |
| **CUSUM Chart** | Raw cumulative sum | Cumulative sum of deviations from overall mean |
| **Raw Data** | Original CSV data | Scrollable table of your uploaded data |

---

## Features

- ✅ **No installation** — runs entirely in your browser
- ✅ **No login required** — no account needed
- ✅ **Privacy first** — your CSV never leaves your computer; all analysis runs locally
- ✅ **Export PNG** — chart image with stats and settings metadata
- ✅ **Export PDF** — formatted report for board papers and governance submissions
- ✅ **CSV Data Validator** — checks for date errors, missing values, and column issues before analysis
- ✅ **Settings memory** — remembers your last settings per filename
- ✅ **Sample datasets** — UK and US sample CSVs included to try immediately
- ✅ **Date format support** — DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, YYYY-MM, MM/YYYY, YYYY

---

## Free Edition

The current release is **Free Edition**, suitable for:
- Up to 500 rows (warning shown above this threshold)
- Up to 1,000 bootstrap iterations (warning shown above this threshold)
- All chart types
- Full PDF and PNG export with attribution

Pro and Consultant tiers are planned for a future release.

---

## Technology

| Component | Technology |
|-----------|-----------|
| Charts | [Plotly.js](https://plotly.com/javascript/) 2.27.0 |
| CSV parsing | [PapaParse](https://www.papaparse.com/) 5.4.1 |
| Analysis engine | Pure JavaScript Web Worker |
| Hosting | GitHub Pages |
| Analytics | Google Analytics 4 |

No server-side code. No frameworks. No build step. Pure HTML, CSS, and JavaScript.

---

## Method

Bootstrap CUSUM step-change analysis is based on:

- **Taylor (2000)** — Bootstrap CUSUM for change-point detection
- **Page (1954)** — Original CUSUM method
- **Hinkley (1971)** — Change-point theory
- **Efron & Tibshirani (1993)** — Bootstrap resampling

The method is distribution-free, making it particularly suited to healthcare safety data, incident counts, and other right-skewed metrics where classical control chart assumptions are violated.

---

## Files

```
index.html      — Main tool UI
app.js          — UI logic, chart drawing, export, settings memory
worker.js       — Bootstrap CUSUM analysis engine (Web Worker)
scanner.html    — CSV Data Validator
sample-data-uk.csv  — Sample dataset (UK date format)
sample-data-us.csv  — Sample dataset (US date format)
```

---

## Licence

© Syd Stewart. All rights reserved.  
Free to use for personal, clinical, and governance purposes.  
Not for redistribution or commercial repackaging without permission.

---

*Built by [Syd Stewart](https://www.linkedin.com/in/syd-stewart-44a7371) — chartered chemical engineer with 50 years of experience applying CUSUM analysis in industrial and healthcare settings.*
