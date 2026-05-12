/**
 * PROJECT: SecureSPC Analyzer v3.2
 * FIX: Crashes caused by missing HTML IDs (null pointer error)
 * FEATURE: Localized Title & Master SPC Engine
 */

const pythonWorker = new Worker('worker.js');
const csvInput = document.getElementById('csvInput');
const dropZone = document.getElementById('dropZone');
const statusText = document.getElementById('statusText');
const chartContainer = document.getElementById('chart-container');
const tableView = document.getElementById('table-view');
const stageSummaryTable = document.getElementById('stageSummaryTable');
const controlsDiv = document.getElementById('controls');
const tabContainer = document.getElementById('tab-container');
const recalcBtn = document.getElementById('recalcBtn');
const showSDCheckbox = document.getElementById('showSDCheckbox');
const chartTitleInput = document.getElementById('chartTitleInput');

// Summary Bar Elements
const summaryBar = document.getElementById('summary-bar');
const stageCountText = document.getElementById('stageCountText');
const statN = document.getElementById('statN');
const statMean = document.getElementById('statMean');
const statSD = document.getElementById('statSD');

let cachedCsvData = null;
let currentChartData = null;
let currentView = 'step';
let activeFilename = "Data";

// --- GLOBAL SHIELDS ---
window.addEventListener("dragover", e => e.preventDefault(), false);
window.addEventListener("drop", e => e.preventDefault(), false);

// --- DYNAMIC TITLE LOGIC ---
function generateDynamicTitle() {
    const now = new Date();
    const localDate = now.toLocaleDateString();
    const localTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const viewNames = {
        'step': 'Step Change Analysis',
        'stages': 'Stage Summary',
        'xmr': 'X-mR Chart',
        'run': 'Run Chart',
        'cusum': 'CUSUM Chart',
        'raw': 'Raw Data'
    };

    const currentViewName = viewNames[currentView] || 'Analysis';
    const titleString = `${activeFilename} - ${currentViewName} - ${localDate} ${localTime}`;

    // Safety check: Only set if the element exists
    if (chartTitleInput) {
        chartTitleInput.value = titleString;
    }
    return titleString;
}

// --- WORKER HANDLER ---
pythonWorker.onmessage = function(event) {
    const message = event.data;
    if (message.status === "ready") {
        statusText.innerHTML = "📁 <b>Ready!</b> Click or Drop CSV to begin.";
        if (csvInput) csvInput.disabled = false;
    } else if (message.status === "result") {
        statusText.innerText = "✅ Analysis Complete!";
        currentChartData = message.data;
        if (tabContainer) tabContainer.style.display = "block";
        buildStageTable(message.data);
        generateDynamicTitle();
        drawPlotlyChart();
        if (recalcBtn) {
            recalcBtn.disabled = false;
            recalcBtn.innerText = "Recalculate Chart";
        }
    } else if (message.status === "error") {
        statusText.innerText = "❌ Error: " + message.data;
        if (recalcBtn) {
            recalcBtn.disabled = false;
            recalcBtn.innerText = "Recalculate Chart";
        }
    }
};

// --- FILE INPUTS ---
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
if (csvInput) csvInput.onchange = (e) => { if (e.target.files.length) handleFileUpload(e.target.files[0]); };

function handleFileUpload(file) {
    activeFilename = file.name.replace(/\.[^/.]+$/, "");
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
                if (headers.length >= 2) { yS.selectedIndex = 1; }
            }
            if (controlsDiv) controlsDiv.style.display = "flex";
            statusText.innerHTML = "📊 Headers Loaded. Click Recalculate.";
        }
    });
}

function runPythonAnalysis() {
    if (!cachedCsvData) return;
    statusText.innerText = "⚙️ Calculating...";
    if (recalcBtn) {
        recalcBtn.disabled = true;
        recalcBtn.innerText = "Calculating...";
    }

    // Safety gather params
    const turnLen = document.getElementById('paramTurnLength')?.value || 5;
    const bootNum = document.getElementById('paramBootNum')?.value || 1000;
    const confLim = document.getElementById('paramConfLimit')?.value || 95;
    const xCol = document.getElementById('xColSelect')?.value;
    const yCol = document.getElementById('yColSelect')?.value;
    const dateFmt = document.getElementById('dateFormatSelect')?.value || "auto";

    pythonWorker.postMessage({
        command: "process_csv",
        data: cachedCsvData,
        params: {
            turn_length: parseInt(turnLen),
            boot_num: parseInt(bootNum),
            conf_limit: parseFloat(confLim),
            x_col: xCol,
            y_col: yCol,
            date_format: dateFmt,
            start_date: "", end_date: ""
        }
    });
}

