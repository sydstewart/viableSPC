#!/usr/bin/env python3
"""
Run from your project directory to fix glossary.html and index.html.
  python3 fix_glossary_index.py
"""
import os

# ============================================================
# GLOSSARY.HTML
# Already has dropdown nav but needs hover fix
# Its CSS is minified so different pattern from other files
# ============================================================

GLOSSARY_HOVER_OLD = """.nav-dropdown-menu{display:none;position:absolute;top:calc(100% + 6px);left:0;background:white;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.12);min-width:220px;z-index:200;padding:6px 0;}
        .nav-dropdown:hover .nav-dropdown-menu{display:block;}"""

GLOSSARY_HOVER_NEW = """.nav-dropdown-menu{display:none;position:absolute;top:100%;left:0;background:white;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.12);min-width:220px;z-index:200;padding:12px 0 6px;margin-top:0;}
        .nav-dropdown:hover .nav-dropdown-menu{display:block;}
        .nav-dropdown-menu::before{content:'';position:absolute;top:-8px;left:0;right:0;height:8px;}"""

# Also add the nav dropdown CSS to glossary if missing
GLOSSARY_NAV_CSS_CHECK = ".nav-dropdown-menu"

# ============================================================
# INDEX.HTML
# Has button-based nav - completely different structure
# Add a top nav bar above the existing app-header
# ============================================================

INDEX_OLD_HEADER = """    <!-- ── App Header ── -->
    <div class="app-header">
        <h1>&#128202; StepChangeAnalysis.com — SPC Analyzer</h1>
        <div class="header-buttons">
            <button class="btn-scanner" onclick="window.location.href='start-here.html'" style="background:#7c3aed;">&#128161; Start here</button>
            <button class="btn-scanner" onclick="window.open('scanner.html', '_blank')">&#128269; Data Validator</button>
            <button class="btn-articles" onclick="document.getElementById('articlesModal').classList.add('active')">&#128240; Articles</button>
            <button class="btn-feedback" onclick="window.open('https://docs.google.com/forms/d/e/1FAIpQLSeM9hZ75140SEKR0Mex4JvLEEdp9E8hq9w5Ug5ItDH9Qx5fkg/viewform?usp=publish-editor', '_blank')">&#128172; Feedback</button>
            <button class="btn-help" onclick="document.getElementById('helpModal').classList.add('active')">&#10067; Help</button>
        </div>
    </div>"""

