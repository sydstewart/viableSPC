"""
extract_utc_ae_data.py
======================
Extracts monthly national totals from NHS England Monthly A&E CSV files.

KEY FACTS (discovered from inspecting actual files):
- Column 4:  A&E attendances Type 1  (major Emergency Departments)
- Column 5:  A&E attendances Type 2  (single specialty)
- Column 6:  A&E attendances Other A&E Department  == Type 3 / UTC
             (Urgent Treatment Centres — same thing, different label)
- Last row:  Total row, labelled 'Total', 'TOTAL', 'TOTAl', or 'Total '
             (varies by year — script handles all variants)

STEP 1 — Download the monthly CSV files manually
-------------------------------------------------
NHS England blocks automated downloads. Go to each page in a browser
and download the file labelled "Monthly A&E [Month] [Year] (CSV)":

  2025-26: https://www.england.nhs.uk/statistics/statistical-work-areas/
           ae-waiting-times-and-activity/ae-attendances-and-emergency-admissions-2025-26/
  2024-25: https://www.england.nhs.uk/statistics/statistical-work-areas/
           ae-waiting-times-and-activity/ae-attendances-and-emergency-admissions-2024-25/
  2023-24: https://www.england.nhs.uk/statistics/statistical-work-areas/
           ae-waiting-times-and-activity/ae-attendances-and-emergency-admissions-2023-24/

Save ALL files (including any with "revised" in the name) into one folder.
If both original and revised exist for the same month, keep both —
this script automatically picks the revised version.

STEP 2 — Edit the two paths below and run in PyCharm
"""

import os, csv, re
from datetime import datetime
from collections import defaultdict

# ── EDIT THESE TWO LINES ──────────────────────────────────────────────────
INPUT_FOLDER = r"C:\Users\sydne\OneDrive\UTC-DATA"
OUTPUT_FILE  = r"C:\Users\sydne\OneDrive\UTC-DATA\ae_utc_type1_timeseries.csv"
# ─────────────────────────────────────────────────────────────────────────

MONTHS = {
    'january':1,'february':2,'march':3,'april':4,'may':5,'june':6,
    'july':7,'august':8,'september':9,'october':10,'november':11,'december':12
}
SKIP_WORDS = ['quarter','time-series','timeseries','annual','non-elective','ecds','supplementary']

# Column positions (0-based) — confirmed from inspecting actual files
COL_TYPE1 = 4   # A&E attendances Type 1
COL_TYPE2 = 5   # A&E attendances Type 2
COL_TYPE3 = 6   # A&E attendances Other A&E Department == UTC / Type 3

# Total row: first column value matches one of these (case-insensitive, stripped)
TOTAL_LABELS = {'total', 'totals'}


def parse_date(filename):
    """Parse year-month from any NHS England A&E CSV filename variant."""
    name = re.sub(r'[\s_]+', '-', filename.lower())
    name = re.sub(r'\.csv$', '', name)
    if any(w in name for w in SKIP_WORDS):
        return None
    found_month = None
    for month_name, month_num in MONTHS.items():
        if month_name in name:
            found_month = month_num
            break
    if not found_month:
        return None
    years = re.findall(r'20\d{2}', name)
    if not years:
        return None
    return datetime(int(years[0]), found_month, 1)


def pick_best(files):
    """Prefer the revised file when both original and revised exist."""
    if len(files) == 1:
        return files[0]
    revised = [f for f in files if 'revised' in f.lower()]
    return revised[-1] if revised else files[-1]


def safe_int(val):
    try:
        return int(str(val).replace(',', '').strip())
    except:
        return None


