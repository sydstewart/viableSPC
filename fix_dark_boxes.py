#!/usr/bin/env python3
"""
Run from your project directory to replace dark-box styling
with a light-background, thick navy-bordered alternative.

  python3 fix_dark_boxes.py

Replaces the dark navy (#1e293b) background boxes with:
- White/very light blue background
- Thick (3px) dark navy border on the left and top
- Dark navy heading text
- Dark readable body text
- Links in brand-mid blue (readable on light background)
"""
import os

# The old dark-box CSS — appears in all concept pages
OLD_DARK_BOX_CSS = """.dark-box { background: #1e293b; border-radius: 8px; padding: 24px 28px; margin: 28px 0; color: white; font-family: system-ui, sans-serif; }
        .dark-box h3 { color: #93c5fd; margin: 0 0 12px; font-size: 1em; text-transform: uppercase; letter-spacing: 0.08em; font-style: normal; }
        .dark-box p { font-size: 0.97em; color: #e2e8f0; margin-bottom: 10px; line-height: 1.7; }
        .dark-box p:last-child { margin-bottom: 0; }
        .dark-box strong { color: white; }
        .dark-box a { color: #93c5fd; text-decoration: underline; }
        .dark-box a:hover { color: #bfdbfe; }
        .dark-box .quote { font-size: 1.05em; font-style: italic; color: #bfdbfe; border-left: 3px solid #3b82f6; padding-left: 16px; margin: 14px 0; }"""

# Variant without link rules (older pages)
OLD_DARK_BOX_CSS_NO_LINKS = """.dark-box { background: #1e293b; border-radius: 8px; padding: 24px 28px; margin: 28px 0; color: white; font-family: system-ui, sans-serif; }
        .dark-box h3 { color: #93c5fd; margin: 0 0 12px; font-size: 1em; text-transform: uppercase; letter-spacing: 0.08em; font-style: normal; }
        .dark-box p { font-size: 0.97em; color: #e2e8f0; margin-bottom: 10px; line-height: 1.7; }
        .dark-box p:last-child { margin-bottom: 0; }
        .dark-box strong { color: white; }
        .dark-box .quote { font-size: 1.05em; font-style: italic; color: #bfdbfe; border-left: 3px solid #3b82f6; padding-left: 16px; margin: 14px 0; }"""

# The new light-box CSS
NEW_DARK_BOX_CSS = """.dark-box { background: #f0f4f8; border: 3px solid #002d5b; border-radius: 8px; padding: 24px 28px; margin: 28px 0; font-family: system-ui, sans-serif; }
        .dark-box h3 { color: #002d5b; margin: 0 0 12px; font-size: 1em; text-transform: uppercase; letter-spacing: 0.08em; font-style: normal; border-bottom: 2px solid #002d5b; padding-bottom: 8px; }
        .dark-box p { font-size: 0.97em; color: #1e293b; margin-bottom: 10px; line-height: 1.7; }
        .dark-box p:last-child { margin-bottom: 0; }
        .dark-box strong { color: #002d5b; }
        .dark-box a { color: #0056b3; text-decoration: underline; }
        .dark-box a:hover { color: #002d5b; }
        .dark-box .quote { font-size: 1.05em; font-style: italic; color: #0056b3; border-left: 4px solid #002d5b; padding-left: 16px; margin: 14px 0; background: white; padding: 12px 16px; border-radius: 0 6px 6px 0; }"""

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

    if 'dark-box { background: #1e293b' not in content:
        skipped.append(f"  - {fname} — no dark-box")
        continue

    original = content

    # Try full version with links first
    if OLD_DARK_BOX_CSS in content:
        content = content.replace(OLD_DARK_BOX_CSS, NEW_DARK_BOX_CSS)
    elif OLD_DARK_BOX_CSS_NO_LINKS in content:
        content = content.replace(OLD_DARK_BOX_CSS_NO_LINKS, NEW_DARK_BOX_CSS)

    # Also fix any remaining dark background in the HTML itself
    # (some pages use inline style="background:#1e293b" inside dark-box divs)
    # The class handles it — no inline fixes needed

    if content != original:
        with open(fname, 'w', encoding='utf-8') as f:
            f.write(content)
        updated.append(fname)
    else:
        skipped.append(f"  ? {fname} — has dark-box but pattern didn't match exactly")

print(f"Updated {len(updated)} files:")
for f in updated:
    print(f"  ✓ {f}")

if skipped:
    unchanged = [s for s in skipped if 'no dark-box' not in s]
    if unchanged:
        print(f"\nNeeds manual check:")
        for s in unchanged:
            print(s)