function buildStageTable(data) {
    if (!stageSummaryTable) return;
    let html = `<thead><tr><th>Stage</th><th>From</th><th>To</th><th style="text-align:right;">Mean</th><th style="text-align:right;">SD</th><th style="text-align:right;">Conf %</th><th style="text-align:right;">Change %</th></tr></thead><tbody>`;
    let count = 1;
    for (let i = 0; i < data.stage_means.length; i += 2) {
        const mean = data.stage_means[i];
        const start = data.stage_dates[i].split(' ')[0];
        const end = data.stage_dates[i+1].split(' ')[0];
        const confText = data.confleveltext[i] || "";
        const confMatch = confText.match(/Conf: ([\d.]+)%/);
        const confVal = confMatch ? confMatch[1] + "%" : (i === 0 ? "Baseline" : "---");
        let change = i === 0 ? "Baseline" : (((mean - data.stage_means[i-1])/data.stage_means[i-1])*100).toFixed(1) + "%";
        html += `<tr><td>${count++}</td><td>${start}</td><td>${end}</td><td style="text-align:right;">${mean.toFixed(2)}</td><td style="text-align:right;">${data.global_sd}</td><td style="text-align:right;">${confVal}</td><td style="text-align:right;"><b>${change}</b></td></tr>`;
    }
    stageSummaryTable.innerHTML = html + "</tbody>";
}

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = function() {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        currentView = this.getAttribute('data-view');
        generateDynamicTitle();
        if (currentView === 'stages') {
            chartContainer.style.display = "none";
            if (tableView) tableView.style.display = "block";
            if (summaryBar) summaryBar.style.display = "flex";
        } else {
            chartContainer.style.display = "block";
            if (tableView) tableView.style.display = "none";
            drawPlotlyChart();
        }
    };
});

if (recalcBtn) recalcBtn.onclick = runPythonAnalysis;
if (showSDCheckbox) showSDCheckbox.onchange = () => { if(currentChartData) drawPlotlyChart(); };

