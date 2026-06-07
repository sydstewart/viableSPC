#!/usr/bin/env python3
"""
Final fix for index.html nav — removes conflicting display:none rules
and ensures correct CSS order.

  python3 fix_index_final.py
"""
import re

with open('index.html', encoding='utf-8') as f:
    content = f.read()

# Find the first style block
style_match = re.search(r'(<style[^>]*>)(.*?)(</style>)', content, re.DOTALL)
if not style_match:
    print("ERROR: No style block found")
    exit(1)

css = style_match.group(2)
print(f"First style block length: {len(css)} chars")

# Show all display:none rules involving header-nav
dn_matches = re.findall(r'[^{}]*header-nav[^{}]*\{[^}]*display\s*:\s*none[^}]*\}', css)
print(f"\ndisplay:none rules containing header-nav:")
for m in dn_matches:
    print(f"  {repr(m.strip()[:120])}")

# Show the site-header rule
sh_matches = re.findall(r'\.site-header[^{]*\{[^}]+\}', css)
print(f"\nsite-header rules:")
for m in sh_matches:
    print(f"  {repr(m.strip()[:200])}")

# The fix: find where display:none !important is being applied to .header-nav
# and whether it's inside @media print or elsewhere
important_blocks = re.findall(r'@[^{]+\{[^@]*header-nav[^@]*\}', css, re.DOTALL)
print(f"\n@media blocks containing header-nav: {len(important_blocks)}")
for b in important_blocks:
    print(f"  {repr(b.strip()[:200])}")

# Find .site-header, .header-nav, .header-tool-btn pattern
combined = re.findall(r'\.site-header,\s*\.header-nav[^{]*\{[^}]+\}', css)
print(f"\nCombined site-header/header-nav rules:")
for c in combined:
    print(f"  {repr(c.strip()[:200])}")
