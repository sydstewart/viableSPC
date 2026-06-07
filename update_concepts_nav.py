#!/usr/bin/env python3
"""
Run from your project directory to update ALL HTML files with the
new grouped Concepts dropdown nav.

  python3 update_concepts_nav.py

Groups:
  Why things fail: why-nothing-changes, joiner, deming, innovators-dilemma
  Measurement & analysis: types-of-measures, variation-spc, BOT, CLD, tampering
  Improvement method: model-for-improvement, pdsa, 5-whys, RCA, bright-spots, pick
  Systems & constraints: TOC, necessary-but-not-sufficient, failure-demand, focus, standardisation
"""
import os, re

NEW_NAV = """            <div class="nav-dropdown-menu">
                <div class="menu-section">Why things fail</div>
                <a href="why-nothing-changes.html">Why nothing changes</a>
                <a href="joiner-levels-of-fix.html">Joiner levels of fix</a>
                <a href="deming-14-points.html">Deming&rsquo;s 14 Points</a>
                <a href="innovators-dilemma.html">The Innovator&rsquo;s Dilemma</a>
                <a href="compliance-trap.html">The Compliance Trap</a>
                <hr class="menu-divider">
                <div class="menu-section">Measurement &amp; analysis</div>
                <a href="types-of-measures.html">Types of measures</a>
                <a href="variation-and-spc.html">Variation &amp; SPC</a>
                <a href="behaviour-over-time.html">Behaviour Over Time</a>
                <a href="causal-loop-diagrams.html">Causal Loop Diagrams</a>
                <a href="tampering-and-impatience.html">Tampering &amp; Impatience</a>
                <hr class="menu-divider">
                <div class="menu-section">Improvement method</div>
                <a href="model-for-improvement.html">Model for Improvement</a>
                <a href="pdsa-cycle.html">PDSA cycle</a>
                <a href="five-whys.html">The 5 Whys</a>
                <a href="root-cause-analysis.html">Root Cause Analysis</a>
                <a href="bright-spots.html">Bright Spots</a>
                <a href="pick-model.html">The PICK Model</a>
                <hr class="menu-divider">
                <div class="menu-section">Systems &amp; constraints</div>
                <a href="theory-of-constraints.html">Theory of Constraints</a>
                <a href="necessary-but-not-sufficient.html">Necessary But Not Sufficient</a>
                <a href="failure-demand.html">Failure Demand</a>
                <a href="focus-and-prioritisation.html">Focus &amp; Prioritisation</a>
                <a href="standardisation-vs-customisation.html">Standardisation vs Customisation</a>
                <a href="ashbys-law.html">Ashby&rsquo;s Law of Requisite Variety</a>
            </div>"""

# Pattern: find the entire concepts dropdown menu div and replace it
# Anchored by the button text before it and the Articles dropdown after it
DROPDOWN_PATTERN = re.compile(
    r'(<div class="nav-dropdown-menu">)(.*?)(</div>)(?=\s*</div>\s*<div class="nav-dropdown">)',
    re.DOTALL
)

updated = []
already_correct = []
skipped = []

for fname in sorted(os.listdir('.')):
    if not fname.endswith('.html'):
        continue
    try:
        with open(fname, encoding='utf-8') as f:
            content = f.read()
    except Exception:
        continue

    if 'nav-dropdown-menu' not in content:
        continue

    # Check if already correct (has the grouped structure)
    if 'Why things fail' in content and 'ashbys-law.html' in content and 'compliance-trap.html' in content:
        already_correct.append(fname)
        continue

    # Find and replace the first nav-dropdown-menu (Concepts dropdown)
    match = DROPDOWN_PATTERN.search(content)
    if match:
        # Check if this page has an active link style we need to preserve
        old_block = match.group(0)
        active_match = re.search(r'href="(' + re.escape(fname) + r')"[^>]*style="[^"]*font-weight:600[^"]*"', old_block)
        
        new_block = NEW_NAV
        
        # Re-apply active style to this page's link if it had one
        if active_match:
            page_link = f'href="{fname}">'
            active_link = f'href="{fname}" style="font-weight:600;color:#002d5b;">'
            new_block = new_block.replace(page_link, active_link)
        
        new_content = content[:match.start()] + new_block + content[match.end():]
        with open(fname, 'w', encoding='utf-8') as f:
            f.write(new_content)
        updated.append(fname)
    else:
        skipped.append(f"  ? {fname}")

print(f"Updated {len(updated)} files:")
for f in updated:
    print(f"  \u2713 {f}")
if already_correct:
    print(f"\nAlready correct ({len(already_correct)}):")
    for f in already_correct:
        print(f"  \u2713 {f}")
if skipped:
    print(f"\nSkipped:")
    for f in skipped:
        print(f)
