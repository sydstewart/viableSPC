/**
 * app.js — StepChangeAnalysis.com SPC Analyzer
 * Wires up all UI elements to the pure-JS worker engine.
 *
 * Features:
 *   - Per-file settings memory (localStorage) — remembers last settings per filename
 *   - Controls pre-loaded before file upload so user can set preferences first
 *   - PDF export includes branding, settings metadata, and stage table
 *
 * Fixes applied (May 2026):
 *   1. Clear start/end date filters when X-axis column changes
 *   2. Raw Data tab shows scrollable table of original CSV data
 *   3. PNG export includes tab-specific stats as chart annotations
 *   4. Chart title no longer reverts on tab switch if user has edited it
 *   5. CUSUM guide hidden on Run Chart tab
 *   6. Summary bar correct per tab
 *   7. Export PNG/PDF show tab-specific stats
 *   8. Stage Summary + Raw Data: PNG disabled with visible message; PDF only
 *   9. Step Change tab header shows Loops and Turn Length parameters
 */

const pythonWorker    = new Worker('worker.js');
const csvInput        = document.getElementById('csvInput');
const dropZone        = document.getElementById('dropZone');
const statusText      = document.getElementById('statusText');
const chartContainer  = document.getElementById('chart-container');
const tableView       = document.getElementById('table-view');
const stageSummaryTable = document.getElementById('stageSummaryTable');
const controlsDiv     = document.getElementById('controls');
const tabContainer    = document.getElementById('tab-container');
const recalcBtn       = document.getElementById('recalcBtn');
const exportPngBtn    = document.getElementById('exportPngBtn');
const exportPdfBtn    = document.getElementById('exportPdfBtn');
const showSDCheckbox  = document.getElementById('showSDCheckbox');
const chartTitleInput = document.getElementById('chartTitleInput');
const chartFileInfo   = document.getElementById('chartFileInfo');
const errorBanner     = document.getElementById('error-banner');
const errorMessage    = document.getElementById('error-message');

// Summary bar elements
const summaryBar     = document.getElementById('summary-bar');
const xmrSummaryBar  = document.getElementById('xmr-summary-bar');
const stageCountText = document.getElementById('stageCountText');
const statN          = document.getElementById('statN');
const statMean       = document.getElementById('statMean');
const statSD         = document.getElementById('statSD');

// X-mR specific summary elements
const xmrUnpl = document.getElementById('xmrUnpl');
const xmrLnpl = document.getElementById('xmrLnpl');
const xmrUrl  = document.getElementById('xmrUrl');
const xmrN    = document.getElementById('xmrN');
const xmrMean = document.getElementById('xmrMean');
const xmrSd   = document.getElementById('xmrSd');

let pendingAnalysisRequest = null;
let cachedCsvData    = null;
let currentChartData = null;
let currentView      = 'step';
let activeFilename   = "Data";
let analysisDateTime = "";
let userHasEditedTitle = false;

// Export notice banner — shown below buttons on Stage Summary and Raw Data tabs
let exportNoticeBanner = null;
function showExportNotice(msg) {
    if (!exportNoticeBanner) {
        exportNoticeBanner = document.createElement('div');
        exportNoticeBanner.id = 'export-notice-banner';
        exportNoticeBanner.style.cssText = 'display:none;background:#e8f4fd;border:1px solid #0056b3;border-radius:6px;padding:10px 16px;margin-top:8px;font-size:0.9em;color:#002d5b;';
        // Insert after the export buttons row
        if (exportPdfBtn && exportPdfBtn.parentNode) {
            exportPdfBtn.parentNode.insertBefore(exportNoticeBanner, exportPdfBtn.nextSibling);
        }
    }
    exportNoticeBanner.innerHTML = `ℹ️ ${msg}`;
    exportNoticeBanner.style.display = 'block';
}
function hideExportNotice() {
    if (exportNoticeBanner) exportNoticeBanner.style.display = 'none';
}

// Prevent browser intercepting drag-and-drop globally
window.addEventListener("dragover", e => e.preventDefault(), false);
window.addEventListener("drop",     e => e.preventDefault(), false);

// ─────────────────────────────────────────────
// SETTINGS MEMORY (localStorage, per filename)
// ─────────────────────────────────────────────

const SETTINGS_KEY_PREFIX = 'sca_settings_';

function saveSettings(filename) {
    const settings = {
        confLimit:  document.getElementById('paramConfLimit')?.value  || '99.7',
        bootNum:    document.getElementById('paramBootNum')?.value    || '1000',
        turnLength: document.getElementById('paramTurnLength')?.value || '5',
        dateFmt:    document.getElementById('dateFormatSelect')?.value || 'auto',
        xCol:       document.getElementById('xColSelect')?.value      || '',
        yCol:       document.getElementById('yColSelect')?.value      || '',
        startDate:  document.getElementById('startDate')?.value       || '',
        endDate:    document.getElementById('endDate')?.value         || ''
    };
    try {
        localStorage.setItem(SETTINGS_KEY_PREFIX + filename, JSON.stringify(settings));
    } catch(e) {}
}

function loadSettings(filename) {
    try {
        const saved = localStorage.getItem(SETTINGS_KEY_PREFIX + filename);
        if (saved) {
            const s = JSON.parse(saved);
            if (document.getElementById('paramConfLimit'))  document.getElementById('paramConfLimit').value  = s.confLimit  || '99.7';
            if (document.getElementById('paramBootNum'))    document.getElementById('paramBootNum').value    = s.bootNum    || '1000';
            if (document.getElementById('paramTurnLength')) document.getElementById('paramTurnLength').value = s.turnLength || '5';
            if (document.getElementById('dateFormatSelect')) document.getElementById('dateFormatSelect').value = s.dateFmt  || 'auto';
            if (document.getElementById('startDate') && s.startDate) document.getElementById('startDate').value = s.startDate;
            if (document.getElementById('endDate')   && s.endDate)   document.getElementById('endDate').value   = s.endDate;
            const xS = document.getElementById('xColSelect');
            const yS = document.getElementById('yColSelect');
            if (xS && s.xCol) {
                const xOpt = Array.from(xS.options).find(o => o.value === s.xCol);
                if (xOpt) xS.value = s.xCol;
            }
            if (yS && s.yCol) {
                const yOpt = Array.from(yS.options).find(o => o.value === s.yCol);
                if (yOpt) yS.value = s.yCol;
            }
            return true;
        }
    } catch(e) {}
    return false;
}

