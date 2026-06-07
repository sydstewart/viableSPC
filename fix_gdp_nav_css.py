#!/usr/bin/env python3
"""
Run from your project directory to fix uk-gdp-analysis.html dropdown styling.
Also checks and fixes any other article files with the same issue.
  python3 fix_gdp_nav_css.py
"""
import os, re

# Complete nav CSS to inject - this replaces any partial nav CSS block
COMPLETE_NAV_CSS = """        .header-nav { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
        .header-nav a { color: rgba(255,255,255,0.85); font-family: system-ui, sans-serif; font-size: 0.88em; font-weight: 500; text-decoration: none; padding: 6px 10px; border-radius: 4px; }
        .header-nav a:hover { color: white; background: rgba(255,255,255,0.1); text-decoration: none; }
        .header-nav a.active { color: white; font-weight: 700; background: rgba(255,255,255,0.15); }
        .nav-dropdown { position: relative; }
        .nav-dropdown-btn { color: rgba(255,255,255,0.85); font-family: system-ui, sans-serif; font-size: 0.88em; font-weight: 500; background: none; border: none; cursor: pointer; padding: 6px 10px; border-radius: 4px; display: flex; align-items: center; gap: 4px; }
        .nav-dropdown-btn:hover { color: white; background: rgba(255,255,255,0.1); }
        .nav-dropdown-btn .arrow { font-size: 0.7em; transition: transform 0.2s; }
        .nav-dropdown:hover .arrow { transform: rotate(180deg); }
        .nav-dropdown-menu { display: none; position: absolute; top: 100%; left: 0; background: white; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.12); min-width: 220px; z-index: 200; padding: 12px 0 6px; margin-top: 0; }
        .nav-dropdown:hover .nav-dropdown-menu { display: block; }
        .nav-dropdown-menu::before { content: ''; position: absolute; top: -8px; left: 0; right: 0; height: 8px; }
        .nav-dropdown-menu a { display: block; color: #1e293b; font-family: system-ui, sans-serif; font-size: 0.85em; padding: 8px 16px; text-decoration: none; white-space: nowrap; border-radius: 0; background: none; }
        .nav-dropdown-menu a:hover { background: #e9f2ff; color: #002d5b; }
        .nav-dropdown-menu .menu-section { font-family: system-ui, sans-serif; font-size: 0.72em; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #94a3b8; padding: 8px 16px 4px; }
        .nav-dropdown-menu .menu-divider { border: none; border-top: 1px solid #e2e8f0; margin: 4px 0; }"""

# The marker we look for to find the end of the nav CSS block
NAV_END_MARKERS = [
    '.header-tool-btn {',
    '.header-tool-btn{',
    '.article-wrap {',
    '.article-wrap{',
    '.page-wrap {',
    '.page-wrap{',
]

fixed = []
skipped = []

for fname in sorted(os.listdir('.')):
    if not fname.endswith('.html'):
        continue
    try:
        with open(fname, encoding='utf-8') as f:
            content = f.read()
    except Exception:
        continue

    # Only process files that have the dropdown nav
    if 'nav-dropdown' not in content:
        continue

    # Check if menu item CSS is missing
    if 'nav-dropdown-menu a {' in content or 'nav-dropdown-menu a{' in content:
        skipped.append(f"  ✓ {fname} — menu item CSS already present")
        continue

    # Menu item CSS is missing — need to inject complete nav CSS
    # Find .header-nav in the CSS and replace up to the end marker
    header_nav_idx = content.find('.header-nav {')
    if header_nav_idx == -1:
        header_nav_idx = content.find('.header-nav{')
    if header_nav_idx == -1:
        skipped.append(f"  ? {fname} — .header-nav not found")
        continue

    # Find where nav CSS ends
    end_idx = -1
    end_marker = None
    for marker in NAV_END_MARKERS:
        idx = content.find(marker, header_nav_idx)
        if idx > header_nav_idx and (end_idx == -1 or idx < end_idx):
            end_idx = idx
            end_marker = marker

    if end_idx == -1:
        skipped.append(f"  ? {fname} — could not find nav CSS end marker")
        continue

    # Replace the partial nav CSS with complete version
    old_nav_css = content[header_nav_idx:end_idx]
    content = content[:header_nav_idx] + COMPLETE_NAV_CSS + '\n        ' + content[end_idx:]

    with open(fname, 'w', encoding='utf-8') as f:
        f.write(content)
    fixed.append(fname)

print(f"Fixed {len(fixed)} files:")
for f in fixed:
    print(f"  ✓ {f}")
if skipped:
    print(f"\nAlready correct ({len(skipped)}):")
    for s in skipped:
        print(s)
