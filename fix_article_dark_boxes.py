#!/usr/bin/env python3
"""
Run from your project directory to fix dark-box styling in article files
that have a different CSS pattern from the concept pages.

  python3 fix_article_dark_boxes.py

Targets: anticoag-safety.html, sepsis-six-..., the-grid-fixed-itself.html,
ulez-london-air-quality.html and any other article with a dark-box variant.
"""
import os, re

NEW_CSS = """.dark-box { background: #f0f4f8; border: 3px solid #002d5b; border-radius: 8px; padding: 24px 28px; margin: 28px 0; font-family: system-ui, sans-serif; }
        .dark-box h3 { color: #002d5b; margin: 0 0 12px; font-size: 1em; text-transform: uppercase; letter-spacing: 0.08em; font-style: normal; border-bottom: 2px solid #002d5b; padding-bottom: 8px; }
        .dark-box p { font-size: 0.97em; color: #1e293b; margin-bottom: 10px; line-height: 1.7; }
        .dark-box p:last-child { margin-bottom: 0; }
        .dark-box strong { color: #002d5b; }
        .dark-box a { color: #0056b3; text-decoration: underline; }
        .dark-box a:hover { color: #002d5b; }
        .dark-box .quote { font-size: 1.05em; font-style: italic; color: #0056b3; border-left: 4px solid #002d5b; padding: 12px 16px; border-radius: 0 6px 6px 0; margin: 14px 0; background: white; }"""

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

    # Only target files that still have dark background
    if 'dark-box { background: #1e293b' not in content \
       and '.dark-box{background:#1e293b' not in content \
       and 'background: #1e293b' not in content:
        continue

    original = content

    # Use regex to find and replace the entire .dark-box CSS block
    # regardless of exact spacing or additional properties
    pattern = re.compile(
        r'\.dark-box\s*\{[^}]*background:\s*#1e293b[^}]*\}.*?'
        r'(?=\.deming-box|\.constraint-box|\.article-wrap|\.page-wrap|\.breadcrumb|@media|\Z)',
        re.DOTALL
    )

    # More targeted: find from .dark-box { to the last .dark-box sub-rule
    # Find the block by looking for the start and replacing up to a safe end marker
    
    # Strategy: find ".dark-box {" with dark background and replace the 
    # entire dark-box CSS section using a known following class as anchor
    
    # Common following classes in article files
    anchors = [
        '.deming-box',
        '.constraint-box', 
        '.article-wrap',
        '.numbers-box',
        '.alert-green',
        '.alert-red',
        '.alert-orange',
        '.alert-blue',
        '.callout-box',
        '.finding-box',
    ]
    
    # Find where dark-box CSS starts
    start = -1
    for marker in ['.dark-box { background: #1e293b', '.dark-box{background:#1e293b']:
        idx = content.find(marker)
        if idx > 0:
            start = idx
            break
    
    if start == -1:
        skipped.append(f"  ? {fname} — dark background not in .dark-box start")
        continue

    # Find the end of the dark-box CSS block (next class definition)
    end = -1
    search_from = start + 100
    for anchor in anchors:
        idx = content.find(anchor, search_from)
        if idx > 0:
            if end == -1 or idx < end:
                end = idx

    if end == -1:
        # Try finding </style> as fallback
        end = content.find('</style>', start)
    
    if end == -1:
        skipped.append(f"  ? {fname} — could not find end of dark-box CSS block")
        continue

    old_block = content[start:end]
    content = content[:start] + NEW_CSS + '\n        ' + content[end:]

    if content != original:
        with open(fname, 'w', encoding='utf-8') as f:
            f.write(content)
        updated.append(fname)
    else:
        skipped.append(f"  ? {fname} — no change made")

print(f"Updated {len(updated)} files:")
for f in updated:
    print(f"  ✓ {f}")

if skipped:
    print(f"\nSkipped or needs check:")
    for s in skipped:
        print(s)