function drawPlotlyChart() {
    if (!currentChartData) return;
    const data = currentChartData;
    const showSD = showSDCheckbox?.checked;

    // Safety update Summary Bar
    if (summaryBar) summaryBar.style.display = "flex";
    if (stageCountText) {
        const confTextValue = document.getElementById('paramConfLimit')?.value || "??";
        stageCountText.innerHTML = `Found ${data.step_count} distinct stages (${confTextValue}% Confidence).`;
    }
    if (statN) statN.innerText = data.global_count;
    if (statMean) statMean.innerText = data.global_mean;
    if (statSD) statSD.innerText = data.global_sd;

    const rawTrace = { x: data.dates, y: data.raw_values, mode: 'lines+markers', name: 'All Points', line: { color: '#d62728', width: 1 }, marker: { size: 4 } };
    const xTrace = { ...rawTrace, name: 'Individuals (X)' };
    const xMeanTrace = { x: [data.dates[0], data.dates[data.dates.length - 1]], y: [data.global_mean, data.global_mean], mode: 'lines', name: 'Process Mean', line: { color: '#2ca02c', width: 2 } };
    const unplTrace = { x: [data.dates[0], data.dates[data.dates.length - 1]], y: [data.xmr_unpl, data.xmr_unpl], mode: 'lines', name: 'UNPL (+2.66 mR)', line: { color: 'black', width: 1.5, dash: 'dash' } };
    const lnplTrace = { x: [data.dates[0], data.dates[data.dates.length - 1]], y: [data.xmr_lnpl, data.xmr_lnpl], mode: 'lines', name: 'LNPL (-2.66 mR)', line: { color: 'black', width: 1.5, dash: 'dash' } };

    const mrTrace = { x: data.dates, y: data.mr_values, mode: 'lines+markers', name: 'Moving Range (mR)', yaxis: 'y2', line: { color: '#17becf', width: 1 }, marker: { size: 4 } };
    const mrMeanTrace = { x: [data.dates[0], data.dates[data.dates.length - 1]], y: [data.mr_mean, data.mr_mean], mode: 'lines', name: 'Mean mR', yaxis: 'y2', line: { color: '#2ca02c', dash: 'dash' } };
    const mrUrlTrace = { x: [data.dates[0], data.dates[data.dates.length - 1]], y: [data.mr_url, data.mr_url], mode: 'lines', name: 'URL (3.267 mR)', yaxis: 'y2', line: { color: 'black', dash: 'dash' } };

    const stepTrace = { x: data.stage_dates, y: data.stage_means, mode: 'lines+markers', name: 'Stage Mean', text: data.confleveltext, hoverinfo: 'text+x', line: { color: 'blue', width: 3 }, marker: { size: 6 } };
    const uclTrace = { x: data.stage_dates, y: data.stage_ucl, mode: 'lines', name: 'UCL', line: { color: 'rgba(0,0,255,0.2)', dash: 'dash' }, hoverinfo: 'skip' };
    const lclTrace = { x: data.stage_dates, y: data.stage_lcl, mode: 'lines', name: 'LCL', line: { color: 'rgba(0,0,255,0.2)', dash: 'dash' }, hoverinfo: 'skip' };
    const cusumOverlayTrace = { x: data.dates, y: data.cusum_values, mode: 'lines', name: 'Cusum', yaxis: 'y2', line: { color: 'green', width: 1 } };

    const medianTrace = { x: [data.dates[0], data.dates[data.dates.length - 1]], y: [data.run_median, data.run_median], mode: 'lines', name: 'Median', line: { color: '#2ca02c', width: 2 } };
    const shiftAboveTrace = { x: data.shift_above_dates, y: data.shift_above_values, mode: 'markers', name: 'Shift (6+ Above)', marker: { color: 'red', size: 10 } };
    const shiftBelowTrace = { x: data.shift_below_dates, y: data.shift_below_values, mode: 'markers', name: 'Shift (6+ Below)', marker: { color: 'blue', size: 10 } };

    const isolatedCusumTrace = { x: data.dates, y: data.cusum_values, mode: 'lines', name: 'Cumulative Sum', line: { color: 'green', width: 2 } };
    const zeroBaselineTrace = { x: [data.dates[0], data.dates[data.dates.length - 1]], y: [0, 0], mode: 'lines', name: 'Zero Baseline', line: { color: 'black', width: 1, dash: 'dash' } };

    let activeTraces = [];
    const layout = {
        title: chartTitleInput ? chartTitleInput.value : generateDynamicTitle(),
        xaxis: { title: 'Timeline' },
        yaxis: { title: 'Value' },
        hovermode: 'closest',
        legend: { orientation: 'h', y: -0.2 }
    };

    if (currentView === 'step') {
        activeTraces = [rawTrace, cusumOverlayTrace, stepTrace];
        if (showSD) activeTraces.push(uclTrace, lclTrace);
        layout.yaxis2 = { overlaying: 'y', side: 'right', showgrid: false };
    } else if (currentView === 'run') {
        activeTraces = [rawTrace, medianTrace, shiftAboveTrace, shiftBelowTrace];
    } else if (currentView === 'xmr') {
        activeTraces = [xTrace, xMeanTrace, unplTrace, lnplTrace, mrTrace, mrMeanTrace, mrUrlTrace];
        layout.yaxis.domain = [0.35, 1];
        layout.yaxis2 = { domain: [0, 0.25], anchor: 'x', title: 'mR' };
        layout.yaxis.title = 'Individual Value (X)';
    } else if (currentView === 'cusum') {
        activeTraces = [isolatedCusumTrace, zeroBaselineTrace];
        layout.yaxis.title = 'Cumulative Sum of Deviations';
    } else if (currentView === 'raw') {
        activeTraces = [rawTrace];
    }

    Plotly.newPlot(chartContainer, activeTraces, layout);
}