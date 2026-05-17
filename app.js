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
        });
    }
});

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

// ── Error banner helpers ──
function showError(msg) {
    statusText.innerText = "❌ Error — see details above.";
    if (errorBanner)  errorBanner.style.display = "block";
    if (errorMessage) errorMessage.innerText = msg;
}
function hideError() {
    if (errorBanner) errorBanner.style.display = "none";
}

// ── Warning banner helpers ──
let warningBanner = null;
function showWarning(msg) {
    if (!warningBanner) {
        warningBanner = document.createElement('div');
        warningBanner.id = 'warning-banner';
        warningBanner.style.cssText = 'display:none;background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:12px 16px;margin-bottom:15px;font-size:0.9em;color:#664d03;';
        const eb = document.getElementById('error-banner');
        if (eb && eb.parentNode) eb.parentNode.insertBefore(warningBanner, eb.nextSibling);
    }
    warningBanner.innerHTML = `⚠️ <b>Free Edition Notice:</b> ${msg}`;
    warningBanner.style.display = 'block';
}
function hideWarning() {
    if (warningBanner) warningBanner.style.display = 'none';
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
    const fullTitle   = yCol ? `${titleString}<br><span style="font-size:0.75em;color:#666;">Y: ${yCol}</span>` : titleString;

    if (chartTitleInput) chartTitleInput.value = titleString;
    if (chartFileInfo)   chartFileInfo.innerText = `File: ${activeFilename}   |   Y: ${yCol}   |   Generated: ${analysisDateTime}`;
    currentChartTitle = fullTitle;
    return fullTitle;
}

// ── Build tab-specific stats line for PNG export annotation ──
function buildExportStatsLine() {
    if (!currentChartData) return '';
    const confVal = document.getElementById('paramConfLimit')?.value || '—';
    if (currentView === 'step' || currentView === 'stages') {
        return `N = ${currentChartData.global_count}  |  Mean = ${currentChartData.global_mean}  |  SD = ${currentChartData.global_sd}  |  Stages = ${currentChartData.step_count}  |  Conf = ${confVal}%`;
    } else if (currentView === 'cusum') {
        return `N = ${currentChartData.global_count}  |  Mean = ${currentChartData.global_mean}  |  SD = ${currentChartData.global_sd}`;
    } else if (currentView === 'run') {
        const med = currentChartData.run_median !== undefined ? currentChartData.run_median.toFixed(2) : '—';
        return `N = ${currentChartData.global_count}  |  Mean = ${currentChartData.global_mean}  |  SD = ${currentChartData.global_sd}  |  Median = ${med}`;
    } else if (currentView === 'xmr') {
        return `N = ${currentChartData.global_count}  |  Mean = ${currentChartData.global_mean}  |  SD = ${currentChartData.global_sd}  |  UNPL = ${currentChartData.xmr_unpl}  |  LNPL = ${currentChartData.xmr_lnpl}  |  URL = ${currentChartData.mr_url}`;
    } else {
        return `N = ${currentChartData.global_count}  |  Mean = ${currentChartData.global_mean}  |  SD = ${currentChartData.global_sd}`;
    }
}

