#!/usr/bin/env python3
"""
Run from your project directory to audit and fix internal links.

  python3 audit_and_fix_links.py

1. Reports which Tier 4 articles are missing upward links to
   start-here.html and why-nothing-changes.html
2. Adds a callout box with those links to any article that is missing them
"""
import os

TIER4_ARTICLES = [
    'dementia-diagnosis-rate.html',
    'why-nothing-has-worked-nhs-ae-performance.html',
    'gp-appointments-analysis.html',
    'never-events-wrong-route.html',
    'anticoag-safety.html',
    'sepsis-six-does-public-data-show-whether-it-worked.html',
    'ulez-london-air-quality.html',
    'the-grid-fixed-itself.html',
    'uk-gdp-analysis.html',
    'hydrogen-plant-cusum.html',
]

CALLOUT = '''    <div style="background:#e9f2ff;border-left:5px solid #0056b3;border-radius:8px;padding:18px 22px;margin:32px 0;font-family:system-ui,sans-serif;">
        <strong style="display:block;margin-bottom:6px;color:#002d5b;">&#128200; Part of the StepChange improvement concepts library</strong>
        <p style="font-size:0.95em;line-height:1.65;margin:0;">This analysis sits within a broader framework for understanding why improvement programmes succeed or fail. Start with <a href="why-nothing-changes.html" style="color:#0056b3;">Why Nothing Changes</a> for the full picture, or go to <a href="start-here.html" style="color:#0056b3;">Start Here</a> for a guided introduction to the method.</p>
    </div>
'''

updated = []
already_ok = []
not_found = []

for fname in TIER4_ARTICLES:
    if not os.path.exists(fname):
        not_found.append(fname)
        continue

    with open(fname, encoding='utf-8') as f:
        content = f.read()

    body = content.split('</header>')[-1] if '</header>' in content else content
    has_start = 'start-here.html' in body
    has_wnc = 'why-nothing-changes.html' in body

    if has_start and has_wnc:
        already_ok.append(f"  ✓ {fname}")
        continue

    # Add callout before the footer
    if '<footer' in content:
        content = content.replace('<footer', CALLOUT + '    <footer', 1)
        with open(fname, 'w', encoding='utf-8') as f:
            f.write(content)
        updated.append(f"  ✓ {fname} — added upward links")
    else:
        not_found.append(f"  ? {fname} — no footer tag found")

print(f"Updated {len(updated)} files:")
for u in updated: print(u)

if already_ok:
    print(f"\nAlready correct ({len(already_ok)}):")
    for a in already_ok: print(a)

if not_found:
    print(f"\nNot found or needs manual check:")
    for n in not_found: print(f"  - {n}")
