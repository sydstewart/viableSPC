/**
 * app.js — StepChangeAnalysis.com SPC Analyzer
 * Wires up all UI elements to the pure-JS worker engine.
 *
 * Features:
 *   - Per-file settings memory (localStorage) — remembers last settings per filename
 *   - Controls pre-loaded before file upload so user can set preferences first
 *   - PDF export includes branding, settings metadata, and stage table
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

// ── Prevent browser intercepting drag-and-drop globally ──
window.addEventListener("dragover", e => e.preventDefault(), false);
window.addEventListener("drop",     e => e.preventDefault(), false);

// ─────────────────────────────────────────────
// SETTINGS MEMORY (localStorage, per filename)
// Saves and restores: Conf %, Loops, Turn Length,
// Date Style, X column, Y column — keyed by filename.
// This means each CSV file remembers its own settings.
// ─────────────────────────────────────────────

const SETTINGS_KEY_PREFIX = 'sca_settings_'; // sca = StepChangeAnalysis

/**
 * saveSettings — called every time the user clicks Recalculate.
 * Stores current control values in localStorage under the filename key.
 */
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
    } catch(e) {
        // localStorage may be unavailable in some environments — fail silently
    }
}

/**
 * loadSettings — called after a CSV file is loaded and column dropdowns are populated.
 * Restores previously saved settings for this filename if they exist.
 * Falls back to sensible defaults if no saved settings are found.
 */
function loadSettings(filename) {
    try {
        const saved = localStorage.getItem(SETTINGS_KEY_PREFIX + filename);
        if (saved) {
            const s = JSON.parse(saved);
            // Restore numeric parameters
            if (document.getElementById('paramConfLimit'))  document.getElementById('paramConfLimit').value  = s.confLimit  || '99.7';
            if (document.getElementById('paramBootNum'))    document.getElementById('paramBootNum').value    = s.bootNum    || '1000';
            if (document.getElementById('paramTurnLength')) document.getElementById('paramTurnLength').value = s.turnLength || '5';
            if (document.getElementById('dateFormatSelect')) document.getElementById('dateFormatSelect').value = s.dateFmt  || 'auto';
            // Restore date filters
            if (document.getElementById('startDate') && s.startDate) document.getElementById('startDate').value = s.startDate;
            if (document.getElementById('endDate')   && s.endDate)   document.getElementById('endDate').value   = s.endDate;
            // Restore column selections only if they still exist in the current file
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
            return true; // settings were restored
        }
    } catch(e) {
        // localStorage unavailable or corrupted — fall through to defaults
    }
    return false; // no saved settings found
}

// ─────────────────────────────────────────────
// CONTROLS PRE-LOADING
// Show the settings panel immediately on page load
// so users can configure preferences before uploading a file.
// Column dropdowns are empty until a file is loaded —
// other settings (Conf %, Loops, etc.) are usable straight away.
// ─────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', function() {
    // Show controls panel immediately — don't wait for a file
    if (controlsDiv) controlsDiv.style.display = "flex";
});

// ── Worker is pure JS — ready immediately, no boot delay ──
pythonWorker.onmessage = function(event) {
    const message = event.data;

    if (message.status === "ready") {
        // Worker signals ready instantly — no Python boot delay
        if (csvInput) csvInput.disabled = false;
        statusText.innerHTML = "📁 <b>Ready!</b> Click or drop a CSV file to begin.";

    } else if (message.status === "result") {
        // Analysis complete — render charts and table
        hideError();
        statusText.innerText = "✅ Analysis Complete!";
        currentChartData = message.data;

        if (tabContainer) tabContainer.style.display = "block";
        if (exportPngBtn) exportPngBtn.style.display = "inline-block";
        if (exportPdfBtn) exportPdfBtn.style.display = "inline-block";

        buildStageTable(message.data);
        generateDynamicTitle();
        drawPlotlyChart();

        if (recalcBtn) {
            recalcBtn.disabled = false;
            recalcBtn.innerText = "Recalculate Chart";
        }

    } else if (message.status === "error") {
        // Show friendly error with link to Data Validator
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

// ── Dynamic chart title ──
// Auto-fills with: Filename - Chart Type - Date/Time (UK format DD/MM/YYYY HH:MM)
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
    const titleString = `${activeFilename} - ${viewName} - ${analysisDateTime}`;

    if (chartTitleInput) chartTitleInput.value = titleString;
    if (chartFileInfo)   chartFileInfo.innerText = `File: ${activeFilename}   |   Generated: ${analysisDateTime}`;
    return titleString;
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
    // Strip file extension for a clean chart title and settings key
    activeFilename = file.name.replace(/\.[^/.]+$/, "");
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
                // Default Y to second column (usually the value column)
                if (headers.length >= 2) yS.selectedIndex = 1;
            }

            // ── Restore saved settings for this file ──
            // loadSettings returns true if settings were found and restored.
            // If not, the defaults set above remain in place.
            const restored = loadSettings(activeFilename);
            statusText.innerHTML = `📊 <b>${activeFilename}</b> loaded.` +
                (restored ? ' <span style="color:#198754">✓ Previous settings restored.</span>' : ' Configure settings and click Recalculate.');
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

    const turnLen   = document.getElementById('paramTurnLength')?.value  || 5;
    const bootNum   = document.getElementById('paramBootNum')?.value     || 1000;
    const confLim   = document.getElementById('paramConfLimit')?.value   || 95;
    const xCol      = document.getElementById('xColSelect')?.value;
    const yCol      = document.getElementById('yColSelect')?.value;
    const dateFmt   = document.getElementById('dateFormatSelect')?.value || "auto";
    const startDate = document.getElementById('startDate')?.value        || "";
    const endDate   = document.getElementById('endDate')?.value          || "";

    // Save settings for this file before running —
    // so they're restored next time this file is loaded
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

// ── Tab switching ──
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = function() {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        currentView = this.getAttribute('data-view');
        generateDynamicTitle();
        updateSummaryBars();

        if (currentView === 'stages') {
            chartContainer.style.display = "none";
            if (tableView) tableView.style.display = "block";
        } else {
            chartContainer.style.display = "block";
            if (tableView) tableView.style.display = "none";
            drawPlotlyChart();
        }
    };
});

