#!/usr/bin/env python3
"""
Run from your project directory to diagnose index.html nav issues.
  python3 diagnose_index.py
"""
import re

with open('index.html', encoding='utf-8') as f:
    content = f.read()

print(f"File length: {len(content)} chars")
print()

# 1. Find ALL style blocks
styles = list(re.finditer(r'<style[^>]*>(.*?)</style>', content, re.DOTALL))
print(f"Number of <style> blocks: {len(styles)}")
for i, s in enumerate(styles):
    css = s.group(1)
    has_nav = 'nav-dropdown' in css
    has_header = 'header-nav' in css
    has_overflow = 'overflow' in css
    print(f"  Block {i+1}: nav-dropdown={has_nav}, header-nav={has_header}, overflow={has_overflow}")
    if has_nav:
        # Show the nav rules
        lines = [l.strip() for l in css.split('\n') if 'nav-dropdown' in l or 'header-nav' in l]
        for l in lines[:10]:
            print(f"    {l}")
print()

# 2. Check for overflow:hidden on site-header or any parent
overflow_matches = re.findall(r'[^}]+overflow\s*:\s*hidden[^}]*}', content)
print(f"overflow:hidden rules: {len(overflow_matches)}")
for m in overflow_matches[:5]:
    print(f"  {m.strip()[:100]}")
print()

# 3. Check z-index values
zindex = re.findall(r'z-index\s*:\s*(\d+)', content)
print(f"z-index values: {zindex}")
print()

# 4. Check if site-header has position set
header_rules = re.findall(r'\.site-header\s*\{[^}]+\}', content)
print(f"site-header CSS rules:")
for r in header_rules:
    print(f"  {r.strip()[:200]}")
print()

# 5. Check for any !important overrides on display
important = re.findall(r'display\s*:\s*[^;]+!important[^;]*;', content)
print(f"display !important overrides: {len(important)}")
for imp in important:
    print(f"  {imp.strip()}")
print()

# 6. Check what CSS comes AFTER the injected nav CSS
# Find the injected nav CSS position
nav_pos = content.find('.nav-dropdown:hover .nav-dropdown-menu { display: block; }')
print(f"Nav hover rule position: {nav_pos}")
# Find any overrides after it
after_nav = content[nav_pos:] if nav_pos > 0 else ""
overrides = re.findall(r'\.nav-dropdown[^{]*\{[^}]+\}', after_nav[100:])
print(f"nav-dropdown rules AFTER injected CSS:")
for o in overrides[:10]:
    print(f"  {o.strip()[:100]}")
