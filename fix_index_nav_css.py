#!/usr/bin/env python3
"""
Run from your project directory to inject the nav dropdown CSS into index.html.
The nav HTML is correct but the CSS rules for hover behaviour are likely missing.

  python3 fix_index_nav_css.py
"""

NAV_CSS = """
        /* ── Nav dropdown — matches all other pages ── */
        .header-nav { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
        .header-nav a { color: rgba(255,255,255,0.85); font-family: system-ui, sans-serif; font-size: 0.88em; font-weight: 500; text-decoration: none; padding: 6px 10px; border-radius: 4px; }
        .header-nav a:hover { color: white; background: rgba(255,255,255,0.1); text-decoration: none; }
        .nav-dropdown { position: relative; }
        .nav-dropdown-btn { color: rgba(255,255,255,0.85); font-family: system-ui, sans-serif; font-size: 0.88em; font-weight: 500; background: none; border: none; cursor: pointer; padding: 6px 10px; border-radius: 4px; display: flex; align-items: center; gap: 4px; }
        .nav-dropdown-btn:hover { color: white; background: rgba(255,255,255,0.1); }
        .nav-dropdown-btn .arrow { font-size: 0.7em; transition: transform 0.2s; }
        .nav-dropdown:hover .arrow { transform: rotate(180deg); }
        .nav-dropdown-menu { display: none; position: absolute; top: 100%; left: 0; background: white; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.12); min-width: 220px; z-index: 999; padding: 12px 0 6px; margin-top: 0; }
        .nav-dropdown:hover .nav-dropdown-menu { display: block; }
        .nav-dropdown-menu::before { content: ''; position: absolute; top: -8px; left: 0; right: 0; height: 8px; }
        .nav-dropdown-menu a { display: block; color: #1e293b; font-family: system-ui, sans-serif; font-size: 0.85em; padding: 8px 16px; text-decoration: none; white-space: nowrap; }
        .nav-dropdown-menu a:hover { background: #e9f2ff; color: #002d5b; }
        .nav-dropdown-menu .menu-section { font-family: system-ui, sans-serif; font-size: 0.72em; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #94a3b8; padding: 8px 16px 4px; }
        .nav-dropdown-menu .menu-divider { border: none; border-top: 1px solid #e2e8f0; margin: 4px 0; }
        @media (max-width: 600px) { .header-nav { display: none; } }
"""

with open('index.html', encoding='utf-8') as f:
    content = f.read()

print(f"index.html length: {len(content)} chars")

# Check what nav CSS already exists
has_nav_hover = '.nav-dropdown:hover .nav-dropdown-menu' in content
has_nav_display = '.nav-dropdown-menu { display: none' in content
has_header_nav = '.header-nav {' in content

print(f"Has nav hover CSS: {has_nav_hover}")
print(f"Has nav-dropdown-menu display:none: {has_nav_display}")
print(f"Has .header-nav CSS: {has_header_nav}")

if has_nav_hover:
    print("\nNav CSS already present — checking z-index...")
    import re
    z_matches = re.findall(r'z-index:\s*(\d+)', content)
    print(f"z-index values found: {z_matches}")
    
    # Check if there's an overflow:hidden that could clip the dropdown
    overflow_matches = re.findall(r'overflow\s*:\s*hidden', content)
    print(f"overflow:hidden occurrences: {len(overflow_matches)}")
    
    # The issue may be that index.html uses a different mechanism
    # Check what's in the site-header
    idx = content.find('site-header')
    header_css = content[idx-500:idx+200] if idx > 500 else content[:idx+200]
    print(f"\nHeader context: {repr(header_css[-200:])}")
    
else:
    print("\nNav CSS missing — injecting before </style>")
    # Find the last </style> before </head>
    head_end = content.find('</head>')
    style_end = content.rfind('</style>', 0, head_end)
    
    if style_end > 0:
        content = content[:style_end] + NAV_CSS + content[style_end:]
        with open('index.html', 'w', encoding='utf-8') as f:
            f.write(content)
        print("✓ Nav CSS injected into index.html")
        # Verify
        print(f"Nav hover CSS now present: {'.nav-dropdown:hover .nav-dropdown-menu' in content}")
    else:
        print("✗ Could not find </style> tag")
        # Inject just before </head>
        content = content.replace('</head>', NAV_CSS + '\n    </head>')
        with open('index.html', 'w', encoding='utf-8') as f:
            f.write(content)
        print("✓ Nav CSS injected before </head>")
