#!/usr/bin/env python3
"""
Run from your project directory to fix canonical tags across all HTML files.
  python3 fix_canonical.py

Adds/updates <link rel="canonical"> in every page to prevent
Google treating index.html and / as duplicates.
"""
import os

# Canonical URLs for each page
CANONICALS = {
    'index.html': 'https://stepchangeanalysis.com/',
}

# For all other pages, canonical = https://stepchangeanalysis.com/filename.html
# Already in index.html from original build — but needs to be correct

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

    # Determine canonical URL
    if fname == 'index.html':
        canonical = 'https://stepchangeanalysis.com/'
    else:
        canonical = f'https://stepchangeanalysis.com/{fname}'

    canonical_tag = f'<link rel="canonical" href="{canonical}">'

    # Check if canonical already exists
    if 'rel="canonical"' in content:
        # Update it if wrong
        import re
        existing = re.search(r'<link rel="canonical" href="([^"]+)">', content)
        if existing and existing.group(1) == canonical:
            skipped.append(f"  ✓ {fname} — canonical already correct")
            continue
        # Replace wrong canonical
        content = re.sub(r'<link rel="canonical"[^>]+>', canonical_tag, content)
        with open(fname, 'w', encoding='utf-8') as f:
            f.write(content)
        updated.append(f"  ✓ {fname} — canonical updated to {canonical}")
    else:
        # Add after <meta charset>
        content = content.replace(
            '<meta charset="UTF-8">',
            f'<meta charset="UTF-8">\n    {canonical_tag}',
            1
        )
        with open(fname, 'w', encoding='utf-8') as f:
            f.write(content)
        updated.append(f"  ✓ {fname} — canonical added: {canonical}")

print(f"Updated {len(updated)} files:")
for u in updated:
    print(u)
if skipped:
    print(f"\nAlready correct ({len(skipped)}):")
    for s in skipped:
        print(s)
