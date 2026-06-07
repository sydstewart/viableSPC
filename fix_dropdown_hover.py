#!/usr/bin/env python3
"""
Run from your project directory to fix the dropdown hover gap on all HTML files.
  python3 fix_dropdown_hover.py
"""
import os

OLD = """        .nav-dropdown-menu { display: none; position: absolute; top: calc(100% + 6px); left: 0; background: white; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.12); min-width: 220px; z-index: 200; padding: 6px 0; }
        .nav-dropdown:hover .nav-dropdown-menu { display: block; }"""

NEW = """        .nav-dropdown-menu { display: none; position: absolute; top: 100%; left: 0; background: white; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.12); min-width: 220px; z-index: 200; padding: 12px 0 6px; margin-top: 0; }
        .nav-dropdown:hover .nav-dropdown-menu { display: block; }
        .nav-dropdown-menu::before { content: ''; position: absolute; top: -8px; left: 0; right: 0; height: 8px; }"""

updated = []
for fname in os.listdir('.'):
    if not fname.endswith('.html'):
        continue
    try:
        with open(fname, encoding='utf-8') as f:
            content = f.read()
        if OLD in content:
            content = content.replace(OLD, NEW)
            with open(fname, 'w', encoding='utf-8') as f:
                f.write(content)
            updated.append(fname)
    except Exception as e:
        print(f"  Skipped {fname}: {e}")

if updated:
    print(f"Fixed dropdown hover in {len(updated)} files:")
    for f in sorted(updated):
        print(f"  ✓ {f}")
else:
    print("No files matched — may already be fixed or use a different pattern")