// ─────────────────────────────────────────────
// CONTROLS PRE-LOADING
// ─────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', function() {
    if (controlsDiv) controlsDiv.style.display = "flex";

    const xColSelect = document.getElementById('xColSelect');
    if (xColSelect) {
        xColSelect.addEventListener('change', function() {
            const startDate = document.getElementById('startDate');
            const endDate   = document.getElementById('endDate');
            if (startDate) startDate.value = '';
            if (endDate)   endDate.value   = '';
            runDataQualityCheck(); // re-check when X column changes
        });
    }

    const yColSelect = document.getElementById('yColSelect');
    if (yColSelect) {
        yColSelect.addEventListener('change', function() {
            runDataQualityCheck(); // re-check when Y column changes
        });
    }

    const dateFormatSelect = document.getElementById('dateFormatSelect');
    if (dateFormatSelect) {
        dateFormatSelect.addEventListener('change', function() {
            runDataQualityCheck(); // re-check when the date format changes
        });
    }
});

/**
 * DATA QUALITY PRE-FLIGHT CHECK
 * Runs after upload and whenever X or Y column selection changes.
 * Checks for:
 *   1. Blank values in Y column — these rows are left out of the analysis
 *   2. Zero values in Y column — check they are genuine; genuine zeros must stay in
 *   3. Date sequence gaps in X column — missing periods can make change timing uncertain
 * Does not block analysis. Shows a yellow warning banner with a link to the Data Validator.
 */
function runDataQualityCheck() {
    if (!cachedCsvData || cachedCsvData.length === 0) return;

    const xColSelect = document.getElementById('xColSelect');
    const yColSelect = document.getElementById('yColSelect');
    const xCol = xColSelect ? xColSelect.value : null;
    const yCol = yColSelect ? yColSelect.value : null;

    if (!xCol || !yCol) return;

    // Check Y column for blanks and zeros
    let blankCount = 0, zeroCount = 0;
    cachedCsvData.forEach(row => {
        const v = row[yCol] !== undefined ? row[yCol].toString().trim() : "";
        if (v === "") blankCount++;
        else if (!isNaN(parseFloat(v)) && parseFloat(v) === 0) zeroCount++;
    });

    // Check X column for date sequence gaps.
    // Dates are read exactly as the analysis reads them (same rules, same
    // date format setting), sorted, and compared with the typical interval.
    const dateFmtForCheck = usedSetting('dateFormatSelect', 'auto');
    const gapReport = findDateGaps(
        cachedCsvData.map(row => row[xCol] ? row[xCol].toString().trim() : ''),
        dateFmtForCheck
    );
    const missingPeriods = gapReport.missing;

    // Build warning message if any issues found
    const issues = blankCount + zeroCount + missingPeriods;
    if (issues > 0) {
        let msg = `⚠️ <b>Data quality warning</b> &mdash; `;
        const parts = [];
        if (blankCount > 0) parts.push(`<b>${blankCount} blank value${blankCount > 1 ? 's' : ''}</b> in value column (these rows are left out of the analysis; blanks are not treated as zero)`);
        if (zeroCount > 0) parts.push(`<b>${zeroCount} zero value${zeroCount > 1 ? 's' : ''}</b> in value column (check they are genuine measurements; keep genuine zeros)`);
        if (missingPeriods > 0) {
            const where = gapReport.gaps.slice(0, 3).map(g =>
                `${g.missing} between ${escapeHtml(g.from)} and ${escapeHtml(g.to)}`).join(', ');
            const more = gapReport.gaps.length > 3 ? `, and ${gapReport.gaps.length - 3} more gap${gapReport.gaps.length - 3 > 1 ? 's' : ''}` : '';
            parts.push(`<b>${missingPeriods} possible missing period${missingPeriods > 1 ? 's' : ''}</b> in date sequence (${where}${more}; gaps can make change timing uncertain)`);
        }
        msg += parts.join('; ') + '. ';
        msg += `<a href="scanner.html" target="_blank" style="color:#0056b3;font-weight:bold;">Run the Data Validator</a> to identify and fix these issues before analysing.`;
        showDataWarning(msg);
    } else {
        hideDataWarning();
    }
    if (cachedCsvData.length > 500) {
        showNotice(`This file has ${cachedCsvData.length} rows. Free Edition is optimised for up to 500 rows. Results may be slower.`);
    } else {
        hideNotice();
    }
}

/**
 * Simple date parser for the pre-flight check.
 * Handles the most common formats: ISO, UK/EU, US, year-month, year-only.
 */
// ── Dates for the upload check ──
// INTERIM (FMEA IN-27, IN-26): mirrors parseDate() in worker.js rule for
// rule, so the upload check reads dates exactly as the analysis does.
// Test 1.40 checks the two agree. To be replaced by the shared data
// module (action A1), which removes the duplication.
function parseDateForCheck(str, format = 'auto') {
    if (!str || str.trim() === '') return NaN;
    str = str.trim();
    if (/^\d{4}$/.test(str) && (format === 'yyyy' || format === 'auto'))
        return new Date(parseInt(str, 10), 0, 1).getTime();
    if (/^\d{4}-\d{2}$/.test(str) && (format === 'yyyy-mm' || format === 'auto')) {
        const p = str.split('-');
        return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, 1).getTime();
    }
    if (/^\d{1,2}[\/\-]\d{4}$/.test(str) && (format === 'mm/yyyy' || format === 'auto')) {
        const p = str.split(/[\/\-]/);
        return new Date(parseInt(p[1], 10), parseInt(p[0], 10) - 1, 1).getTime();
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
        const d = new Date(str);
        return isNaN(d) ? NaN : d.getTime();
    }
    const parts = str.split(/[\/\-\.\s]/);
    if (parts.length < 3) return NaN;
    let day, month, year;
    if (format === 'dd/mm/yyyy') {
        day = parseInt(parts[0], 10); month = parseInt(parts[1], 10) - 1; year = parseInt(parts[2], 10);
    } else if (format === 'mm/dd/yyyy') {
        month = parseInt(parts[0], 10) - 1; day = parseInt(parts[1], 10); year = parseInt(parts[2], 10);
    } else if (format === 'yyyy-mm-dd') {
        year = parseInt(parts[0], 10); month = parseInt(parts[1], 10) - 1; day = parseInt(parts[2], 10);
    } else {
        const p0 = parseInt(parts[0], 10), p1 = parseInt(parts[1], 10);
        if (p0 > 12)      { day = p0; month = p1 - 1; }   // unambiguously DD/MM
        else if (p1 > 12) { month = p0 - 1; day = p1; }   // unambiguously MM/DD
        else              { day = p0; month = p1 - 1; }   // ambiguous: DD/MM (UK)
        year = parseInt(parts[2], 10);
    }
    if (year < 100) year += year < 50 ? 2000 : 1900;
    const d = new Date(year, month, day);
    return isNaN(d.getTime()) ? NaN : d.getTime();
}

