#!/usr/bin/env python3
"""
Run from your project directory to update the Concepts dropdown in index.html.
This version is robust — finds the concepts menu by searching for the button text
rather than relying on structural patterns.

  python3 fix_index_nav.py
"""
import re

NEW_NAV_MENU = """            <div class="nav-dropdown-menu">
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

with open('index.html', encoding='utf-8') as f:
    content = f.read()

print(f"index.html length: {len(content)} chars")
print(f"Has nav-dropdown: {'nav-dropdown' in content}")
print(f"Has Concepts button: {'Concepts' in content}")
print(f"Has nav-dropdown-menu: {'nav-dropdown-menu' in content}")

# Strategy: find "Concepts" button, then find the next nav-dropdown-menu after it
concepts_idx = content.find('Concepts')
if concepts_idx == -1:
    print("ERROR: 'Concepts' not found in index.html")
    exit(1)

print(f"\n'Concepts' found at position {concepts_idx}")
print(f"Context: {repr(content[concepts_idx-50:concepts_idx+100])}")

# Find the nav-dropdown-menu div that follows
menu_start = content.find('<div class="nav-dropdown-menu">', concepts_idx)
if menu_start == -1:
    # Try alternative — maybe it uses a different class
    print("\nLooking for alternative dropdown structures...")
    for term in ['dropdown-menu', 'concepts-menu', 'nav-menu', 'dropdown-content']:
        idx = content.find(term, concepts_idx)
        if idx > 0:
            print(f"  Found '{term}' at {idx}: {repr(content[idx:idx+80])}")
    exit(1)

print(f"\nMenu starts at: {menu_start}")

# Count nested divs to find closing tag
depth = 0
pos = menu_start
menu_end = -1
while pos < len(content):
    if content[pos:pos+4] == '<div':
        depth += 1
    elif content[pos:pos+6] == '</div>':
        depth -= 1
        if depth == 0:
            menu_end = pos + 6
            break
    pos += 1

if menu_end == -1:
    print("ERROR: Could not find end of menu div")
    exit(1)

print(f"Menu ends at: {menu_end}")
print(f"Current menu preview: {repr(content[menu_start:menu_start+200])}")

# Replace
new_content = content[:menu_start] + NEW_NAV_MENU + content[menu_end:]

# Verify
if 'ashbys-law.html' in new_content and 'compliance-trap.html' in new_content:
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("\n✓ index.html updated successfully")
    print(f"  compliance-trap: {'compliance-trap' in new_content}")
    print(f"  ashbys-law: {'ashbys-law' in new_content}")
    print(f"  Why things fail: {'Why things fail' in new_content}")
else:
    print("ERROR: Replacement verification failed")
