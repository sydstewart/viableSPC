#!/usr/bin/env python3
"""
Fixes two problems:
1. index.html — removes duplicate/conflicting nav CSS leaving only correct rules
2. All pages — adds a mobile nav strip below the header (no JavaScript needed)

Run from your project directory:
  python3 fix_nav_final.py
"""
import os, re

# ── The correct nav CSS — single clean block ──────────────────
CORRECT_NAV_CSS = """
        /* ── Site navigation ── */
        .header-nav { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
        .header-nav a { color: rgba(255,255,255,0.85); font-family: system-ui, sans-serif; font-size: 0.88em; font-weight: 500; text-decoration: none; padding: 6px 10px; border-radius: 4px; }
        .header-nav a:hover { color: white; background: rgba(255,255,255,0.1); text-decoration: none; }
        .nav-dropdown { position: relative; }
        .nav-dropdown-btn { color: rgba(255,255,255,0.85); font-family: system-ui, sans-serif; font-size: 0.88em; font-weight: 500; background: none; border: none; cursor: pointer; padding: 6px 10px; border-radius: 4px; display: flex; align-items: center; gap: 4px; }
        .nav-dropdown-btn:hover { color: white; background: rgba(255,255,255,0.1); }
        .nav-dropdown-btn .arrow { font-size: 0.7em; transition: transform 0.2s; }
        .nav-dropdown:hover .arrow { transform: rotate(180deg); }
        .nav-dropdown-menu { display: none; position: absolute; top: 100%; left: 0; background: white; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.12); min-width: 220px; z-index: 9999; padding: 12px 0 6px; margin-top: 0; }
        .nav-dropdown:hover .nav-dropdown-menu { display: block; }
        .nav-dropdown-menu::before { content: ''; position: absolute; top: -8px; left: 0; right: 0; height: 8px; }
        .nav-dropdown-menu a { display: block; color: #1e293b; font-family: system-ui, sans-serif; font-size: 0.85em; padding: 8px 16px; text-decoration: none; white-space: nowrap; }
        .nav-dropdown-menu a:hover { background: #e9f2ff; color: #002d5b; }
        .nav-dropdown-menu .menu-section { font-family: system-ui, sans-serif; font-size: 0.72em; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #94a3b8; padding: 8px 16px 4px; }
        .nav-dropdown-menu .menu-divider { border: none; border-top: 1px solid #e2e8f0; margin: 4px 0; }
        /* Mobile nav strip — shown at 600px and below */
        .mobile-nav { display: none; background: #001f3f; padding: 8px 12px; gap: 6px; flex-wrap: wrap; }
        .mobile-nav a { color: rgba(255,255,255,0.9); font-family: system-ui, sans-serif; font-size: 0.82em; font-weight: 500; text-decoration: none; padding: 6px 10px; border-radius: 4px; background: rgba(255,255,255,0.1); white-space: nowrap; }
        .mobile-nav a:hover { background: rgba(255,255,255,0.2); }
        @media (max-width: 600px) {
            .header-nav { display: none; }
            .mobile-nav { display: flex; }
        }
        @media print {
            .header-nav, .mobile-nav, .header-tool-btn { display: none !important; }
        }"""

# ── Mobile nav HTML — inserted after <header> closing tag ──────
MOBILE_NAV_HTML = """
<nav class="mobile-nav" aria-label="Mobile navigation">
    <a href="index.html">&#9654; Tool</a>
    <a href="start-here.html">Start here</a>
    <a href="improvement-method.html">7 Steps</a>
    <a href="why-nothing-changes.html">Concepts</a>
    <a href="about.html">About</a>
</nav>"""

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

    if 'site-header' not in content:
        continue

    changed = False

    # ── Fix 1: index.html — strip all nav CSS and re-inject clean version ──
    if fname == 'index.html':
        # Remove the previously injected nav CSS block (between the markers)
        # Find and remove duplicate nav CSS blocks
        # Strategy: find all occurrences of .header-nav { display: and keep only the correct one
        
        # Remove the injected block we added previously
        injected_pattern = re.compile(
            r'\s*/\* ── Nav dropdown — matches all other pages ── \*/.*?'
            r'@media \(max-width: 600px\) \{ \.header-nav \{ display: none; \} \}\s*',
            re.DOTALL
        )
        new_content = injected_pattern.sub('', content)
        
        # Also remove any standalone duplicate display:none for header-nav 
        # that's NOT inside @media print or @media (max-width:600px)
        # Find the last </style> before </head> and insert correct CSS before it
        head_end = new_content.find('</head>')
        last_style_end = new_content.rfind('</style>', 0, head_end)
        
        if last_style_end > 0:
            new_content = new_content[:last_style_end] + CORRECT_NAV_CSS + '\n    ' + new_content[last_style_end:]
            content = new_content
            changed = True
            print(f"  index.html — nav CSS replaced")

    # ── Fix 2: All pages — add mobile nav strip after </header> ──
    if 'class="mobile-nav"' not in content:
        content = content.replace('</header>', '</header>' + MOBILE_NAV_HTML, 1)
        changed = True

    if changed:
        with open(fname, 'w', encoding='utf-8') as f:
            f.write(content)
        updated.append(fname)

print(f"\nUpdated {len(updated)} files:")
for f in updated:
    print(f"  ✓ {f}")