// Find gaps in the dates: sort them, take the typical (median) interval as the
// recording frequency, and report each larger gap with the dates either side
// and how many periods it skips.
function findDateGaps(dateStrings, format = 'auto') {
    const pts = dateStrings.map(s => ({ s, t: parseDateForCheck(s, format) }))
                           .filter(p => !isNaN(p.t))
                           .sort((a, b) => a.t - b.t);
    const steps = [];
    for (let i = 1; i < pts.length; i++)
        if (pts[i].t > pts[i - 1].t) steps.push({ d: pts[i].t - pts[i - 1].t, from: pts[i - 1].s, to: pts[i].s });
    if (steps.length < 2) return { missing: 0, gaps: [] };
    const sorted = steps.map(x => x.d).sort((a, b) => a - b);
    const typical = sorted[Math.floor(sorted.length / 2)];
    const gaps = [];
    for (const x of steps)
        if (x.d > typical * 1.4) gaps.push({ from: x.from, to: x.to, missing: Math.round(x.d / typical) - 1 });
    return { missing: gaps.reduce((a, g) => a + g.missing, 0), gaps };
}
function countMissingPeriods(dateStrings, format = 'auto') {
    return findDateGaps(dateStrings, format).missing;
}

// ── Worker message handler ──
pythonWorker.onmessage = function(event) {
    const message = event.data;

    if (message.status === "ready") {
        if (csvInput) csvInput.disabled = false;
        statusText.innerHTML = "📁 <b>Ready!</b> Click or drop a CSV file to begin.";

    } else if (message.status === "result") {
        hideError();
        statusText.innerText = "✅ Analysis Complete!";
        currentChartData = message.data;

        if (tabContainer) tabContainer.style.display = "block";
        if (exportPngBtn) exportPngBtn.style.display = "inline-block";
        if (exportPdfBtn) exportPdfBtn.style.display = "inline-block";

        buildStageTable(message.data);

        if (!userHasEditedTitle) {
            generateDynamicTitle();
        }

        drawPlotlyChart();
        document.dispatchEvent(new CustomEvent('analysis-completed', {detail: {data: message.data, request: pendingAnalysisRequest}}));

        if (recalcBtn) {
            recalcBtn.disabled = false;
            recalcBtn.innerText = "Recalculate Chart";
        }

    } else if (message.status === "error") {
        showError(message.data);
        if (recalcBtn) {
            recalcBtn.disabled = false;
            recalcBtn.innerText = "Recalculate Chart";
        }
    }
};

// ── Number display: same rule as roundDisplay() in worker.js ──
// Never fewer decimal places than the data typically has (display_decimals,
// returned with each analysis), never fewer than 2, at least 3 significant figures.
function formatDisplay(v, minDec) {
    if (!Number.isFinite(v)) return String(v);
    if (minDec === undefined)
        minDec = (typeof currentChartData !== 'undefined' && currentChartData && currentChartData.display_decimals) || 2;
    let dec = minDec;
    if (v !== 0) dec = Math.min(10, Math.max(minDec, 2 - Math.floor(Math.log10(Math.abs(v)))));
    return v.toFixed(dec);
}

// ── Settings shown with a result ──
// Results are labelled with the settings the analysis actually used (returned
// by the worker), not whatever the boxes say now: a setting changed after the
// run must not relabel an existing result (FMEA OUT-04).
const SETTING_KEYS = { paramConfLimit: 'conf_limit', paramBootNum: 'boot_num', paramTurnLength: 'turn_length',
                       dateFormatSelect: 'date_format', startDate: 'start_date', endDate: 'end_date' };
function usedSetting(boxId, fallback) {
    const s = currentChartData && currentChartData.settings;
    if (s && SETTING_KEYS[boxId] in s) {
        const v = s[SETTING_KEYS[boxId]];
        return v === '' || v === null || v === undefined ? fallback : v;
    }
    return document.getElementById(boxId)?.value || fallback;
}
function reproLine() {
    if (!currentChartData || currentChartData.seed === undefined) return '';
    return `Seed: ${currentChartData.seed}  |  Data: ${currentChartData.data_fingerprint}  |  ${currentChartData.analyser_version}`;
}

// ── Lower natural process limit ──
// When every value is zero or more and the calculated LNPL is below zero,
// there is no lower limit (FMEA OUT-07).
const NO_LNPL_NOTE = 'None: the calculated limit is below zero, and all values are zero or more';
function lnplApplies(d) { return !d || d.xmr_lnpl_applies !== false; }
function lnplText(d)    { return lnplApplies(d) ? String(d.xmr_lnpl) : 'none (would be below zero)'; }

// ── Chart hover labels at the same precision as the results (FMEA OUT-06) ──
function hoverFormatFor(values, minDec) {
    const nz = (values || []).filter(v => Number.isFinite(v) && v !== 0).map(Math.abs).sort((x, y) => x - y);
    let dec = minDec || 2;
    if (nz.length) dec = Math.min(10, Math.max(dec, 2 - Math.floor(Math.log10(nz[Math.floor(nz.length / 2)]))));
    return ',.' + dec + 'f';
}

// ── Escape text taken from the user's file before inserting it as HTML ──
function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

// ── Error banner helpers ──
function showError(msg) {
    statusText.innerText = "❌ Error — see details above.";
    if (errorBanner) errorBanner.style.display = "block";
    if (errorMessage) {
        let hint = '';
        if (msg && msg.toLowerCase().includes('too small after cleaning')) {
            hint = ' 💡 <b>Tip:</b> Check that you have selected the correct <b>Y-Axis (Value)</b> column — choosing a text or date column instead of a numeric one will cause this error.';
        }
        errorMessage.innerHTML = escapeHtml(msg) + hint;
    }
}
function hideError() {
    if (errorBanner) errorBanner.style.display = "none";
}

// ── Warning banner helpers ──
let warningBanner = null;
// Data quality warnings and edition notices are kept in separate banners
// (FMEA IN-28). A data warning stays visible, through Recalculate, until the
// file, a column or the date format changes and the check runs again; its
// text is also included in PDF exports. Edition notices are shown separately.
let noticeBanner = null;
let currentDataWarningText = '';
function makeBanner(id, css) {
    const b = document.createElement('div');
    b.id = id;
    b.style.cssText = 'display:none;border-radius:6px;padding:12px 16px;margin-bottom:15px;font-size:0.9em;' + css;
    const eb = document.getElementById('error-banner');
    if (eb && eb.parentNode) eb.parentNode.insertBefore(b, eb.nextSibling);
    return b;
}
function showDataWarning(msg) {
    if (!warningBanner) warningBanner = makeBanner('warning-banner', 'background:#fff3cd;border:1px solid #ffc107;color:#664d03;');
    warningBanner.innerHTML = msg;
    warningBanner.style.display = 'block';
    currentDataWarningText = warningBanner.textContent.replace(/\s+/g, ' ').trim();
}
function hideDataWarning() {
    if (warningBanner) warningBanner.style.display = 'none';
    currentDataWarningText = '';
}
function showNotice(msg) {
    if (!noticeBanner) noticeBanner = makeBanner('notice-banner', 'background:#eef4fa;border:1px solid #9fbcd9;color:#183251;');
    noticeBanner.innerHTML = `ℹ️ <b>Free Edition Notice:</b> ${msg}`;
    noticeBanner.style.display = 'block';
}
function hideNotice() {
    if (noticeBanner) noticeBanner.style.display = 'none';
}