def extract_totals(filepath):
    """Extract England national totals from one monthly CSV file."""
    try:
        with open(filepath, 'r', encoding='utf-8-sig') as f:
            rows = list(csv.reader(f))
    except UnicodeDecodeError:
        with open(filepath, 'r', encoding='latin-1') as f:
            rows = list(csv.reader(f))

    if len(rows) < 2:
        return None

    # Verify header row matches expected structure
    header = rows[0]
    if len(header) <= COL_TYPE3:
        print(f"  ! File has fewer columns than expected ({len(header)} cols)")
        return None

    # Optional: confirm column names match what we expect
    expected_t1 = 'a&e attendances type 1'
    if header[COL_TYPE1].lower().strip() != expected_t1:
        print(f"  ! Col {COL_TYPE1} = '{header[COL_TYPE1]}' (expected '{expected_t1}')")
        print(f"    Full header: {header[:8]}")
        # Don't abort — try anyway

    # Find the total row: last non-blank row whose first column is 'total' variant
    total_row = None
    for row in reversed(rows):
        if not any(c.strip() for c in row):
            continue  # skip blank rows
        label = row[0].strip().lower()
        if label in TOTAL_LABELS:
            total_row = row
            break

    # Fallback: if no labelled total row found, try last non-blank row
    if total_row is None:
        print(f"  ! No 'Total' row found — trying last non-blank row as fallback")
        for row in reversed(rows):
            if any(c.strip() for c in row):
                total_row = row
                break

    if total_row is None:
        return None

    t1 = safe_int(total_row[COL_TYPE1]) if len(total_row) > COL_TYPE1 else None
    t2 = safe_int(total_row[COL_TYPE2]) if len(total_row) > COL_TYPE2 else None
    t3 = safe_int(total_row[COL_TYPE3]) if len(total_row) > COL_TYPE3 else None
    total = t1 + (t2 or 0) + (t3 or 0) if t1 is not None else None

    return {'type1': t1, 'type2': t2, 'type3_utc': t3, 'total': total}


def main():
    if not os.path.exists(INPUT_FOLDER):
        print(f"ERROR: Folder not found:\n  {INPUT_FOLDER}")
        print("Edit INPUT_FOLDER at the top of this script.")
        return

    # Group files by month, handling duplicates
    all_csvs = [f for f in os.listdir(INPUT_FOLDER) if f.lower().endswith('.csv')]
    grouped = defaultdict(list)
    skipped = []

    for f in sorted(all_csvs):
        date = parse_date(f)
        if date:
            grouped[date].append(f)
        else:
            skipped.append(f)

    if skipped:
        print(f"Skipped {len(skipped)} non-monthly files: {skipped}\n")

    print(f"Processing {len(grouped)} months...\n")

    results = []
    errors = []

    for date in sorted(grouped.keys()):
        filename = pick_best(grouped[date])
        filepath = os.path.join(INPUT_FOLDER, filename)
        note = " [revised]" if 'revised' in filename.lower() else ""
        print(f"{date.strftime('%b %Y')}  {filename}{note}")

        data = extract_totals(filepath)

        if data and data['type1'] is not None:
            results.append({
                'date':                   date.strftime('%Y-%m-%d'),
                'type1_ae_attendances':   data['type1'],
                'type2_ae_attendances':   data['type2'],
                'type3_utc_attendances':  data['type3_utc'],
                'total_all_types':        data['total'],
            })
            print(f"  Type1={data['type1']:>10,}  "
                  f"Type3/UTC={data['type3_utc']:>10,}  "
                  f"Total={data['total']:>10,}")
        else:
            errors.append(filename)
            print(f"  ! FAILED — check output above")
        print()

    if not results:
        print("No data extracted.")
        return

    results.sort(key=lambda x: x['date'])

    with open(OUTPUT_FILE, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=[
            'date','type1_ae_attendances','type2_ae_attendances',
            'type3_utc_attendances','total_all_types'])
        writer.writeheader()
        writer.writerows(results)

    print('=' * 65)
    print(f"Done: {len(results)} months  →  {OUTPUT_FILE}")
    print(f"Range: {results[0]['date']} to {results[-1]['date']}")
    if errors:
        print(f"Failed files ({len(errors)}): {errors}")
    print("""
Next steps:
  Upload the output CSV to stepchangeanalysis.com
  For UTC Bootstrap CUSUM:   Y-axis = type3_utc_attendances
  For Type 1 A&E CUSUM:      Y-axis = type1_ae_attendances
  Settings: 5,000 loops, TL=5, 99.7% confidence
""")


if __name__ == '__main__':
    main()