function updateSummaryBars() {
    if (!currentChartData) return;
    if (currentView === 'xmr') {
        if (summaryBar)    summaryBar.style.display    = "none";
        if (xmrSummaryBar) xmrSummaryBar.style.display = "flex";
        if (xmrUnpl)  xmrUnpl.innerText  = currentChartData.xmr_unpl;
        if (xmrLnpl)  xmrLnpl.innerText  = currentChartData.xmr_lnpl;
        if (xmrUrl)   xmrUrl.innerText   = currentChartData.mr_url;
        if (xmrN)     xmrN.innerText     = currentChartData.global_count;
        if (xmrMean)  xmrMean.innerText  = currentChartData.global_mean;
        if (xmrSd)    xmrSd.innerText    = currentChartData.global_sd;
    } else {
        if (summaryBar)    summaryBar.style.display    = "flex";
        if (xmrSummaryBar) xmrSummaryBar.style.display = "none";
    }
}

// ── Button wiring ──
if (recalcBtn)      recalcBtn.onclick      = runPythonAnalysis;
if (showSDCheckbox) showSDCheckbox.onchange = () => { if (currentChartData) drawPlotlyChart(); };

// ── Export PNG ──
// Uses Plotly's built-in downloadImage at high resolution
if (exportPngBtn) exportPngBtn.onclick = function() {
    const title = chartTitleInput ? chartTitleInput.value : activeFilename;
    Plotly.downloadImage(chartContainer, {
        format:   'png',
        width:    1400,
        height:   700,
        filename: title.replace(/[^a-z0-9]/gi, '_')
    });
};