// ── Export button state — update per tab ──
function updateExportButtons() {
    if (!exportPngBtn || !exportPdfBtn) return;
    const tableOnlyView = (currentView === 'stages' || currentView === 'raw');
    if (tableOnlyView) {
        exportPngBtn.disabled = true;
        exportPngBtn.style.opacity = '0.45';
        exportPngBtn.style.cursor = 'not-allowed';
        exportPngBtn.title = 'PNG export is not available for this tab — use Export PDF instead';
        exportPdfBtn.disabled = false;
        exportPdfBtn.style.opacity = '1';
        exportPdfBtn.style.cursor = 'pointer';
        exportPdfBtn.title = '';
        const tabLabel = currentView === 'stages' ? 'Stage Summary' : 'Raw Data';
        showExportNotice(`<b>${tabLabel}</b> tab — PNG export is not available. Use <b>Export PDF</b> to save this table.`);
    } else {
        exportPngBtn.disabled = false;
        exportPngBtn.style.opacity = '1';
        exportPngBtn.style.cursor = 'pointer';
        exportPngBtn.title = '';
        exportPdfBtn.disabled = false;
        exportPdfBtn.style.opacity = '1';
        exportPdfBtn.style.cursor = 'pointer';
        exportPdfBtn.title = '';
        hideExportNotice();
    }
}

let currentChartTitle = '';

// ── Dynamic chart title ──
function generateDynamicTitle() {
    const now = new Date();
    const day   = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year  = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const mins  = String(now.getMinutes()).padStart(2, '0');
    analysisDateTime = `${day}/${month}/${year} ${hours}:${mins}`;

    const viewNames = {
        'step':   'Step Change Analysis',
        'stages': 'Stage Summary',
        'xmr':    'X-mR Control Chart',
        'run':    'Run Chart',
        'cusum':  'CUSUM Chart',
        'raw':    'Raw Data'
    };
    const viewName    = viewNames[currentView] || 'Analysis';
    const yCol        = document.getElementById('yColSelect')?.value || '';
    const titleString = `${activeFilename} - ${viewName} - ${analysisDateTime}`;
    const fullTitle   = yCol ? `${escapeHtml(titleString)}<br><span style="font-size:0.75em;color:#666;">Y: ${escapeHtml(yCol)}</span>` : escapeHtml(titleString);

    if (chartTitleInput) chartTitleInput.value = titleString;
    if (chartFileInfo)   chartFileInfo.innerText = `File: ${activeFilename}   |   Y: ${yCol}   |   Generated: ${analysisDateTime}`;
    currentChartTitle = fullTitle;
    return fullTitle;
}

// ── Build tab-specific stats line for PNG export annotation ──
function buildExportStatsLine() {
    if (!currentChartData) return '';
    const confVal = usedSetting('paramConfLimit', '—');
    if (currentView === 'step' || currentView === 'stages') {
        return `N = ${currentChartData.global_count}  |  Mean = ${currentChartData.global_mean}  |  SD = ${currentChartData.global_sd}  |  Stages = ${currentChartData.step_count}  |  Conf = ${confVal}%`;
    } else if (currentView === 'cusum') {
        return `N = ${currentChartData.global_count}  |  Mean = ${currentChartData.global_mean}  |  SD = ${currentChartData.global_sd}`;
    } else if (currentView === 'run') {
        const med = currentChartData.run_median !== undefined ? formatDisplay(currentChartData.run_median) : '—';
        return `N = ${currentChartData.global_count}  |  Mean = ${currentChartData.global_mean}  |  SD = ${currentChartData.global_sd}  |  Median = ${med}`;
    } else if (currentView === 'xmr') {
        return `N = ${currentChartData.global_count}  |  Mean = ${currentChartData.global_mean}  |  SD = ${currentChartData.global_sd}  |  UNPL = ${currentChartData.xmr_unpl}  |  LNPL = ${lnplText(currentChartData)}  |  URL = ${currentChartData.mr_url}`;
    } else {
        return `N = ${currentChartData.global_count}  |  Mean = ${currentChartData.global_mean}  |  SD = ${currentChartData.global_sd}`;
    }
}

// ── Build tab-specific meta row HTML for PDF ──
function buildExportMetaHTML() {
    if (!currentChartData) return '';
    const yCol    = document.getElementById('yColSelect')?.value || '';
    const confVal = usedSetting('paramConfLimit', '—');
    let html = `<span>N = <b>${currentChartData.global_count}</b></span>
                <span>Mean = <b>${currentChartData.global_mean}</b></span>
                <span>SD = <b>${currentChartData.global_sd}</b></span>`;
    if (currentView === 'step' || currentView === 'stages') {
        html += `<span>Stages = <b>${currentChartData.step_count}</b></span>
                 <span>Conf = <b>${confVal}%</b></span>`;
    } else if (currentView === 'run') {
        const med = currentChartData.run_median !== undefined ? formatDisplay(currentChartData.run_median) : '—';
        html += `<span>Median = <b>${med}</b></span>`;
    } else if (currentView === 'xmr') {
        html += `<span>UNPL = <b>${currentChartData.xmr_unpl}</b></span>
                 <span>LNPL = <b>${lnplText(currentChartData)}</b></span>
                 <span>URL = <b>${currentChartData.mr_url}</b></span>`;
    }
    html += `<span>Y-Axis: <b>${escapeHtml(yCol || activeFilename)}</b></span>
             <span>File: <b>${escapeHtml(activeFilename)}</b></span>`;
    return html;
}

// ── File upload — drag and drop or click ──
if (dropZone) {
    dropZone.onclick = () => csvInput.click();
    dropZone.addEventListener('dragover', () => dropZone.classList.add('dragover'));
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) handleFileUpload(e.dataTransfer.files[0]);
    });
}
if (csvInput) csvInput.onchange = (e) => {
    if (e.target.files.length) handleFileUpload(e.target.files[0]);
};

function handleFileUpload(file) {
    document.dispatchEvent(new Event('analysis-invalidated'));
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'csv') {
        showError(
            'Only CSV files are supported. "' + file.name + '" appears to be a ' + ext.toUpperCase() + ' file. ' +
            'To convert: in Excel go to File → Save As → CSV (Comma delimited) (.csv). ' +
            'If your Excel file has multiple sheets, save each sheet separately as its own CSV file.'
        );
        return;
    }

    activeFilename = file.name.replace(/\.[^/.]+$/, "");
    userHasEditedTitle = false;
    hideError();

    Papa.parse(file, {
        header: true, skipEmptyLines: true,
        complete: function(results) {
            cachedCsvData = results.data;
            const headers = results.meta.fields;
            const xS = document.getElementById('xColSelect');
            const yS = document.getElementById('yColSelect');
            if (xS && yS) {
                xS.innerHTML = ''; yS.innerHTML = '';
                headers.forEach(h => {
                    xS.appendChild(new Option(h, h));
                    yS.appendChild(new Option(h, h));
                });
                if (headers.length >= 2) yS.selectedIndex = 1;
            }
            const restored = loadSettings(activeFilename);
            statusText.innerHTML = `📊 <b>${escapeHtml(activeFilename)}</b> loaded.` +
                (restored ? ' <span style="color:#198754">✓ Previous settings restored.</span>' : ' Configure settings and click Recalculate.');

            // Run data quality pre-flight check on the selected columns
            runDataQualityCheck();
        }
    });
}