// ── Build tab-specific meta row HTML for PDF ──
function buildExportMetaHTML() {
    if (!currentChartData) return '';
    const yCol    = document.getElementById('yColSelect')?.value || '';
    const confVal = document.getElementById('paramConfLimit')?.value || '—';
    let html = `<span>N = <b>${currentChartData.global_count}</b></span>
                <span>Mean = <b>${currentChartData.global_mean}</b></span>
                <span>SD = <b>${currentChartData.global_sd}</b></span>`;
    if (currentView === 'step' || currentView === 'stages') {
        html += `<span>Stages = <b>${currentChartData.step_count}</b></span>
                 <span>Conf = <b>${confVal}%</b></span>`;
    } else if (currentView === 'run') {
        const med = currentChartData.run_median !== undefined ? currentChartData.run_median.toFixed(2) : '—';
        html += `<span>Median = <b>${med}</b></span>`;
    } else if (currentView === 'xmr') {
        html += `<span>UNPL = <b>${currentChartData.xmr_unpl}</b></span>
                 <span>LNPL = <b>${currentChartData.xmr_lnpl}</b></span>
                 <span>URL = <b>${currentChartData.mr_url}</b></span>`;
    }
    html += `<span>Y-Axis: <b>${yCol || activeFilename}</b></span>
             <span>File: <b>${activeFilename}</b></span>`;
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
                    xS.innerHTML += `<option value="${h}">${h}</option>`;
                    yS.innerHTML += `<option value="${h}">${h}</option>`;
                });
                if (headers.length >= 2) yS.selectedIndex = 1;
            }
            const restored = loadSettings(activeFilename);
            statusText.innerHTML = `📊 <b>${activeFilename}</b> loaded.` +
                (restored ? ' <span style="color:#198754">✓ Previous settings restored.</span>' : ' Configure settings and click Recalculate.');
            if (cachedCsvData.length > 500) {
                showWarning(`This file has ${cachedCsvData.length} rows. Free Edition is optimised for up to 500 rows. Results may be slower. Pro Edition will support unlimited rows.`);
            } else {
                hideWarning();
            }
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
        showWarning(`Bootstrap loops set to ${bootNum}. Free Edition is optimised for up to 1,000 loops. Higher values may be slow. Pro Edition will support up to 10,000.`);
    } else {
        hideWarning();
    }

    const xCol      = document.getElementById('xColSelect')?.value;
    const yCol      = document.getElementById('yColSelect')?.value;
    const dateFmt   = document.getElementById('dateFormatSelect')?.value || "auto";
    const startDate = document.getElementById('startDate')?.value        || "";
    const endDate   = document.getElementById('endDate')?.value          || "";

    saveSettings(activeFilename);

    pythonWorker.postMessage({
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
            end_date:    endDate
        }
    });
}

