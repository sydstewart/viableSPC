#!/usr/bin/env python3
"""
Run from your project directory to fix glossary.html dropdown styling.
  python3 fix_glossary_nav_css.py
"""
import os, sys, re

fname = "glossary.html"
if not os.path.exists(fname):
    print(f"ERROR: {fname} not found.")
    sys.exit(1)

with open(fname, encoding="utf-8") as f:
    content = f.read()

original = content

# The complete correct nav CSS block to inject
COMPLETE_NAV_CSS = """        .header-nav{display:flex;gap:4px;align-items:center;flex-wrap:wrap;}
        .header-nav a{color:rgba(255,255,255,0.85);font-family:system-ui,sans-serif;font-size:0.88em;font-weight:500;text-decoration:none;padding:6px 10px;border-radius:4px;}
        .header-nav a:hover{color:white;background:rgba(255,255,255,0.1);text-decoration:none;}
        .header-nav a.active{color:white;font-weight:700;background:rgba(255,255,255,0.15);}
        .nav-dropdown{position:relative;}
        .nav-dropdown-btn{color:rgba(255,255,255,0.85);font-family:system-ui,sans-serif;font-size:0.88em;font-weight:500;background:none;border:none;cursor:pointer;padding:6px 10px;border-radius:4px;display:flex;align-items:center;gap:4px;}
        .nav-dropdown-btn:hover{color:white;background:rgba(255,255,255,0.1);}
        .nav-dropdown-btn .arrow{font-size:0.7em;transition:transform 0.2s;}
        .nav-dropdown:hover .arrow{transform:rotate(180deg);}
        .nav-dropdown-menu{display:none;position:absolute;top:100%;left:0;background:white;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.12);min-width:220px;z-index:200;padding:12px 0 6px;margin-top:0;}
        .nav-dropdown:hover .nav-dropdown-menu{display:block;}
        .nav-dropdown-menu::before{content:'';position:absolute;top:-8px;left:0;right:0;height:8px;}
        .nav-dropdown-menu a{display:block;color:#1e293b;font-family:system-ui,sans-serif;font-size:0.85em;padding:8px 16px;text-decoration:none;white-space:nowrap;border-radius:0;background:none;}
        .nav-dropdown-menu a:hover{background:#e9f2ff;color:#002d5b;}
        .nav-dropdown-menu .menu-section{font-family:system-ui,sans-serif;font-size:0.72em;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;padding:8px 16px 4px;}
        .nav-dropdown-menu .menu-divider{border:none;border-top:1px solid #e2e8f0;margin:4px 0;}"""

# Strategy: remove any existing partial nav CSS block and replace with complete version
# Find the start of nav CSS (from .header-nav) to .header-tool-btn
# Then replace that whole section

# Pattern: find everything from .header-nav{ to .header-tool-btn{
pattern = r'(\s*\.header-nav\{[^<]*?)(\s*\.header-tool-btn\{)'
match = re.search(pattern, content, re.DOTALL)

if match:
    old_nav_block = match.group(1)
    tool_btn_start = match.group(2)
    content = content.replace(
        old_nav_block + tool_btn_start,
        '\n' + COMPLETE_NAV_CSS + '\n' + tool_btn_start
    )
    print("✓ Nav CSS block replaced with complete version")
else:
    # Try adding before </style>
    if '.header-nav' not in content and '</style>' in content:
        content = content.replace(
            '</style>',
            COMPLETE_NAV_CSS + '\n        </style>',
            1
        )
        print("✓ Complete nav CSS injected before </style>")
    else:
        print("⚠ Could not find insertion point - check manually")

# Verify key elements
checks = [
    ('.nav-dropdown-menu a{', 'Menu item styles'),
    ('nav-dropdown-menu::before', 'Hover fix'),
    ('.header-nav{', 'Header nav'),
    ('top:100%', 'Gap fix'),
]
print()
for pattern, label in checks:
    found = pattern in content
    print(f"  {'✓' if found else '✗'} {label}")

if content != original:
    with open(fname, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"\n✓ {fname} saved")
else:
    print(f"\n⚠ No changes made to {fname}")