// ── Run analysis ──
function runPythonAnalysis() {
    if (!cachedCsvData) return;
    hideError();
    statusText.innerText = "⚙️ Calculating...";
    if (recalcBtn) {
        recalcBtn.disabled = true;
        recalcBtn.innerText = "Calculating...";
    }

    const turnLen = document.getElementById('paramTurnLength')?.value  || 5;
    let   bootNum = parseInt(document.getElementById('paramBootNum')?.value || 1000);
    const confLim = document.getElementById('paramConfLimit')?.value   || 95;

    if (bootNum > 1000) {
        showNotice(`Bootstrap loops set to ${bootNum}. Free Edition is optimised for up to 1,000 loops. Higher values may be slow. Pro Edition will support up to 10,000.`);
    } else {
        hideNotice();
    }

    const xCol      = document.getElementById('xColSelect')?.value;
    const yCol      = document.getElementById('yColSelect')?.value;
    const dateFmt   = document.getElementById('dateFormatSelect')?.value || "auto";
    const startDate = document.getElementById('startDate')?.value        || "";
    const endDate   = document.getElementById('endDate')?.value          || "";

    saveSettings(activeFilename);

    pendingAnalysisRequest = {
        command: "process_csv",
        data: cachedCsvData,
        params: {
            turn_length: parseInt(turnLen),
            boot_num:    parseInt(bootNum),
            conf_limit:  parseFloat(confLim),
            x_col:       xCol,
            y_col:       yCol,
            date_format: dateFmt,
            start_date:  startDate,
            end_date:    endDate,
            // Optional: a seed from an earlier result reproduces it exactly;
            // blank means a new seed, which the result reports.
            seed:        (document.getElementById('paramSeed')?.value || '').trim() || undefined
        }
    };
    document.dispatchEvent(new Event('analysis-started'));
    pythonWorker.postMessage(pendingAnalysisRequest);
}

// ── Build Stage Summary table ──
function buildStageTable(data) {
    if (!stageSummaryTable) return;
    let html = `<thead><tr>
        <th>Stage</th><th>From</th><th>To</th>
        <th style="text-align:right;">Mean</th>
        <th style="text-align:right;">SD</th>
        
        <th style="text-align:right;">Change %</th>
    </tr></thead><tbody>`;

    let count = 1;
    for (let i = 0; i < data.stage_means.length; i += 2) {
        const mean  = data.stage_means[i];
        const start = data.stage_dates[i].split(' ')[0];
        const end   = data.stage_dates[i + 1].split(' ')[0];
        const confText  = data.confleveltext[i] || "";
        // Use the stage SD already supplied by the worker, not the global SD.
        const sdMatch = confText.match(/\bSD:\s*([^<]+)/);
        const sdValue = sdMatch ? Number(sdMatch[1]) : NaN;
        const stageSD = Number.isFinite(sdValue) ? formatDisplay(sdValue) : "—";
        const confMatch = confText.match(/Conf: ([\d.]+)%/);
        const confVal   = confMatch ? confMatch[1] + "%" : (i === 0 ? "Baseline" : "---");
        let change = "Baseline";
        if (i > 0) {
            const prev = data.stage_means[i - 2];
            change = (((mean - prev) / prev) * 100).toFixed(1) + "%";
        }
        html += `<tr>
            <td>${count++}</td>
            <td>${start}</td><td>${end}</td>
            <td style="text-align:right;">${formatDisplay(mean)}</td>
            <td style="text-align:right;">${stageSD}</td>
            <td style="text-align:right;"><b>${change}</b></td>
        </tr>`;
    }
    stageSummaryTable.innerHTML = html + "</tbody>";
}

// Build Raw Data tab table from original CSV rows
function buildRawDataTable() {
    if (!cachedCsvData || cachedCsvData.length === 0) return '<p style="color:#666;">No data loaded.</p>';
    const headers = Object.keys(cachedCsvData[0]);
    let html = '<table style="width:100%;border-collapse:collapse;font-size:0.9em;">';
    html += '<thead><tr>' + headers.map(h =>
        `<th style="background:#f0f4f8;padding:10px;border-bottom:2px solid #0056b3;text-align:left;">${escapeHtml(h)}</th>`
    ).join('') + '</tr></thead><tbody>';
    cachedCsvData.forEach((row, i) => {
        const bg = i % 2 === 0 ? 'white' : '#f8f9fa';
        html += `<tr style="background:${bg}">` + headers.map(h =>
            `<td style="padding:8px 10px;border-bottom:1px solid #eee;">${row[h] !== undefined ? escapeHtml(row[h]) : ''}</td>`
        ).join('') + '</tr>';
    });
    html += '</tbody></table>';
    return html;
}

// ── Tab switching ──
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = function() {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        currentView = this.getAttribute('data-view');

        if (!userHasEditedTitle) {
            generateDynamicTitle();
        }

        updateSummaryBars();
        updateExportButtons();

        if (currentView === 'stages') {
            chartContainer.style.display = "none";
            if (tableView) {
                tableView.style.display = "block";
                const caption = tableView.querySelector('p');
                if (caption) { caption.innerText = 'Statistical Evidence Table'; caption.style.display = ''; }
                const stageTable = document.getElementById('stageSummaryTable');
                if (stageTable) stageTable.style.display = '';
                const existingRaw = tableView.querySelector('.raw-data-wrapper');
                if (existingRaw) existingRaw.remove();
                if (currentChartData) buildStageTable(currentChartData);
            }

        } else if (currentView === 'raw') {
            chartContainer.style.display = "none";
            if (tableView) {
                tableView.style.display = "block";
                const caption = tableView.querySelector('p');
                if (caption) caption.style.display = 'none';
                const stageTable = document.getElementById('stageSummaryTable');
                if (stageTable) stageTable.style.display = 'none';
                const prev = tableView.querySelector('.raw-data-wrapper');
                if (prev) prev.remove();
                const wrapper = document.createElement('div');
                wrapper.className = 'raw-data-wrapper';
                wrapper.innerHTML =
                    `<p style="color:#666; font-size:0.85em; margin-bottom:15px;">Raw Data — ${cachedCsvData ? cachedCsvData.length : 0} rows</p>` +
                    buildRawDataTable();
                tableView.appendChild(wrapper);
            }

        } else {
            chartContainer.style.display = "block";
            if (tableView) tableView.style.display = "none";
            drawPlotlyChart();
        }
    };
});