INDEX_NEW_HEADER = """    <!-- ── Site Nav Bar ── -->
    <div style="background:#002d5b;padding:10px 0 10px 4px;margin:-20px -20px 16px -20px;display:flex;align-items:center;gap:4px;flex-wrap:wrap;font-family:system-ui,sans-serif;position:relative;">
        <a href="index.html" style="color:white;text-decoration:none;font-weight:bold;font-size:1em;padding:6px 12px;">&#128202; StepChangeAnalysis.com</a>
        <a href="start-here.html" style="color:rgba(255,255,255,0.85);font-size:0.88em;font-weight:500;text-decoration:none;padding:6px 10px;border-radius:4px;">Start here</a>
        <div class="site-nav-dropdown" style="position:relative;">
            <button onclick="this.parentElement.classList.toggle('open')" style="color:rgba(255,255,255,0.85);font-family:system-ui,sans-serif;font-size:0.88em;font-weight:500;background:none;border:none;cursor:pointer;padding:6px 10px;border-radius:4px;display:flex;align-items:center;gap:4px;">Concepts &#9660;</button>
            <div class="site-nav-menu" style="display:none;position:absolute;top:100%;left:0;background:white;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.12);min-width:200px;z-index:9999;padding:6px 0;">
                <a href="why-nothing-changes.html" style="display:block;color:#1e293b;font-family:system-ui,sans-serif;font-size:0.85em;padding:8px 16px;text-decoration:none;">Why nothing changes</a>
                <a href="joiner-levels-of-fix.html" style="display:block;color:#1e293b;font-family:system-ui,sans-serif;font-size:0.85em;padding:8px 16px;text-decoration:none;">Joiner levels of fix</a>
                <a href="deming-14-points.html" style="display:block;color:#1e293b;font-family:system-ui,sans-serif;font-size:0.85em;padding:8px 16px;text-decoration:none;">Deming&#8217;s 14 Points</a>
                <a href="pdsa-cycle.html" style="display:block;color:#1e293b;font-family:system-ui,sans-serif;font-size:0.85em;padding:8px 16px;text-decoration:none;">PDSA cycle</a>
            </div>
        </div>
        <div class="site-nav-dropdown" style="position:relative;">
            <button onclick="this.parentElement.classList.toggle('open')" style="color:rgba(255,255,255,0.85);font-family:system-ui,sans-serif;font-size:0.88em;font-weight:500;background:none;border:none;cursor:pointer;padding:6px 10px;border-radius:4px;display:flex;align-items:center;gap:4px;">Articles &#9660;</button>
            <div class="site-nav-menu" style="display:none;position:absolute;top:100%;left:0;background:white;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.12);min-width:240px;z-index:9999;padding:6px 0;">
                <div style="font-family:system-ui,sans-serif;font-size:0.72em;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;padding:8px 16px 4px;">NHS Healthcare</div>
                <a href="why-nothing-has-worked-nhs-ae-performance.html" style="display:block;color:#1e293b;font-family:system-ui,sans-serif;font-size:0.85em;padding:8px 16px;text-decoration:none;">NHS A&amp;E</a>
                <a href="dementia-diagnosis-rate.html" style="display:block;color:#1e293b;font-family:system-ui,sans-serif;font-size:0.85em;padding:8px 16px;text-decoration:none;">Dementia &#8212; The 66% target</a>
                <a href="gp-appointments-analysis.html" style="display:block;color:#1e293b;font-family:system-ui,sans-serif;font-size:0.85em;padding:8px 16px;text-decoration:none;">GP appointments</a>
                <a href="never-events-wrong-route.html" style="display:block;color:#1e293b;font-family:system-ui,sans-serif;font-size:0.85em;padding:8px 16px;text-decoration:none;">Never events</a>
                <a href="anticoag-safety.html" style="display:block;color:#1e293b;font-family:system-ui,sans-serif;font-size:0.85em;padding:8px 16px;text-decoration:none;">Anticoagulation safety</a>
                <a href="sepsis-six-does-public-data-show-whether-it-worked.html" style="display:block;color:#1e293b;font-family:system-ui,sans-serif;font-size:0.85em;padding:8px 16px;text-decoration:none;">Sepsis Six</a>
                <hr style="border:none;border-top:1px solid #e2e8f0;margin:4px 0;">
                <div style="font-family:system-ui,sans-serif;font-size:0.72em;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;padding:8px 16px 4px;">Environment &amp; Policy</div>
                <a href="ulez-london-air-quality.html" style="display:block;color:#1e293b;font-family:system-ui,sans-serif;font-size:0.85em;padding:8px 16px;text-decoration:none;">ULEZ &#8212; Air quality</a>
                <a href="the-grid-fixed-itself.html" style="display:block;color:#1e293b;font-family:system-ui,sans-serif;font-size:0.85em;padding:8px 16px;text-decoration:none;">The Grid fixed itself</a>
                <a href="uk-gdp-analysis.html" style="display:block;color:#1e293b;font-family:system-ui,sans-serif;font-size:0.85em;padding:8px 16px;text-decoration:none;">UK GDP analysis</a>
                <hr style="border:none;border-top:1px solid #e2e8f0;margin:4px 0;">
                <div style="font-family:system-ui,sans-serif;font-size:0.72em;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;padding:8px 16px 4px;">Industrial</div>
                <a href="hydrogen-plant-cusum.html" style="display:block;color:#1e293b;font-family:system-ui,sans-serif;font-size:0.85em;padding:8px 16px;text-decoration:none;">Hydrogen plant CUSUM</a>
            </div>
        </div>
        <a href="three-charts-three-stories.html" style="color:rgba(255,255,255,0.85);font-size:0.88em;font-weight:500;text-decoration:none;padding:6px 10px;border-radius:4px;">Why Bootstrap CUSUM?</a>
        <a href="glossary.html" style="color:rgba(255,255,255,0.85);font-size:0.88em;font-weight:500;text-decoration:none;padding:6px 10px;border-radius:4px;">Glossary</a>
        <a href="about.html" style="color:rgba(255,255,255,0.85);font-size:0.88em;font-weight:500;text-decoration:none;padding:6px 10px;border-radius:4px;">About</a>
    </div>
    <script>
    document.addEventListener('click', function(e) {
        document.querySelectorAll('.site-nav-dropdown').forEach(function(d) {
            if (!d.contains(e.target)) {
                d.classList.remove('open');
                d.querySelector('.site-nav-menu').style.display = 'none';
            }
        });
        var btn = e.target.closest('.site-nav-dropdown button');
        if (btn) {
            var menu = btn.parentElement.querySelector('.site-nav-menu');
            var isOpen = btn.parentElement.classList.contains('open');
            document.querySelectorAll('.site-nav-dropdown').forEach(function(d) {
                d.classList.remove('open');
                d.querySelector('.site-nav-menu').style.display = 'none';
            });
            if (!isOpen) {
                btn.parentElement.classList.add('open');
                menu.style.display = 'block';
            }
        }
    });
    </script>

    <!-- ── App Header ── -->
    <div class="app-header">
        <h1>&#128202; StepChangeAnalysis.com — SPC Analyzer</h1>
        <div class="header-buttons">
            <button class="btn-scanner" onclick="window.location.href='start-here.html'" style="background:#7c3aed;">&#128161; Start here</button>
            <button class="btn-scanner" onclick="window.open('scanner.html', '_blank')">&#128269; Data Validator</button>
            <button class="btn-articles" onclick="document.getElementById('articlesModal').classList.add('active')">&#128240; Articles</button>
            <button class="btn-feedback" onclick="window.open('https://docs.google.com/forms/d/e/1FAIpQLSeM9hZ75140SEKR0Mex4JvLEEdp9E8hq9w5Ug5ItDH9Qx5fkg/viewform?usp=publish-editor', '_blank')">&#128172; Feedback</button>
            <button class="btn-help" onclick="document.getElementById('helpModal').classList.add('active')">&#10067; Help</button>
        </div>
    </div>"""

