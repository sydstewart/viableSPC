"""
get_dementia_eddr.py
====================
Downloads the Estimated Dementia Diagnosis Rate (EDDR) for England
from the OHID Fingertips platform.

SETUP - run once in PowerShell:
    C:\Python314\python.exe -m pip install fingertips_py pandas

Then run:
    C:\Python314\python.exe get_dementia_eddr.py
"""

import sys

try:
    import fingertips_py as ftp
    import pandas as pd
    print("fingertips_py loaded OK")
except ImportError as e:
    print(f"Missing package: {e}")
    print("Run this in PowerShell first:")
    print("  C:\\Python314\\python.exe -m pip install fingertips_py pandas")
    sys.exit(1)

OUTPUT_FILE = "dementia_eddr_england.csv"
ENGLAND_CODE = "E92000001"

# Candidate indicator IDs for EDDR - will try each in turn
CANDIDATE_IDS = [92949, 93014, 91370, 91372, 90584]

print("Searching for EDDR data...\n")

for ind_id in CANDIDATE_IDS:
    print(f"Trying indicator {ind_id}...")
    try:
        df = ftp.get_data_for_indicator_at_all_available_geographies(ind_id)
        if df is None or len(df) == 0:
            print("  No data returned")
            continue

        england = df[df["Area Code"] == ENGLAND_CODE].copy()
        if len(england) == 0:
            print(f"  Data exists but no England rows. Areas: {list(df['Area Code'].unique()[:5])}")
            continue

        name = england["Indicator Name"].iloc[0]
        if "dementia" not in name.lower() and "diagnosis" not in name.lower():
            print(f"  Wrong indicator: {name}")
            continue

        print(f"  Found: {name}")
        years = sorted(england["Time period"].unique())
        print(f"  Years: {years[0]} to {years[-1]}, N={len(years)}")

        out = england[["Time period", "Value",
                       "Lower CI 95.0 limit", "Upper CI 95.0 limit"]].copy()
        out.columns = ["year", "eddr_pct", "lci_95", "uci_95"]
        out = out.sort_values("year").reset_index(drop=True)
        out["date"] = out["year"].astype(str) + "-03-31"
        out = out[["date", "year", "eddr_pct", "lci_95", "uci_95"]]

        out.to_csv(OUTPUT_FILE, index=False)

        print(f"\nSaved to: {OUTPUT_FILE}")
        print(f"\n{out.to_string()}")
        print(f"\nNext step: upload {OUTPUT_FILE} to stepchangeanalysis.com")
        print("Use column: eddr_pct")
        sys.exit(0)

    except Exception as e:
        print(f"  Error: {e}")

# If all IDs failed, search for the right one
print("\nKnown IDs failed. Searching all indicators for 'dementia'...")
try:
    meta = ftp.get_metadata_for_all_indicators()
    if meta is not None:
        hits = meta[meta["Indicator"].str.contains("dementia|diagnosis", case=False, na=False)]
        print(f"Found {len(hits)} matches:")
        print(hits[["ID", "Indicator"]].to_string())
        print("\nUpdate CANDIDATE_IDS in the script with the correct ID and rerun.")
except Exception as e:
    print(f"Metadata search error: {e}")

print("\nManual fallback:")
print("1. Go to https://fingertips.phe.org.uk/profile/dementia")
print("2. Find 'Estimated Dementia Diagnosis Rate' in Diagnosing well domain")
print("3. Click Download > Data > England > All years > CSV")
print("4. Save as dementia_eddr_england.csv")