// ── Update summary bars ──
function updateSummaryBars() {
    if (!currentChartData) return;

    const cusumGuide = document.getElementById('cusum-guide');
    if (cusumGuide) {
        cusumGuide.style.display = (currentView === 'step' || currentView === 'cusum') ? 'block' : 'none';
    }

    if (currentView === 'xmr') {
        if (summaryBar)    summaryBar.style.display    = "none";
        if (xmrSummaryBar) xmrSummaryBar.style.display = "flex";
        if (xmrUnpl)  xmrUnpl.innerText  = currentChartData.xmr_unpl;
        if (xmrLnpl) {
            xmrLnpl.innerText = lnplText(currentChartData);
            xmrLnpl.title = lnplApplies(currentChartData) ? '' : NO_LNPL_NOTE;
        }
        if (xmrUrl)   xmrUrl.innerText   = currentChartData.mr_url;
        if (xmrN)     xmrN.innerText     = currentChartData.global_count;
        if (xmrMean)  xmrMean.innerText  = currentChartData.global_mean;
        if (xmrSd)    xmrSd.innerText    = currentChartData.global_sd;

    } else if (currentView === 'raw' || currentView === 'stages') {
        if (summaryBar)    summaryBar.style.display    = "none";
        if (xmrSummaryBar) xmrSummaryBar.style.display = "none";

    } else {
        if (summaryBar)    summaryBar.style.display    = "flex";
        if (xmrSummaryBar) xmrSummaryBar.style.display = "none";

        if (statN)    statN.innerText    = currentChartData.global_count;
        if (statMean) statMean.innerText = currentChartData.global_mean;
        if (statSD)   statSD.innerText   = currentChartData.global_sd;

        if (currentView === 'step') {
            if (stageCountText) {
                const confVal  = usedSetting('paramConfLimit',  '??');
                const bootVal  = usedSetting('paramBootNum',    '??');
                const turnVal  = usedSetting('paramTurnLength', '??');
                stageCountText.innerHTML =
                    `Found <b>${currentChartData.step_count}</b> distinct stages` +
                    ` &nbsp;|&nbsp; CUSUM (${confVal}% setting)` +
                    ` &nbsp;|&nbsp; Loops = ${bootVal}` +
                    ` &nbsp;|&nbsp; Turn Length = ${turnVal}` +
                    (currentChartData.seed !== undefined ? ` &nbsp;|&nbsp; Seed = ${currentChartData.seed}` : '');
            }
        } else if (currentView === 'run') {
            if (stageCountText) stageCountText.innerHTML =
                `Median = <b>${currentChartData.run_median !== undefined ? formatDisplay(currentChartData.run_median) : '—'}</b> &nbsp;|&nbsp; Run Chart (6+ consecutive points above/below median flagged)`;
        } else if (currentView === 'cusum') {
            if (stageCountText) stageCountText.innerHTML = '';
        }
    }
}

// ── Button wiring ──
if (recalcBtn)      recalcBtn.onclick       = runPythonAnalysis;
if (showSDCheckbox) showSDCheckbox.onchange = () => { if (currentChartData) drawPlotlyChart(); };

if (chartTitleInput) {
    chartTitleInput.oninput = () => {
        userHasEditedTitle = true;
        currentChartTitle = chartTitleInput.value;
        if (currentChartData) drawPlotlyChart();
    };
}

// ── Export PNG ──
if (exportPngBtn) exportPngBtn.onclick = function() {
    if (!currentChartData) return;
    if (currentView === 'stages' || currentView === 'raw') {
        alert('PNG export is not available for this tab. Please use Export PDF to save this table.');
        return;
    }

    const title      = chartTitleInput ? chartTitleInput.value : activeFilename;
    const yCol       = document.getElementById('yColSelect')?.value || '';
    const bootVal    = usedSetting('paramBootNum',    '—');
    const turnVal    = usedSetting('paramTurnLength', '—');
    const fmtVal     = usedSetting('dateFormatSelect', '—');
    const startVal   = usedSetting('startDate',       'All');
    const endVal     = usedSetting('endDate',         'All');
    const statsLine    = buildExportStatsLine();
    const settingsLine = `Loops: ${bootVal}  |  Turn Length: ${turnVal}  |  Date Format: ${fmtVal}  |  Range: ${startVal || 'All'} – ${endVal || 'All'}` +
                         (reproLine() ? `  |  ${reproLine()}` : '');
    const brandLine    = `📊 stepchangeanalysis.com — Bootstrap CUSUM SPC Tool — Free Edition`;

    const exportTitle =
        `<b>${title}</b>` +
        (yCol ? `<br><span style="font-size:14px;color:#555;">Y-Axis: ${yCol}</span>` : '') +
        `<br><span style="font-size:16px;color:#002d5b;">${statsLine}</span>` +
        `<br><span style="font-size:15px;color:#666;">${settingsLine}</span>` +
        `<br><span style="font-size:15px;color:#0056b3;font-weight:bold;">${brandLine}</span>`;

    Plotly.relayout(chartContainer, {
        title: { text: exportTitle, font: { size: 16 }, x: 0, xanchor: 'left' },
        margin: { t: 150 }
    }).then(function() {
        return Plotly.downloadImage(chartContainer, {
            format:   'png',
            width:    1400,
            height:   800,
            filename: (title + (yCol ? ' - ' + yCol : '')).replace(/[^a-z0-9]/gi, '_')
        });
    }).then(function() {
        Plotly.relayout(chartContainer, {
            title: { text: title, font: { size: 16 }, x: 0.5, xanchor: 'center' },
            margin: { t: 40 }
        });
    });
};

