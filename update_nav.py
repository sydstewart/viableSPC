#!/usr/bin/env python3
"""
Run this script in your project directory to update anticoag-safety.html
and all other article files with the dropdown nav.
"""
import os

OLD_CSS = """        .site-header { background: var(--brand-blue); padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
        .site-header a { color: white; text-decoration: none; font-family: system-ui, sans-serif; font-size: 1em; font-weight: bold; }
        .site-header a:hover { text-decoration: underline; }
        .header-tool-btn { background: var(--green); color: white; padding: 8px 18px; border-radius: 4px; font-family: system-ui, sans-serif; font-size: 0.9em; font-weight: bold; }
        .header-tool-btn:hover { background: #146c43; text-decoration: none !important; }"""

NEW_CSS = """        .site-header { background: var(--brand-blue); padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
        .site-header a { color: white; text-decoration: none; font-family: system-ui, sans-serif; font-size: 1em; font-weight: bold; }
        .site-header a:hover { text-decoration: underline; }
        .header-nav { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
        .header-nav a { color: rgba(255,255,255,0.85); font-family: system-ui, sans-serif; font-size: 0.88em; font-weight: 500; text-decoration: none; padding: 6px 10px; border-radius: 4px; }
        .header-nav a:hover { color: white; background: rgba(255,255,255,0.1); text-decoration: none; }
        .nav-dropdown { position: relative; }
        .nav-dropdown-btn { color: rgba(255,255,255,0.85); font-family: system-ui, sans-serif; font-size: 0.88em; font-weight: 500; background: none; border: none; cursor: pointer; padding: 6px 10px; border-radius: 4px; display: flex; align-items: center; gap: 4px; }
        .nav-dropdown-btn:hover { color: white; background: rgba(255,255,255,0.1); }
        .nav-dropdown-btn .arrow { font-size: 0.7em; transition: transform 0.2s; }
        .nav-dropdown:hover .arrow { transform: rotate(180deg); }
        .nav-dropdown-menu { display: none; position: absolute; top: calc(100% + 6px); left: 0; background: white; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.12); min-width: 220px; z-index: 200; padding: 6px 0; }
        .nav-dropdown:hover .nav-dropdown-menu { display: block; }
        .nav-dropdown-menu a { display: block; color: #1e293b; font-family: system-ui, sans-serif; font-size: 0.85em; padding: 8px 16px; text-decoration: none; white-space: nowrap; border-radius: 0; background: none; }
        .nav-dropdown-menu a:hover { background: #e9f2ff; color: #002d5b; }
        .nav-dropdown-menu .menu-section { font-family: system-ui, sans-serif; font-size: 0.72em; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #94a3b8; padding: 8px 16px 4px; }
        .nav-dropdown-menu .menu-divider { border: none; border-top: 1px solid #e2e8f0; margin: 4px 0; }
        .header-tool-btn { background: var(--green); color: white; padding: 8px 18px; border-radius: 4px; font-family: system-ui, sans-serif; font-size: 0.9em; font-weight: bold; }
        .header-tool-btn:hover { background: #146c43; text-decoration: none !important; }
        @media (max-width: 600px) { .header-nav { display: none; } }"""

OLD_HEADER_MINIMAL = '''<header class="site-header">
    <a href="index.html">&#128202; StepChangeAnalysis.com</a>
    <a href="index.html" class="header-tool-btn">&#9654; Open the Free Tool</a>
</header>'''

NEW_HEADER = '''<header class="site-header">
    <a href="index.html">&#128202; StepChangeAnalysis.com</a>
    <nav class="header-nav">
        <a href="start-here.html">Start here</a>
        <div class="nav-dropdown">
            <button class="nav-dropdown-btn">Concepts <span class="arrow">&#9660;</span></button>
            <div class="nav-dropdown-menu">
                <a href="why-nothing-changes.html">Why nothing changes</a>
                <a href="joiner-levels-of-fix.html">Joiner levels of fix</a>
                <a href="deming-14-points.html">Deming&rsquo;s 14 Points</a>
                <a href="pdsa-cycle.html">PDSA cycle</a>
            </div>
        </div>
        <div class="nav-dropdown">
            <button class="nav-dropdown-btn">Articles <span class="arrow">&#9660;</span></button>
            <div class="nav-dropdown-menu">
                <div class="menu-section">NHS Healthcare</div>
                <a href="why-nothing-has-worked-nhs-ae-performance.html">NHS A&amp;E &mdash; Why nothing has worked</a>
                <a href="dementia-diagnosis-rate.html">Dementia &mdash; The 66% target</a>
                <a href="gp-appointments-analysis.html">GP appointments</a>
                <a href="never-events-wrong-route.html">Never events &mdash; Wrong route</a>
                <a href="anticoag-safety.html">Anticoagulation safety</a>
                <a href="sepsis-six-does-public-data-show-whether-it-worked.html">Sepsis Six</a>
                <hr class="menu-divider">
                <div class="menu-section">Environment &amp; Policy</div>
                <a href="ulez-london-air-quality.html">ULEZ &mdash; Air quality</a>
                <a href="the-grid-fixed-itself.html">The Grid fixed itself</a>
                <a href="uk-gdp-analysis.html">UK GDP analysis</a>
                <hr class="menu-divider">
                <div class="menu-section">Industrial</div>
                <a href="hydrogen-plant-cusum.html">Hydrogen plant CUSUM</a>
            </div>
        </div>
        <a href="three-charts-three-stories.html">Why Bootstrap CUSUM?</a>
        <a href="glossary.html">Glossary</a>
        <a href="about.html">About</a>
    </nav>
    <a href="index.html" class="header-tool-btn">&#9654; Open the free tool</a>
</header>'''

# Process all HTML files in current directory
for fname in os.listdir('.'):
    if not fname.endswith('.html'):
        continue
    with open(fname) as f:
        content = f.read()
    original = content
    content = content.replace(OLD_CSS, NEW_CSS)
    content = content.replace(OLD_HEADER_MINIMAL, NEW_HEADER)
    if content != original:
        with open(fname, 'w') as f:
            f.write(content)
        print(f"Updated: {fname}")
    else:
        # Check if it already has the dropdown
        if 'nav-dropdown' in content:
            print(f"Already updated: {fname}")
        else:
            print(f"No match found: {fname} - check manually")

print("Done")
