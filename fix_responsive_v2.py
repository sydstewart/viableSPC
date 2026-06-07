#!/usr/bin/env python3
"""
Run from your project directory to fix tablet font size and mobile table display.
  python3 fix_responsive_v2.py

Changes:
1. Tablet (601-900px): increase body font to 17px (was 16px), increase h2/h3
2. Mobile tables: force horizontal scroll with -webkit-overflow-scrolling
   and ensure cells don't collapse to zero width
"""
import os, re

# The updated responsive block — specifically fixing tablet fonts and mobile tables
TABLET_FIX = """        /* Tablet (601px – 900px) */
        @media (max-width: 900px) {
            body { font-size: 17px; }
            .article-wrap, .page-wrap { padding: 28px 20px 60px; }
            h1, .article-title { font-size: clamp(1.6em, 5vw, 2.2em); }
            h2 { font-size: 1.25em; }
            h3 { font-size: 1.08em; }
            p { font-size: 1.02em; }
            /* Tables — make them scroll horizontally */
            .data-table-wrap, .numbers-box { overflow-x: auto; display: block; }
            .numbers-box table, .data-table, .examples-table,
            .inputs-table { display: block; overflow-x: auto; white-space: nowrap; min-width: 400px; }
            /* Grids — 2 columns max on tablet */
            .summary-grid, .measure-grid, .question-grid,
            .nav-grid, .rules-grid, .weco-rules { grid-template-columns: 1fr 1fr; }
            .lead-lag-box { grid-template-columns: 1fr 1fr; }
            /* PDSA wrap — stack vertically */
            .pdsa-wrap { flex-direction: column; align-items: center; }
            /* Funnel wrap — stack */
            .funnel-wrap { flex-direction: column; }
        }"""

MOBILE_TABLE_FIX = """            /* Tables — horizontal scroll with proper min-width */
            table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch;
                    font-size: 0.82em; min-width: 320px; }
            .data-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; display: block; }
            .numbers-box { padding: 10px 12px; overflow-x: auto; -webkit-overflow-scrolling: touch; display: block; }
            .numbers-box table { font-size: 0.8em; min-width: 300px; white-space: nowrap; }
            .numbers-box th, .numbers-box td { padding: 7px 10px; min-width: 80px; }
            .examples-table, .inputs-table { font-size: 0.8em; min-width: 320px; }
            /* Allow table cell text to wrap on mobile for readability */
            .examples-table td, .inputs-table td { white-space: normal; min-width: 100px; }"""

updated = []
skipped = []

for fname in sorted(os.listdir('.')):
    if not fname.endswith('.html'):
        continue
    try:
        with open(fname, encoding='utf-8') as f:
            content = f.read()
    except Exception:
        continue

    if '@media' not in content:
        skipped.append(f"  - {fname} — no media queries")
        continue

    original = content

    # Fix tablet: replace old tablet media query font size
    content = re.sub(
        r'(/\* Tablet \(601px.*?900px\) \*/\s*@media \(max-width: 900px\) \{.*?)body \{ font-size: 16px; \}',
        r'\1body { font-size: 17px; }',
        content, flags=re.DOTALL
    )

    # Fix mobile table: replace old table rules
    content = re.sub(
        r'(/\* Tables — horizontal scroll, min readable size \*/\s*)table \{ display: block; overflow-x: auto; -webkit-overflow-scrolling: touch;\s*white-space: nowrap; font-size: 0\.82em; \}',
        r'\1table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch;\n                    font-size: 0.82em; min-width: 320px; }',
        content, flags=re.DOTALL
    )

    # Also fix numbers-box on mobile
    content = content.replace(
        '.numbers-box table { font-size: 0.8em; }',
        '.numbers-box table { font-size: 0.8em; min-width: 300px; white-space: nowrap; }'
    )

    if content != original:
        with open(fname, 'w', encoding='utf-8') as f:
            f.write(content)
        updated.append(fname)

print(f"Updated {len(updated)} files:")
for f in updated:
    print(f"  ✓ {f}")
if skipped:
    print(f"\nNo media queries ({len(skipped)} files)")
