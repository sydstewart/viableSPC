#!/usr/bin/env python3
"""
Run from your project directory to fix remaining dark background boxes
in dementia, GP appointments, never events, and A&E articles.

  python3 fix_remaining_dark_boxes.py

These files use .deming-box, .ab-dark, .ab-slate, and .constraint-box
rather than .dark-box — this script handles all of them.
"""
import os, re

# New light style to apply to all dark-background boxes
LIGHT_STYLE = "background: #f0f4f8; border: 3px solid #002d5b; color: #1e293b;"
LIGHT_H3 = "color: #002d5b;"
LIGHT_P = "color: #1e293b;"
LIGHT_STRONG = "color: #002d5b;"
LIGHT_A = "color: #0056b3;"
LIGHT_QUOTE = "color: #0056b3; border-left: 4px solid #002d5b; background: white; padding: 12px 16px; border-radius: 0 6px 6px 0;"

def fix_dark_class(content, classname):
    """Replace dark background styling for a given CSS class."""
    # Pattern: find .classname { ... } block containing #1e293b
    pattern = re.compile(
        r'(' + re.escape('.' + classname) + r'\s*\{)([^}]*#1e293b[^}]*)(\})',
        re.DOTALL
    )
    def replacer(m):
        block = m.group(2)
        # Replace background color
        block = re.sub(r'background:\s*#1e293b', 'background: #f0f4f8', block)
        block = re.sub(r'background:#1e293b', 'background:#f0f4f8', block)
        # Replace white text color
        block = re.sub(r'(?<![a-z-])color:\s*white', 'color: #1e293b', block)
        block = re.sub(r'(?<![a-z-])color:\s*#ffffff', 'color: #1e293b', block)
        # Add border if not present
        if 'border:' not in block and 'border-left:' not in block:
            block = block.rstrip() + '\n        border: 3px solid #002d5b;'
        return m.group(1) + block + m.group(3)
    return pattern.sub(replacer, content)

def fix_subclass(content, classname, subclass, new_color):
    """Fix colour on a sub-class like .deming-box h3."""
    pattern = re.compile(
        r'(' + re.escape('.' + classname + ' ' + subclass) + r'\s*\{)([^}]*)(\})',
        re.DOTALL
    )
    def replacer(m):
        block = m.group(2)
        block = re.sub(r'color:\s*#93c5fd', f'color: {new_color}', block)
        block = re.sub(r'color:\s*#bfdbfe', f'color: {new_color}', block)
        block = re.sub(r'color:\s*white', f'color: {new_color}', block)
        block = re.sub(r'color:\s*#e2e8f0', 'color: #1e293b', block)
        block = re.sub(r'color:\s*#cbd5e1', 'color: #1e293b', block)
        block = re.sub(r'color:\s*#7dd3fc', f'color: {new_color}', block)
        return m.group(1) + block + m.group(3)
    return pattern.sub(replacer, content)

updated = []
unchanged = []

for fname in sorted(os.listdir('.')):
    if not fname.endswith('.html'):
        continue
    try:
        with open(fname, encoding='utf-8') as f:
            content = f.read()
    except Exception:
        continue

    # Skip if no dark backgrounds remain
    if '#1e293b' not in content:
        continue
    # Skip if already fixed (light background box already in place)
    if 'dark-box { background: #1e293b' not in content \
       and 'deming-box { background: #1e293b' not in content \
       and 'ab-dark { background: #1e293b' not in content \
       and 'ab-slate { background: #334155' not in content \
       and '.ab-dark{background:#1e293b' not in content:
        continue

    original = content

    # Fix each dark class variant
    for cls in ['dark-box', 'deming-box', 'ab-dark']:
        content = fix_dark_class(content, cls)
        content = fix_subclass(content, cls, 'h3', '#002d5b')
        content = fix_subclass(content, cls, 'p', '#1e293b')
        content = fix_subclass(content, cls, 'strong', '#002d5b')

    # Fix ab-slate (dark slate background)
    content = re.sub(r'(\.ab-slate\s*\{[^}]*)background:\s*#334155', 
                     r'\1background: #f1f5f9', content)
    content = re.sub(r'(\.ab-slate\s*h3\s*\{[^}]*)color:\s*#7dd3fc',
                     r'\1color: #002d5b', content)
    content = re.sub(r'(\.ab-slate[^}]*\{[^}]*)color:\s*#cbd5e1',
                     r'\1color: #1e293b', content)

    # Fix constraint-box if present
    content = re.sub(r'(\.constraint-box\s*\{[^}]*)background:\s*#1e3a5f',
                     r'\1background: #eff6ff', content)
    content = re.sub(r'(\.constraint-box\s*p\s*\{[^}]*)color:\s*#e2e8f0',
                     r'\1color: #1e293b', content)

    # Fix inline .deming-quote styles
    content = re.sub(r'(\.deming-box\s*\.deming-quote\s*\{[^}]*)color:\s*#bfdbfe',
                     r'\1color: #0056b3', content)
    content = re.sub(r'(\.ab-dark\s*\.deming-quote\s*\{[^}]*)color:\s*#bfdbfe',
                     r'\1color: #0056b3', content)

    if content != original:
        with open(fname, 'w', encoding='utf-8') as f:
            f.write(content)
        updated.append(fname)
    else:
        unchanged.append(fname)

print(f"Updated {len(updated)} files:")
for f in updated:
    print(f"  \u2713 {f}")
if unchanged:
    print(f"\nNo dark boxes found or already fixed ({len(unchanged)} files checked)")