// ── Export PDF ──
if (exportPdfBtn) exportPdfBtn.onclick = function() {
    const title     = chartTitleInput ? chartTitleInput.value : activeFilename;
    const yCol      = document.getElementById('yColSelect')?.value || '';
    const confVal   = usedSetting('paramConfLimit',  '—');
    const bootVal   = usedSetting('paramBootNum',    '—');
    const turnVal   = usedSetting('paramTurnLength', '—');
    const fmtVal    = usedSetting('dateFormatSelect', '—');
    const startVal  = usedSetting('startDate',       'All');
    const endVal    = usedSetting('endDate',         'All');
    const fullTitle = title + (yCol ? ` — ${yCol}` : '');

    const pdfHeader = `<!DOCTYPE html><html><head>
        <title>${escapeHtml(fullTitle)}</title>
        <style>
            body { font-family: system-ui, sans-serif; margin: 30px; color: #1e293b; font-size: 13pt; }
            .brand-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #002d5b; padding-bottom: 10px; margin-bottom: 18px; }
            .brand-name { font-size: 1.3em; font-weight: bold; color: #002d5b; }
            .brand-url  { font-size: 1em; color: #0056b3; }
            .brand-tag  { font-size: 0.95em; color: #666; text-align: right; }
            h2   { color: #002d5b; font-size: 1.2em; margin: 0 0 6px 0; }
            .meta-row { display: flex; flex-wrap: wrap; gap: 16px; font-size: 1em; color: #555; margin-bottom: 8px; }
            .meta-row b { color: #002d5b; }
            .settings-bar { background: #f0f4f8; border: 1px solid #cce5ff; border-radius: 6px; padding: 10px 16px; font-size: 0.95em; color: #444; display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 16px; }
            .settings-bar span b { color: #002d5b; }
            img { width: 100%; border: 1px solid #eee; margin-bottom: 20px; }
            .stage-table { width: 100%; border-collapse: collapse; font-size: 1em; margin-top: 10px; }
            .stage-table th { background: #f0f4f8; padding: 10px; border-bottom: 2px solid #0056b3; text-align: left; }
            .stage-table td { padding: 9px 10px; border-bottom: 1px solid #eee; }
            .stage-table caption { font-weight: bold; color: #002d5b; text-align: left; margin-bottom: 8px; font-size: 1.1em; }
            .pdf-footer { margin-top: 24px; font-size: 0.88em; color: #999; border-top: 1px solid #eee; padding-top: 8px; }
            @media print { body { margin: 15px; } }
        </style>
        </head><body>
        <div class="brand-header">
            <div>
                <div class="brand-name">&#128202; StepChangeAnalysis.com</div>
                <div class="brand-url">stepchangeanalysis.com &nbsp;|&nbsp; Bootstrap CUSUM Step-Change Analysis</div>
            </div>
            <div class="brand-tag">Generated: ${analysisDateTime}<br>Privacy: no data uploaded &#128274;</div>
        </div>
        <h2>${escapeHtml(fullTitle)}</h2>
        <div class="meta-row">${buildExportMetaHTML()}</div>
        <div class="settings-bar">
            <span>Confidence setting: <b>${confVal}%</b></span>
            <span>Bootstrap loops: <b>${bootVal}</b></span>
            <span>Turn length: <b>${turnVal}</b></span>
            <span>Date format: <b>${fmtVal}</b></span>
            <span>Date range: <b>${startVal || 'All'}</b> to <b>${endVal || 'All'}</b></span>
        </div>${currentChartData && currentChartData.seed !== undefined ? `
        <div class="settings-bar">
            <span>Seed: <b>${currentChartData.seed}</b></span>
            <span>Data fingerprint: <b>${currentChartData.data_fingerprint}</b></span>
            <span>Analyser: <b>${currentChartData.analyser_version}</b></span>
            <span>Enter the seed with the same file and settings to reproduce this result exactly.</span>
        </div>` : ''}${currentDataWarningText ? `
        <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:8px 12px;margin:8px 0;font-size:0.85em;color:#664d03;">${escapeHtml(currentDataWarningText)}</div>` : ''}`;

    const pdfFooter = `<div class="pdf-footer">
            <b style="color:#002d5b;">📊 StepChangeAnalysis.com — Free Edition</b> &nbsp;|&nbsp; <a href="https://stepchangeanalysis.com" style="color:#0056b3;">stepchangeanalysis.com</a> &nbsp;|&nbsp; Analysis performed entirely in browser — no data uploaded<br>
            <span style="color:#555;font-size:0.85em;">Intended use: supporting process improvement and retrospective analysis of business, operational and service-level data. Not a medical device; not for diagnosis, treatment or decisions about individual patients.</span><br>
            <span style="color:#aaa;font-size:0.85em;">Bootstrap CUSUM method: Taylor (2000), building on Page (1954), Hinkley (1971), Efron &amp; Tibshirani (1993)</span>
        </div>
        <script>window.onload = function() { window.print(); }<\/script>
        </body></html>`;

    // Stage Summary or Raw Data: table only, no chart image
    if (currentView === 'stages' || currentView === 'raw') {
        const win = window.open('', '_blank');
        const tableContent = currentView === 'stages'
            ? buildStageTableHTML()
            : `<p style="color:#666;font-size:0.9em;margin-bottom:12px;">Raw Data — ${cachedCsvData ? cachedCsvData.length : 0} rows </p>` + buildRawDataTableHTML(null);
        win.document.write(pdfHeader + tableContent + pdfFooter);
        win.document.close();
        return;
    }

    // All chart tabs: chart image + optional stage table
    Plotly.toImage(document.getElementById('chart-container'), { format: 'png', width: 1200, height: 600 })
    .then(function(imgData) {
        const win = window.open('', '_blank');
        const stageTable = currentView === 'step' ? buildStageTableHTML() : '';
        win.document.write(pdfHeader + `<img src="${imgData}" alt="${escapeHtml(title)}" />` + stageTable + pdfFooter);
        win.document.close();
    });
};

// Build stage table as HTML string — used in PDF export
function buildStageTableHTML() {
    if (!currentChartData) return '';
    const data = currentChartData;
    let html = `<table class="stage-table">
        <caption>Candidate Stage Summary</caption>
        <thead><tr>
            <th>Stage</th><th>From</th><th>To</th>
            <th>Mean</th><th>SD</th><th>Change %</th>
        </tr></thead><tbody>`;
    let count = 1;
    for (let i = 0; i < data.stage_means.length; i += 2) {
        const mean  = data.stage_means[i];
        const start = data.stage_dates[i].split(' ')[0];
        const end   = data.stage_dates[i + 1].split(' ')[0];
        const confText  = data.confleveltext[i] || "";
        // Use the stage SD already supplied by the worker, not the global SD.
        const sdMatch = confText.match(/\bSD:\s*([^<]+)/);
        const sdValue = sdMatch ? Number(sdMatch[1]) : NaN;
        const stageSD = Number.isFinite(sdValue) ? formatDisplay(sdValue) : "—";
        const confMatch = confText.match(/Conf: ([\d.]+)%/);
        const confVal   = confMatch ? confMatch[1] + "%" : (i === 0 ? "Baseline" : "---");
        let change = "Baseline";
        if (i > 0) {
            const prev = data.stage_means[i - 2];
            change = (((mean - prev) / prev) * 100).toFixed(1) + "%";
        }
        html += `<tr>
            <td>${count++}</td><td>${start}</td><td>${end}</td>
            <td>${formatDisplay(mean)}</td><td>${stageSD}</td>
            <td><b>${change}</b></td>
        </tr>`;
    }
    return html + "</tbody></table>";
}

