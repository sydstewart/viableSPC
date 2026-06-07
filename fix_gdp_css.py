#!/usr/bin/env python3
"""
Run from your project directory:
  python3 fix_gdp_css.py
"""
import os, sys

fname = "uk-gdp-analysis.html"
if not os.path.exists(fname):
    print(f"ERROR: {fname} not found.")
    sys.exit(1)

with open(fname, encoding="utf-8") as f:
    content = f.read()

OLD = """        .site-header { background: var(--brand-blue); padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
        .site-header a { color: white; text-decoration: none; font-family: system-ui, sans-serif; font-size: 1em; font-weight: bold; }
        .site-header a:hover { text-decoration: underline; }
        .header-tool-btn { background: #198754; color: white; padding: 8px 18px; border-radius: 4px; font-family: system-ui, sans-serif; font-size: 0.9em; font-weight: bold; text-decoration: none; }
        .header-tool-btn:hover { background: #146c43; text-decoration: none; }"""

NEW = """        .site-header { background: var(--brand-blue); padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
        .site-header a { color: white; text-decoration: none; font-family: system-ui, sans-serif; font-size: 1em; font-weight: bold; }
        .site-header a:hover { text-decoration: underline; }
        .header-nav { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
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
        .nav-dropdown-menu::before { content: \'\'; position: absolute; top: -8px; left: 0; right: 0; height: 8px; }
        .nav-dropdown-menu a { display: block; color: #1e293b; font-family: system-ui, sans-serif; font-size: 0.85em; padding: 8px 16px; text-decoration: none; white-space: nowrap; border-radius: 0; background: none; }
        .nav-dropdown-menu a:hover { background: #e9f2ff; color: #002d5b; }
        .nav-dropdown-menu .menu-section { font-family: system-ui, sans-serif; font-size: 0.72em; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #94a3b8; padding: 8px 16px 4px; }
        .nav-dropdown-menu .menu-divider { border: none; border-top: 1px solid #e2e8f0; margin: 4px 0; }
        .header-tool-btn { background: #198754; color: white; padding: 8px 18px; border-radius: 4px; font-family: system-ui, sans-serif; font-size: 0.9em; font-weight: bold; text-decoration: none; }
        .header-tool-btn:hover { background: #146c43; text-decoration: none; }
        @media (max-width: 600px) { .header-nav { display: none; } }"""

if OLD in content:
    content = content.replace(OLD, NEW)
    with open(fname, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"✓ {fname} fixed")
    print(f"  nav-dropdown-menu a: {'.nav-dropdown-menu a {' in content or 'nav-dropdown-menu a {' in content}")
    print(f"  hover fix: {'::before' in content}")
else:
    print(f"⚠ Pattern not found in {fname}")
    print("  The CSS block may have already been partially updated.")
    print("  Check the file manually or paste it here for inspection.")