// ── Build Stage Summary table ──
function buildStageTable(data) {
    if (!stageSummaryTable) return;
    let html = `<thead><tr>
        <th>Stage</th><th>From</th><th>To</th>
        <th style="text-align:right;">Mean</th>
        <th style="text-align:right;">SD</th>
        <th style="text-align:right;">Conf %</th>
        <th style="text-align:right;">Change %</th>
    </tr></thead><tbody>`;

    let count = 1;
    for (let i = 0; i < data.stage_means.length; i += 2) {
        const mean  = data.stage_means[i];
        const start = data.stage_dates[i].split(' ')[0];
        const end   = data.stage_dates[i + 1].split(' ')[0];
        const confText  = data.confleveltext[i] || "";
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
            <td style="text-align:right;">${mean.toFixed(2)}</td>
            <td style="text-align:right;">${data.global_sd}</td>
            <td style="text-align:right;">${confVal}</td>
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
        `<th style="background:#f0f4f8;padding:10px;border-bottom:2px solid #0056b3;text-align:left;">${h}</th>`
    ).join('') + '</tr></thead><tbody>';
    cachedCsvData.forEach((row, i) => {
        const bg = i % 2 === 0 ? 'white' : '#f8f9fa';
        html += `<tr style="background:${bg}">` + headers.map(h =>
            `<td style="padding:8px 10px;border-bottom:1px solid #eee;">${row[h] !== undefined ? row[h] : ''}</td>`
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
        if (xmrLnpl)  xmrLnpl.innerText  = currentChartData.xmr_lnpl;
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
                const confVal = document.getElementById('paramConfLimit')?.value || "??";
                stageCountText.innerHTML = `Found <b>${currentChartData.step_count}</b> distinct stages &nbsp;|&nbsp; CUSUM (${confVal}% Confidence)`;
            }
        } else if (currentView === 'run') {
            if (stageCountText) stageCountText.innerHTML =
                `Median = <b>${currentChartData.run_median !== undefined ? currentChartData.run_median.toFixed(2) : '—'}</b> &nbsp;|&nbsp; Run Chart (6+ consecutive points above/below median flagged)`;
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
    const bootVal    = document.getElementById('paramBootNum')?.value    || '—';
    const turnVal    = document.getElementById('paramTurnLength')?.value || '—';
    const fmtVal     = document.getElementById('dateFormatSelect')?.value || '—';
    const startVal   = document.getElementById('startDate')?.value       || 'All';
    const endVal     = document.getElementById('endDate')?.value         || 'All';
    const statsLine    = buildExportStatsLine();
    const settingsLine = `Loops: ${bootVal}  |  Turn Length: ${turnVal}  |  Date Format: ${fmtVal}  |  Range: ${startVal || 'All'} – ${endVal || 'All'}`;
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
    const confVal   = document.getElementById('paramConfLimit')?.value  || '—';
    const bootVal   = document.getElementById('paramBootNum')?.value    || '—';
    const turnVal   = document.getElementById('paramTurnLength')?.value || '—';
    const fmtVal    = document.getElementById('dateFormatSelect')?.value || '—';
    const startVal  = document.getElementById('startDate')?.value       || 'All';
    const endVal    = document.getElementById('endDate')?.value         || 'All';
    const fullTitle = title + (yCol ? ` — ${yCol}` : '');

    const pdfHeader = `<!DOCTYPE html><html><head>
        <title>${fullTitle}</title>
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
        <h2>${fullTitle}</h2>
        <div class="meta-row">${buildExportMetaHTML()}</div>
        <div class="settings-bar">
            <span>Confidence: <b>${confVal}%</b></span>
            <span>Bootstrap loops: <b>${bootVal}</b></span>
            <span>Turn length: <b>${turnVal}</b></span>
            <span>Date format: <b>${fmtVal}</b></span>
            <span>Date range: <b>${startVal || 'All'}</b> to <b>${endVal || 'All'}</b></span>
        </div>`;

    const pdfFooter = `<div class="pdf-footer">
            <b style="color:#002d5b;">📊 StepChangeAnalysis.com — Free Edition</b> &nbsp;|&nbsp; <a href="https://stepchangeanalysis.com" style="color:#0056b3;">stepchangeanalysis.com</a> &nbsp;|&nbsp; Analysis performed entirely in browser — no data uploaded<br>
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
        win.document.write(pdfHeader + `<img src="${imgData}" alt="${title}" />` + stageTable + pdfFooter);
        win.document.close();
    });
};

// Build stage table as HTML string — used in PDF export
function buildStageTableHTML() {
    if (!currentChartData) return '';
    const data = currentChartData;
    let html = `<table class="stage-table">
        <caption>Statistical Evidence Table</caption>
        <thead><tr>
            <th>Stage</th><th>From</th><th>To</th>
            <th>Mean</th><th>SD</th><th>Conf %</th><th>Change %</th>
        </tr></thead><tbody>`;
    let count = 1;
    for (let i = 0; i < data.stage_means.length; i += 2) {
        const mean  = data.stage_means[i];
        const start = data.stage_dates[i].split(' ')[0];
        const end   = data.stage_dates[i + 1].split(' ')[0];
        const confText  = data.confleveltext[i] || "";
        const confMatch = confText.match(/Conf: ([\d.]+)%/);
        const confVal   = confMatch ? confMatch[1] + "%" : (i === 0 ? "Baseline" : "---");
        let change = "Baseline";
        if (i > 0) {
            const prev = data.stage_means[i - 2];
            change = (((mean - prev) / prev) * 100).toFixed(1) + "%";
        }
        html += `<tr>
            <td>${count++}</td><td>${start}</td><td>${end}</td>
            <td>${mean.toFixed(2)}</td><td>${data.global_sd}</td>
            <td>${confVal}</td><td><b>${change}</b></td>
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
        headers.map(h => `<th>${h}</th>`).join('') +
        `</tr></thead><tbody>`;
    rows.forEach((row, i) => {
        html += `<tr>` + headers.map(h => `<td>${row[h] !== undefined ? row[h] : ''}</td>`).join('') + `</tr>`;
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
        title:    currentChartTitle || (chartTitleInput ? chartTitleInput.value : generateDynamicTitle()),
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
        activeTraces = [xTrace, xMeanTrace, unplTrace, lnplTrace, mrTrace, mrMeanTrace, mrUrlTrace];
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

    Plotly.newPlot(chartContainer, activeTraces, layout);
}
