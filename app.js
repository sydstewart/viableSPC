/**
 * app.js — StepChangeAnalysis.com SPC Analyzer
 * Wires up all UI elements to the pure-JS worker engine.
 */

const pythonWorker = new Worker('worker.js');
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
const summaryBar      = document.getElementById('summary-bar');
const xmrSummaryBar   = document.getElementById('xmr-summary-bar');
const stageCountText  = document.getElementById('stageCountText');
const statN           = document.getElementById('statN');
const statMean        = document.getElementById('statMean');
const statSD          = document.getElementById('statSD');

// X-mR specific summary elements
const xmrUnpl  = document.getElementById('xmrUnpl');
const xmrLnpl  = document.getElementById('xmrLnpl');
const xmrUrl   = document.getElementById('xmrUrl');
const xmrN     = document.getElementById('xmrN');
const xmrMean  = document.getElementById('xmrMean');
const xmrSd    = document.getElementById('xmrSd');

let cachedCsvData   = null;
let currentChartData = null;
let currentView     = 'step';
let activeFilename  = "Data";
let analysisDateTime = "";

// ── Prevent browser from intercepting drag-and-drop globally ──
window.addEventListener("dragover", e => e.preventDefault(), false);
window.addEventListener("drop",     e => e.preventDefault(), false);