# ============================================================
# PROCESS FILES
# ============================================================

results = []

# --- GLOSSARY ---
if os.path.exists('glossary.html'):
    with open('glossary.html', encoding='utf-8') as f:
        content = f.read()
    original = content

    # Apply hover fix - the glossary CSS may be minified or spaced differently
    # Try the spaced version first (from fix_dropdown_hover.py)
    from_fix = """        .nav-dropdown-menu { display: none; position: absolute; top: calc(100% + 6px); left: 0; background: white; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.12); min-width: 220px; z-index: 200; padding: 6px 0; }
        .nav-dropdown:hover .nav-dropdown-menu { display: block; }"""
    to_fix = """        .nav-dropdown-menu { display: none; position: absolute; top: 100%; left: 0; background: white; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.12); min-width: 220px; z-index: 200; padding: 12px 0 6px; margin-top: 0; }
        .nav-dropdown:hover .nav-dropdown-menu { display: block; }
        .nav-dropdown-menu::before { content: ''; position: absolute; top: -8px; left: 0; right: 0; height: 8px; }"""

    if from_fix in content:
        content = content.replace(from_fix, to_fix)
        results.append("✓ glossary.html — hover fix applied (spaced CSS)")
    elif 'top:calc(100% + 6px)' in content:
        # Minified version
        content = content.replace(
            'top:calc(100% + 6px);left:0;background:white;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.12);min-width:220px;z-index:200;padding:6px 0;}',
            'top:100%;left:0;background:white;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.12);min-width:220px;z-index:200;padding:12px 0 6px;margin-top:0;}.nav-dropdown-menu::before{content:\'\';position:absolute;top:-8px;left:0;right:0;height:8px;}'
        )
        results.append("✓ glossary.html — hover fix applied (minified CSS)")
    elif 'nav-dropdown-menu::before' in content:
        results.append("✓ glossary.html — hover fix already applied")
    else:
        results.append("⚠ glossary.html — hover fix pattern not found (may already be fixed)")

    if content != original:
        with open('glossary.html', 'w', encoding='utf-8') as f:
            f.write(content)
else:
    results.append("✗ glossary.html — not found")

# --- INDEX.HTML ---
if os.path.exists('index.html'):
    with open('index.html', encoding='utf-8') as f:
        content = f.read()
    original = content

    # Check if nav already added
    if 'site-nav-dropdown' in content:
        results.append("✓ index.html — site nav already present")
    elif INDEX_OLD_HEADER in content:
        content = content.replace(INDEX_OLD_HEADER, INDEX_NEW_HEADER)
        with open('index.html', 'w', encoding='utf-8') as f:
            f.write(content)
        results.append("✓ index.html — site nav bar added above app header")
    else:
        results.append("⚠ index.html — app header pattern not found — check manually")
else:
    results.append("✗ index.html — not found")

for r in results:
    print(r)