// ── Export PDF ──
// Opens a print-ready page with:
//   - StepChangeAnalysis.com branding header
//   - Chart title and analysis metadata
//   - Settings used (Conf %, Loops, Turn Length, Date Format)
//   - The chart as a PNG image
//   - The Stage Summary table
if (exportPdfBtn) exportPdfBtn.onclick = function() {
    const title     = chartTitleInput ? chartTitleInput.value : activeFilename;
    const confVal   = document.getElementById('paramConfLimit')?.value  || '—';
    const bootVal   = document.getElementById('paramBootNum')?.value    || '—';
    const turnVal   = document.getElementById('paramTurnLength')?.value || '—';
    const fmtVal    = document.getElementById('dateFormatSelect')?.value || '—';
    const startVal  = document.getElementById('startDate')?.value       || 'All';
    const endVal    = document.getElementById('endDate')?.value         || 'All';

    Plotly.toImage(document.getElementById('chart-container'), { format: 'png', width: 1200, height: 600 })
    .then(function(imgData) {
        const win = window.open('', '_blank');
        win.document.write(`<!DOCTYPE html><html><head>
        <title>${title}</title>
        <style>
            body { font-family: system-ui, sans-serif; margin: 30px; color: #1e293b; font-size: 13pt; }

            /* ── Branding header ── */
            .brand-header {
                display: flex; justify-content: space-between; align-items: center;
                border-bottom: 3px solid #002d5b; padding-bottom: 10px; margin-bottom: 18px;
            }
            .brand-name { font-size: 1.3em; font-weight: bold; color: #002d5b; }
            .brand-url  { font-size: 1em; color: #0056b3; }
            .brand-tag  { font-size: 0.95em; color: #666; text-align: right; }

            /* ── Chart title and metadata ── */
            h2   { color: #002d5b; font-size: 1.2em; margin: 0 0 6px 0; }
            .meta-row { display: flex; flex-wrap: wrap; gap: 16px; font-size: 1em; color: #555; margin-bottom: 8px; }
            .meta-row b { color: #002d5b; }

            /* ── Settings used panel ── */
            .settings-bar {
                background: #f0f4f8; border: 1px solid #cce5ff; border-radius: 6px;
                padding: 10px 16px; font-size: 0.95em; color: #444;
                display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 16px;
            }
            .settings-bar span b { color: #002d5b; }

            img { width: 100%; border: 1px solid #eee; margin-bottom: 20px; }

            /* ── Stage table ── */
            .stage-table { width: 100%; border-collapse: collapse; font-size: 1em; margin-top: 10px; }
            .stage-table th { background: #f0f4f8; padding: 10px; border-bottom: 2px solid #0056b3; text-align: left; }
            .stage-table td { padding: 9px 10px; border-bottom: 1px solid #eee; }
            .stage-table caption { font-weight: bold; color: #002d5b; text-align: left; margin-bottom: 8px; font-size: 1.1em; }

            /* ── Footer ── */
            .pdf-footer { margin-top: 24px; font-size: 0.88em; color: #999; border-top: 1px solid #eee; padding-top: 8px; }

            @media print { body { margin: 15px; } }
        </style>
        </head><body>

        <!-- Branding header -->
        <div class="brand-header">
            <div>
                <div class="brand-name">&#128202; StepChangeAnalysis.com</div>
                <div class="brand-url">stepchangeanalysis.com &nbsp;|&nbsp; Bootstrap CUSUM Step-Change Analysis</div>
            </div>
            <div class="brand-tag">
                Generated: ${analysisDateTime}<br>
                Privacy: no data uploaded &#128274;
            </div>
        </div>

        <!-- Chart title -->
        <h2>${title}</h2>

        <!-- Analysis metadata -->
        <div class="meta-row">
            <span>N = <b>${currentChartData.global_count}</b></span>
            <span>Mean = <b>${currentChartData.global_mean}</b></span>
            <span>SD = <b>${currentChartData.global_sd}</b></span>
            <span>File: <b>${activeFilename}</b></span>
        </div>

        <!-- Settings used — so the report is self-documenting -->
        <div class="settings-bar">
            <span>Confidence: <b>${confVal}%</b></span>
            <span>Bootstrap loops: <b>${bootVal}</b></span>
            <span>Turn length: <b>${turnVal}</b></span>
            <span>Date format: <b>${fmtVal}</b></span>
            <span>Date range: <b>${startVal || 'All'}</b> to <b>${endVal || 'All'}</b></span>
        </div>

        <!-- Chart image -->
        <img src="${imgData}" alt="${title}" />

        <!-- Stage summary table -->
        ${buildStageTableHTML()}

        <!-- Footer -->
        <div class="pdf-footer">
            StepChangeAnalysis.com &nbsp;|&nbsp; Bootstrap CUSUM method: Taylor (2000), building on Page (1954), Hinkley (1971), Efron &amp; Tibshirani (1993) &nbsp;|&nbsp; Analysis performed entirely in browser — no data uploaded
        </div>

        <script>window.onload = function() { window.print(); }<\/script>
        </body></html>`);
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

// ── Main chart drawing function ──
function drawPlotlyChart() {
    if (!currentChartData) return;
    const data   = currentChartData;
    const showSD = showSDCheckbox?.checked;

    if (summaryBar) summaryBar.style.display = "flex";
    if (stageCountText) {
        const confVal = document.getElementById('paramConfLimit')?.value || "??";
        stageCountText.innerHTML = `Found ${data.step_count} distinct stages (${confVal}% Confidence).`;
    }
    if (statN)    statN.innerText    = data.global_count;
    if (statMean) statMean.innerText = data.global_mean;
    if (statSD)   statSD.innerText   = data.global_sd;

    updateSummaryBars();

    // ── Trace definitions ──
    const rawTrace = {
        x: data.dates, y: data.raw_values,
        mode: 'lines+markers', name: 'All Points',
        line: { color: '#d62728', width: 1 }, marker: { size: 4 }
    };
    const xTrace     = { ...rawTrace, name: 'Individuals (X)' };
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

    // ── Assemble traces and layout per view ──
    let activeTraces = [];
    const layout = {
        title:    chartTitleInput ? chartTitleInput.value : generateDynamicTitle(),
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