#!/usr/bin/env python3
"""
Run from your project directory to fix mobile and tablet responsiveness.
  python3 fix_responsive.py

Fixes:
1. Tables — scroll wrapper on mobile, larger tap targets
2. Font sizes — body text readable at 16px+ on mobile
3. Tablet (768px) — font sizes and padding comfortable
4. Summary grids — single column on mobile
5. Nav bar — hidden on mobile (already done), hamburger not needed
   as users can use the dropdown from tablet up
6. Header — logo + tool button stack neatly on narrow screens
7. Article/page wrap — sensible padding on all screen sizes
"""
import os, re

# The complete responsive CSS block to inject into every HTML file
# Covers mobile (max 600px), tablet (601-900px), and print
RESPONSIVE_CSS = """
        /* ============================================================
           RESPONSIVE — mobile, tablet, print
           ============================================================ */

        /* Tablet (601px – 900px) */
        @media (max-width: 900px) {
            body { font-size: 16px; }
            .article-wrap, .page-wrap { padding: 28px 20px 60px; }
            h1, .article-title { font-size: clamp(1.5em, 5vw, 2.2em); }
            h2 { font-size: 1.2em; }
            /* Tables — make them scroll horizontally */
            .data-table-wrap, .numbers-box, table { overflow-x: auto; display: block; }
            .numbers-box table, .data-table, .examples-table,
            .inputs-table { display: block; overflow-x: auto; white-space: nowrap; }
            /* Grids — 2 columns max on tablet */
            .summary-grid, .measure-grid, .question-grid,
            .nav-grid, .rules-grid, .weco-rules { grid-template-columns: 1fr 1fr; }
            .lead-lag-box { grid-template-columns: 1fr 1fr; }
            /* PDSA wrap — stack vertically */
            .pdsa-wrap { flex-direction: column; align-items: center; }
            /* Funnel wrap — stack */
            .funnel-wrap { flex-direction: column; }
        }

        /* Mobile (max 600px) */
        @media (max-width: 600px) {
            body { font-size: 16px; line-height: 1.7; }

            /* Header */
            .site-header { padding: 10px 16px; gap: 8px; }
            .header-nav { display: none; }
            .header-tool-btn { font-size: 0.85em; padding: 7px 14px; }

            /* Page wraps */
            .article-wrap, .page-wrap { padding: 20px 16px 48px; }
            .article-wrap { max-width: 100%; }

            /* Typography */
            h1, .article-title { font-size: clamp(1.4em, 6vw, 2em); }
            h2 { font-size: 1.15em; margin: 32px 0 12px; }
            h3 { font-size: 1em; }
            p { font-size: 1em; }

            /* Tables — horizontal scroll, min readable size */
            table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch;
                    white-space: nowrap; font-size: 0.82em; }
            .data-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
            .numbers-box { padding: 10px 12px; overflow-x: auto; }
            .numbers-box table { font-size: 0.8em; }
            .numbers-box th, .numbers-box td { padding: 7px 10px; }
            .examples-table, .inputs-table { font-size: 0.8em; }
            /* Allow table cell text to wrap on mobile for readability */
            .examples-table td, .inputs-table td { white-space: normal; min-width: 100px; }

            /* Grids — single column */
            .summary-grid, .measure-grid, .question-grid,
            .nav-grid, .rules-grid, .weco-rules,
            .lead-lag-box, .chart-pair, .funnel-wrap { grid-template-columns: 1fr;
                                                         flex-direction: column; }

            /* Summary/card boxes */
            .summary-grid > div, .measure-grid > div { min-width: unset; }

            /* PDSA diagram and wrap */
            .pdsa-wrap { flex-direction: column; align-items: center; gap: 16px; }
            .pdsa-svg { max-width: 260px; }
            .pdsa-detail { min-width: unset; width: 100%; }

            /* Concept page zone diagrams */
            .weco-zones { font-size: 0.85em; }
            .weco-label { width: 60px; min-width: 60px; font-size: 0.72em; }

            /* Dark boxes */
            .dark-box { padding: 18px 16px; }
            .dark-box p { font-size: 0.92em; }

            /* Callout boxes */
            .callout, .finding-box, .callout-box,
            .deming-box, .analysis-box { padding: 14px 16px; }

            /* Article summary box grids */
            div[style*="grid-template-columns"] { grid-template-columns: 1fr !important; }

            /* Breadcrumb */
            .breadcrumb { font-size: 0.78em; }

            /* Cycles row — scroll */
            .cycles-row { overflow-x: auto; -webkit-overflow-scrolling: touch; }

            /* Three questions */
            .three-questions .q-number { width: 44px; min-width: 44px; font-size: 1.2em; }

            /* WECO zones diagram labels */
            .weco-label { padding: 8px 4px; }

            /* Chart figures */
            .chart-figure img, .chart-figure svg { width: 100%; height: auto; }

            /* Footer */
            .page-footer, .article-footer { font-size: 0.8em; }
            .page-footer ul, .article-footer ul { padding-left: 14px; }
        }

        /* Print */
        @media print {
            .site-header, .header-nav, .header-tool-btn,
            .nav-grid, .toc-details, .cta-box { display: none !important; }
            body { font-size: 12pt; color: black; background: white; }
            .article-wrap, .page-wrap { max-width: 100%; padding: 0; }
            a { color: black; }
        }"""

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

    if 'RESPONSIVE — mobile, tablet, print' in content:
        skipped.append(f"  ✓ {fname} — already has responsive CSS")
        continue

    # Find </style> and inject before it
    # But first remove any existing partial responsive @media blocks we're replacing
    # Remove old single-line mobile-only rules that we are superseding
    old_patterns = [
        '@media (max-width: 600px) { .header-nav { display: none; } }',
        '@media (max-width: 600px) { .hero h1 { font-size: 1.7em; } }',
        '@media (max-width: 600px) { .lead-lag-box { grid-template-columns: 1fr; } }',
        '@media (max-width: 640px) { .chart-pair { grid-template-columns: 1fr; } }',
        '@media (max-width: 600px) { h1 { font-size: 1.6em; } .numbers-box td, .numbers-box th { padding: 7px 10px; font-size: 0.82em; } }',
    ]
    for old in old_patterns:
        content = content.replace(old, '')

    # Inject before </style>
    if '</style>' in content:
        content = content.replace('</style>', RESPONSIVE_CSS + '\n    </style>', 1)
        with open(fname, 'w', encoding='utf-8') as f:
            f.write(content)
        updated.append(fname)
    else:
        skipped.append(f"  ? {fname} — no </style> tag found")

print(f"Updated {len(updated)} files:")
for f in updated:
    print(f"  ✓ {f}")
if skipped:
    print(f"\nSkipped ({len(skipped)}):")
    for s in skipped:
        print(s)