// ── Worker is pure JS — ready immediately, no boot delay ──
pythonWorker.onmessage = function(event) {
    const message = event.data;

    if (message.status === "ready") {
        // Worker signals ready — enable upload immediately
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
// Auto-fills with: Filename - Chart Type - Date Time (UK format)
function generateDynamicTitle() {
    const now = new Date();

    // UK date format: DD/MM/YYYY HH:MM
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
    const viewName = viewNames[currentView] || 'Analysis';
    const titleString = `${activeFilename} - ${viewName} - ${analysisDateTime}`;

    if (chartTitleInput) chartTitleInput.value = titleString;

    // Small info line showing filename and timestamp separately
    if (chartFileInfo) {
        chartFileInfo.innerText = `File: ${activeFilename}   |   Generated: ${analysisDateTime}`;
    }
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
    // Strip file extension to get a clean filename for the chart title
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
                // Default Y-axis to second column (usually the value column)
                if (headers.length >= 2) yS.selectedIndex = 1;
            }
            if (controlsDiv) controlsDiv.style.display = "flex";
            statusText.innerHTML = `📊 <b>${activeFilename}</b> loaded. Configure settings and click Recalculate.`;
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

    const turnLen  = document.getElementById('paramTurnLength')?.value || 5;
    const bootNum  = document.getElementById('paramBootNum')?.value    || 1000;
    const confLim  = document.getElementById('paramConfLimit')?.value  || 95;
    const xCol     = document.getElementById('xColSelect')?.value;
    const yCol     = document.getElementById('yColSelect')?.value;
    const dateFmt  = document.getElementById('dateFormatSelect')?.value || "auto";
    const startDate = document.getElementById('startDate')?.value || "";
    const endDate   = document.getElementById('endDate')?.value   || "";

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

        // Extract confidence from the hover text (e.g. "Conf: 96.8%")
        const confText  = data.confleveltext[i] || "";
        const confMatch = confText.match(/Conf: ([\d.]+)%/);
        const confVal   = confMatch ? confMatch[1] + "%" : (i === 0 ? "Baseline" : "---");

        // Calculate % change from previous stage mean
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

        // Show/hide the correct summary bar for each view
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

    // X-mR view shows X-mR specific bar
    if (currentView === 'xmr') {
        if (summaryBar)    summaryBar.style.display    = "none";
        if (xmrSummaryBar) xmrSummaryBar.style.display = "flex";
        // Populate X-mR values
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
if (recalcBtn)     recalcBtn.onclick     = runPythonAnalysis;
if (showSDCheckbox) showSDCheckbox.onchange = () => { if (currentChartData) drawPlotlyChart(); };

// Export PNG — uses Plotly's built-in downloadImage
if (exportPngBtn) exportPngBtn.onclick = function() {
    const title = chartTitleInput ? chartTitleInput.value : activeFilename;
    Plotly.downloadImage(chartContainer, {
        format: 'png',
        width:  1400,
        height: 700,
        filename: title.replace(/[^a-z0-9]/gi, '_')
    });
};

// Export PDF — opens print dialog with chart only
if (exportPdfBtn) exportPdfBtn.onclick = function() {
    const title  = chartTitleInput ? chartTitleInput.value : activeFilename;
    const imgDiv = document.getElementById('chart-container');

    Plotly.toImage(imgDiv, { format: 'png', width: 1200, height: 600 }).then(function(imgData) {
        const win = window.open('', '_blank');
        win.document.write(`
            <!DOCTYPE html><html><head>
            <title>${title}</title>
            <style>
                body { font-family: system-ui, sans-serif; margin: 30px; }
                h2 { color: #002d5b; font-size: 1.1em; margin-bottom: 5px; }
                .meta { font-size: 0.8em; color: #666; margin-bottom: 20px; }
                img { width: 100%; border: 1px solid #eee; }
                .stage-table { width: 100%; border-collapse: collapse; margin-top: 30px; font-size: 0.85em; }
                .stage-table th { background: #f0f4f8; padding: 8px; border-bottom: 2px solid #0056b3; text-align: left; }
                .stage-table td { padding: 7px 8px; border-bottom: 1px solid #eee; }
                @media print { body { margin: 10px; } }
            </style>
            </head><body>
            <h2>${title}</h2>
            <div class="meta">Generated: ${analysisDateTime} &nbsp;|&nbsp; N = ${currentChartData.global_count} &nbsp;|&nbsp; Mean = ${currentChartData.global_mean} &nbsp;|&nbsp; SD = ${currentChartData.global_sd}</div>
            <img src="${imgData}" />
            ${currentView !== 'stages' ? buildStageTableHTML() : ''}
            <script>window.onload = function() { window.print(); }<\/script>
            </body></html>
        `);
        win.document.close();
    });
};

// Build stage table as plain HTML string (for PDF export)
function buildStageTableHTML() {
    if (!currentChartData) return '';
    const data = currentChartData;
    let html = `<table class="stage-table"><thead><tr>
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

    // Update main summary bar
    if (summaryBar) summaryBar.style.display = "flex";
    if (stageCountText) {
        const confVal = document.getElementById('paramConfLimit')?.value || "??";
        stageCountText.innerHTML = `Found ${data.step_count} distinct stages (${confVal}% Confidence).`;
    }
    if (statN)    statN.innerText    = data.global_count;
    if (statMean) statMean.innerText = data.global_mean;
    if (statSD)   statSD.innerText   = data.global_sd;

    // Update summary bars for current view
    updateSummaryBars();

    // ── Trace definitions ──
    const rawTrace = {
        x: data.dates, y: data.raw_values,
        mode: 'lines+markers', name: 'All Points',
        line: { color: '#d62728', width: 1 }, marker: { size: 4 }
    };

    // X-mR traces
    const xTrace = { ...rawTrace, name: 'Individuals (X)' };
    const xMeanTrace = {
        x: [data.dates[0], data.dates[data.dates.length - 1]],
        y: [data.global_mean, data.global_mean],
        mode: 'lines', name: 'Process Mean',
        line: { color: '#2ca02c', width: 2 }
    };
    const unplTrace = {
        x: [data.dates[0], data.dates[data.dates.length - 1]],
        y: [data.xmr_unpl, data.xmr_unpl],
        mode: 'lines', name: `UNPL (+2.66 mR)`,
        line: { color: 'black', width: 1.5, dash: 'dash' }
    };
    const lnplTrace = {
        x: [data.dates[0], data.dates[data.dates.length - 1]],
        y: [data.xmr_lnpl, data.xmr_lnpl],
        mode: 'lines', name: `LNPL (-2.66 mR)`,
        line: { color: 'black', width: 1.5, dash: 'dash' }
    };
    const mrTrace = {
        x: data.dates, y: data.mr_values,
        mode: 'lines+markers', name: 'Moving Range (mR)',
        yaxis: 'y2', line: { color: '#17becf', width: 1 }, marker: { size: 4 }
    };
    const mrMeanTrace = {
        x: [data.dates[0], data.dates[data.dates.length - 1]],
        y: [data.mr_mean, data.mr_mean],
        mode: 'lines', name: 'Mean mR', yaxis: 'y2',
        line: { color: '#2ca02c', dash: 'dash' }
    };
    const mrUrlTrace = {
        x: [data.dates[0], data.dates[data.dates.length - 1]],
        y: [data.mr_url, data.mr_url],
        mode: 'lines', name: 'URL (3.267 mR)', yaxis: 'y2',
        line: { color: 'black', dash: 'dash' }
    };

    // Step change traces
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
        mode: 'lines', name: 'Cusum', yaxis: 'y2',
        line: { color: 'green', width: 1 }
    };

    // Run chart traces
    const medianTrace = {
        x: [data.dates[0], data.dates[data.dates.length - 1]],
        y: [data.run_median, data.run_median],
        mode: 'lines', name: 'Median',
        line: { color: '#2ca02c', width: 2 }
    };
    const shiftAboveTrace = {
        x: data.shift_above_dates, y: data.shift_above_values,
        mode: 'markers', name: 'Shift (6+ Above)',
        marker: { color: 'red', size: 10 }
    };
    const shiftBelowTrace = {
        x: data.shift_below_dates, y: data.shift_below_values,
        mode: 'markers', name: 'Shift (6+ Below)',
        marker: { color: 'blue', size: 10 }
    };

    // CUSUM only trace
    const isolatedCusumTrace = {
        x: data.dates, y: data.cusum_values,
        mode: 'lines', name: 'Cumulative Sum',
        line: { color: 'green', width: 2 }
    };
    const zeroBaselineTrace = {
        x: [data.dates[0], data.dates[data.dates.length - 1]],
        y: [0, 0], mode: 'lines', name: 'Zero Baseline',
        line: { color: 'black', width: 1, dash: 'dash' }
    };

    // ── Assemble active traces and layout per view ──
    let activeTraces = [];
    const layout = {
        title: chartTitleInput ? chartTitleInput.value : generateDynamicTitle(),
        xaxis: { title: 'Date / Observation' },
        yaxis: { title: 'Value' },
        hovermode: 'closest',
        legend: { orientation: 'h', y: -0.2 }
    };

    if (currentView === 'step') {
        activeTraces = [rawTrace, cusumOverlayTrace, stepTrace];
        if (showSD) activeTraces.push(uclTrace, lclTrace);
        layout.yaxis2 = { overlaying: 'y', side: 'right', showgrid: false, title: 'Cusum' };

    } else if (currentView === 'xmr') {
        activeTraces = [xTrace, xMeanTrace, unplTrace, lnplTrace, mrTrace, mrMeanTrace, mrUrlTrace];
        layout.yaxis.domain  = [0.35, 1];
        layout.yaxis.title   = 'Individual Value (X)';
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