// Build raw data as HTML table for PDF (limited rows to keep PDF manageable)
function buildRawDataTableHTML(maxRows) {
    if (!cachedCsvData || cachedCsvData.length === 0) return '<p>No data.</p>';
    const headers = Object.keys(cachedCsvData[0]);
    const rows = maxRows ? cachedCsvData.slice(0, maxRows) : cachedCsvData;
    let html = `<table class="stage-table"><thead><tr>` +
        headers.map(h => `<th>${escapeHtml(h)}</th>`).join('') +
        `</tr></thead><tbody>`;
    rows.forEach((row, i) => {
        html += `<tr>` + headers.map(h => `<td>${row[h] !== undefined ? escapeHtml(row[h]) : ''}</td>`).join('') + `</tr>`;
    });
    return html + `</tbody></table>`;
}

// ── Main chart drawing function ──
function drawPlotlyChart() {
    if (!currentChartData) return;
    const data   = currentChartData;
    const showSD = showSDCheckbox?.checked;

    updateSummaryBars();

    const rawTrace = {
        x: data.dates, y: data.raw_values,
        mode: 'lines+markers', name: 'All Points',
        line: { color: '#d62728', width: 1 }, marker: { size: 4 }
    };
    const xTrace = { ...rawTrace, name: 'Individuals (X)' };
    const xMeanTrace = {
        x: [data.dates[0], data.dates[data.dates.length-1]],
        y: [data.global_mean, data.global_mean],
        mode: 'lines', name: 'Process Mean', line: { color: '#2ca02c', width: 2 }
    };
    const unplTrace = {
        x: [data.dates[0], data.dates[data.dates.length-1]],
        y: [data.xmr_unpl, data.xmr_unpl],
        mode: 'lines', name: 'UNPL (+2.66 mR)', line: { color: 'black', width: 1.5, dash: 'dash' }
    };
    const lnplTrace = {
        x: [data.dates[0], data.dates[data.dates.length-1]],
        y: [data.xmr_lnpl, data.xmr_lnpl],
        mode: 'lines', name: 'LNPL (-2.66 mR)', line: { color: 'black', width: 1.5, dash: 'dash' }
    };
    const mrTrace = {
        x: data.dates, y: data.mr_values,
        mode: 'lines+markers', name: 'Moving Range (mR)',
        yaxis: 'y2', line: { color: '#17becf', width: 1 }, marker: { size: 4 }
    };
    const mrMeanTrace = {
        x: [data.dates[0], data.dates[data.dates.length-1]],
        y: [data.mr_mean, data.mr_mean],
        mode: 'lines', name: 'Mean mR', yaxis: 'y2', line: { color: '#2ca02c', dash: 'dash' }
    };
    const mrUrlTrace = {
        x: [data.dates[0], data.dates[data.dates.length-1]],
        y: [data.mr_url, data.mr_url],
        mode: 'lines', name: 'URL (3.267 mR)', yaxis: 'y2', line: { color: 'black', dash: 'dash' }
    };
    const stepTrace = {
        x: data.stage_dates, y: data.stage_means,
        mode: 'lines+markers', name: 'Stage Mean',
        text: data.confleveltext, hoverinfo: 'text+x',
        line: { color: 'blue', width: 3 }, marker: { size: 6 }
    };
    const uclTrace = {
        x: data.stage_dates, y: data.stage_ucl,
        mode: 'lines', name: '+3 SD (UCL)',
        line: { color: 'rgba(0,0,255,0.2)', dash: 'dash' }, hoverinfo: 'skip'
    };
    const lclTrace = {
        x: data.stage_dates, y: data.stage_lcl,
        mode: 'lines', name: '-3 SD (LCL)',
        line: { color: 'rgba(0,0,255,0.2)', dash: 'dash' }, hoverinfo: 'skip'
    };
    const cusumOverlayTrace = {
        x: data.dates, y: data.cusum_values,
        mode: 'lines', name: 'Cusum', yaxis: 'y2', line: { color: 'green', width: 1 }
    };
    const medianTrace = {
        x: [data.dates[0], data.dates[data.dates.length-1]],
        y: [data.run_median, data.run_median],
        mode: 'lines', name: 'Median', line: { color: '#2ca02c', width: 2 }
    };
    const shiftAboveTrace = {
        x: data.shift_above_dates, y: data.shift_above_values,
        mode: 'markers', name: 'Shift (6+ Above)', marker: { color: 'red', size: 10 }
    };
    const shiftBelowTrace = {
        x: data.shift_below_dates, y: data.shift_below_values,
        mode: 'markers', name: 'Shift (6+ Below)', marker: { color: 'blue', size: 10 }
    };
    const isolatedCusumTrace = {
        x: data.dates, y: data.cusum_values,
        mode: 'lines', name: 'Cumulative Sum', line: { color: 'green', width: 2 }
    };
    const zeroBaselineTrace = {
        x: [data.dates[0], data.dates[data.dates.length-1]],
        y: [0, 0], mode: 'lines', name: 'Zero Baseline',
        line: { color: 'black', width: 1, dash: 'dash' }
    };

    let activeTraces = [];
    const layout = {
        title:    (userHasEditedTitle && chartTitleInput)
                    ? chartTitleInput.value
                    : (currentChartTitle || (chartTitleInput ? chartTitleInput.value : generateDynamicTitle())),
        xaxis:    { title: 'Date / Observation' },
        yaxis:    { title: 'Value' },
        hovermode: 'closest',
        legend:   { orientation: 'h', y: -0.2 }
    };

    if (currentView === 'step') {
        activeTraces = [rawTrace, cusumOverlayTrace, stepTrace];
        if (showSD) activeTraces.push(uclTrace, lclTrace);
        layout.yaxis2 = { overlaying: 'y', side: 'right', showgrid: false, title: 'Cusum' };

    } else if (currentView === 'xmr') {
        activeTraces = [xTrace, xMeanTrace, unplTrace, mrTrace, mrMeanTrace, mrUrlTrace];
        if (lnplApplies(data)) activeTraces.splice(3, 0, lnplTrace);
        layout.yaxis.domain = [0.35, 1];
        layout.yaxis.title  = 'Individual Value (X)';
        layout.yaxis2 = { domain: [0, 0.25], anchor: 'x', title: 'Moving Range (mR)' };

    } else if (currentView === 'run') {
        activeTraces = [rawTrace, medianTrace, shiftAboveTrace, shiftBelowTrace];

    } else if (currentView === 'cusum') {
        activeTraces = [isolatedCusumTrace, zeroBaselineTrace];
        layout.yaxis.title = 'Cumulative Sum of Deviations';

    } else if (currentView === 'raw') {
        activeTraces = [rawTrace];
    }

    // Hover labels show values at the results' precision, with thousands
    // separators, instead of Plotly's abbreviations such as 106.588k.
    const minDec = data.display_decimals || 2;
    layout.yaxis.hoverformat = hoverFormatFor(currentView === 'cusum' ? data.cusum_values : data.raw_values, minDec);
    if (layout.yaxis2) layout.yaxis2.hoverformat = hoverFormatFor(currentView === 'xmr' ? data.mr_values : data.cusum_values, minDec);

    Plotly.newPlot(chartContainer, activeTraces, layout);
}
