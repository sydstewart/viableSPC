// app.js

// --- UI Elements ---
const pythonWorker = new Worker('worker.js');
const csvInput = document.getElementById('csvInput');
const dropZone = document.getElementById('dropZone');
const statusText = document.getElementById('statusText');
const chartContainer = document.getElementById('chart-container');
const statsDiv = document.getElementById('stats');
const controlsDiv = document.getElementById('controls');
const tabContainer = document.getElementById('tab-container');
const recalcBtn = document.getElementById('recalcBtn');
const showSDCheckbox = document.getElementById('showSDCheckbox');

// Selectors & Parameters
const xColSelect = document.getElementById('xColSelect');
const yColSelect = document.getElementById('yColSelect');
const dateFormatSelect = document.getElementById('dateFormatSelect');
const paramStartDate = document.getElementById('paramStartDate');
const paramEndDate = document.getElementById('paramEndDate');
const chartTitleInput = document.getElementById('chartTitleInput');

// --- Application State ---
let cachedCsvData = null;
let currentChartData = null;
let currentView = 'step';
let activeFilename = "Data";

csvInput.value = "";

// --- Worker Communication ---
pythonWorker.onmessage = function(event) {
    const message = event.data;
    if (message.status === "ready") {
        statusText.innerHTML = "📁 <b>Ready!</b> Click here or Drag & Drop a CSV to begin.";
        csvInput.disabled = false;
    } else if (message.status === "result") {
        statusText.innerText = "✅ Analysis Complete!";
        recalcBtn.innerText = "Recalculate Chart";
        recalcBtn.disabled = false;

        currentChartData = message.data;
        tabContainer.style.display = "block";

        generateDynamicTitle();
        drawPlotlyChart();
    } else if (message.status === "error") {
        statusText.innerText = "❌ Error: " + message.data;
        recalcBtn.disabled = false;
        recalcBtn.innerText = "Recalculate Chart";
    }
};

// --- Drag & Drop Functionality ---
dropZone.addEventListener('click', () => csvInput.click());

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
        csvInput.files = e.dataTransfer.files;
        handleFileUpload(e.dataTransfer.files[0]);
    }
});

csvInput.addEventListener('change', (e) => {
    if (e.target.files.length) handleFileUpload(e.target.files[0]);
});

function handleFileUpload(file) {
    if (!file.name.toLowerCase().endsWith('.csv')) {
        alert("Please upload a .csv file.");
        csvInput.value = "";
        return;
    }

    activeFilename = file.name.replace(/\.[^/.]+$/, "");

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            cachedCsvData = results.data;
            const headers = results.meta.fields;

            xColSelect.innerHTML = '';
            yColSelect.innerHTML = '';

            headers.forEach(h => {
                xColSelect.innerHTML += `<option value="${h}">${h}</option>`;
                yColSelect.innerHTML += `<option value="${h}">${h}</option>`;
            });

            if (headers.length >= 2) {
                xColSelect.selectedIndex = 0;
                yColSelect.selectedIndex = 1;
            }

            controlsDiv.style.display = "flex";
            runPythonAnalysis();
        }
    });
}

// --- Dynamic Title Generator ---
function generateDynamicTitle() {
    const now = new Date();
    const dateStr = now.toLocaleDateString() + " " + now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

    const viewNames = {
        'step': 'Step Change Analysis',
        'run': 'Run Chart',
        'xmr': 'X-mR Control Chart',
        'cusum': 'CUSUM Trend',
        'raw': 'Raw Data View'
    };

    const activeTabName = viewNames[currentView] || 'Analysis';
    chartTitleInput.value = `${activeFilename} - ${activeTabName} - ${dateStr}`;
}

// --- Event Listeners ---
recalcBtn.addEventListener('click', runPythonAnalysis);

showSDCheckbox.addEventListener('change', function() {
    if (currentChartData) drawPlotlyChart();
});

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        currentView = this.getAttribute('data-view');

        if (currentChartData) {
            generateDynamicTitle();
            drawPlotlyChart();
        }
    });
});

// --- Core Execution ---
function runPythonAnalysis() {
    if (!cachedCsvData) return;
    statusText.innerText = "⚙️ Crunching numbers in Python...";
    recalcBtn.innerText = "Calculating...";
    recalcBtn.disabled = true;

    pythonWorker.postMessage({
        command: "process_csv",
        data: cachedCsvData,
        params: {
            turn_length: parseInt(document.getElementById('paramTurnLength').value),
            boot_num: parseInt(document.getElementById('paramBootNum').value),
            conf_limit: parseFloat(document.getElementById('paramConfLimit').value),
            x_col: xColSelect.value,
            y_col: yColSelect.value,
            date_format: dateFormatSelect.value,
            start_date: paramStartDate.value,
            end_date: paramEndDate.value
        }
    });
}

// --- Plotly Chart Rendering ---
function drawPlotlyChart() {
    const data = currentChartData;
    const title = chartTitleInput.value;
    const confLimit = document.getElementById('paramConfLimit').value;

    const globalStatsBox = `<span style="display:inline-block; margin-left: 15px; padding: 3px 10px; background: #e2e8f0; border-radius: 4px; font-size: 0.9em; font-weight: normal; color: #333;">N = <b>${data.global_count}</b> &nbsp;|&nbsp; Mean = <b>${data.global_mean}</b> &nbsp;|&nbsp; SD = <b>${data.global_sd}</b></span>`;

    if (currentView === 'step') {
        statsDiv.innerHTML = `Found ${data.step_count} distinct stages <b>(${confLimit}% Confidence)</b>. ${globalStatsBox} <span style="font-size: 0.85em; font-weight: normal; margin-left: 15px; color: #666;">💡 <b>CUSUM:</b> ↗️ Above Avg | ↘️ Below Avg | ➡️ On Avg</span>`;
    } else if (currentView === 'run') {
        statsDiv.innerHTML = `Run Chart Analysis: Median = ${data.run_median.toFixed(2)} ${globalStatsBox}`;
    } else if (currentView === 'xmr') {
        // UPDATED: Now shows the stats for both the X chart and the mR chart in the info bar!
        statsDiv.innerHTML = `<b>X-mR Chart</b>: UNPL = <b>${data.xmr_unpl}</b> | LNPL = <b>${data.xmr_lnpl}</b> &nbsp;&nbsp;///&nbsp;&nbsp; <b>mR Chart</b>: URL = <b>${data.mr_url}</b> ${globalStatsBox}`;
    } else if (currentView === 'cusum') {
        statsDiv.innerHTML = `💡 <b>CUSUM Guide:</b> ↗️ Upward Slope = Above Average &nbsp;|&nbsp; ↘️ Downward Slope = Below Average &nbsp;|&nbsp; ➡️ Flat = On Average`;
    } else {
        statsDiv.innerHTML = `Displaying raw data points. ${globalStatsBox}`;
    }

    // 1. Raw Data Traces
    const rawTrace = { x: data.dates, y: data.raw_values, mode: 'lines+markers', name: 'All Points', line: { color: '#d62728', width: 1 }, marker: { size: 4 } };

    // 2. Step Change Traces
    const cusumOverlayTrace = { x: data.dates, y: data.cusum_values, mode: 'lines', name: 'Cusum', yaxis: 'y2', line: { color: 'green', width: 1 } };
    const stepTrace = { x: data.stage_dates, y: data.stage_means, mode: 'lines+markers', name: 'Stage Mean', text: data.confleveltext, hoverinfo: 'text+x', line: { color: 'blue', width: 3 }, marker: { size: 6 } };
    const uclTrace = { x: data.stage_dates, y: data.stage_ucl, mode: 'lines', name: '+3 SD (UCL)', line: { color: 'rgba(0,0,255,0.4)', width: 2, dash: 'dash' }, hoverinfo: 'none' };
    const lclTrace = { x: data.stage_dates, y: data.stage_lcl, mode: 'lines', name: '-3 SD (LCL)', line: { color: 'rgba(0,0,255,0.4)', width: 2, dash: 'dash' }, hoverinfo: 'none' };

    // 3. Run Chart Traces
    const medianTrace = { x: [data.dates[0], data.dates[data.dates.length - 1]], y: [data.run_median, data.run_median], mode: 'lines', name: 'Median', line: { color: '#2ca02c', width: 2 } };
    const shiftAboveTrace = { x: data.shift_above_dates, y: data.shift_above_values, mode: 'markers', name: 'Shift (6+ Above)', marker: { color: 'red', size: 10, symbol: 'circle' } };
    const shiftBelowTrace = { x: data.shift_below_dates, y: data.shift_below_values, mode: 'markers', name: 'Shift (6+ Below)', marker: { color: 'blue', size: 10, symbol: 'circle' } };

    // 4. X-mR Traces (Individuals - assigned to default yaxis 1)
    const xRawTrace = { ...rawTrace, name: 'Individuals (X)' };
    const globalMeanTrace = { x: [data.dates[0], data.dates[data.dates.length - 1]], y: [data.global_mean, data.global_mean], mode: 'lines', name: 'Process Mean', line: { color: '#2ca02c', width: 2 } };
    const unplTrace = { x: [data.dates[0], data.dates[data.dates.length - 1]], y: [data.xmr_unpl, data.xmr_unpl], mode: 'lines', name: 'UNPL (+2.66 mR)', line: { color: 'black', width: 1.5, dash: 'dash' } };
    const lnplTrace = { x: [data.dates[0], data.dates[data.dates.length - 1]], y: [data.xmr_lnpl, data.xmr_lnpl], mode: 'lines', name: 'LNPL (-2.66 mR)', line: { color: 'black', width: 1.5, dash: 'dash' } };

    // 4b. NEW X-mR Traces (Moving Range - explicitly assigned to yaxis 2)
    const mrTrace = { x: data.dates, y: data.mr_values, mode: 'lines+markers', name: 'Moving Range (mR)', line: { color: '#17becf', width: 1 }, marker: { size: 4 }, yaxis: 'y2' };
    const mrMeanTrace = { x: [data.dates[0], data.dates[data.dates.length - 1]], y: [data.mr_mean, data.mr_mean], mode: 'lines', name: 'Mean mR', line: { color: '#2ca02c', width: 2, dash: 'dash' }, yaxis: 'y2' };
    const mrUrlTrace = { x: [data.dates[0], data.dates[data.dates.length - 1]], y: [data.mr_url, data.mr_url], mode: 'lines', name: 'URL (3.267 mR)', line: { color: 'black', width: 1.5, dash: 'dash' }, yaxis: 'y2' };

    // 5. CUSUM Traces
    const isolatedCusumTrace = { x: data.dates, y: data.cusum_values, mode: 'lines', name: 'Cumulative Sum', line: { color: 'green', width: 2 } };
    const zeroLineTrace = { x: [data.dates[0], data.dates[data.dates.length - 1]], y: [0, 0], mode: 'lines', name: 'Zero Baseline', line: { color: 'black', width: 1, dash: 'dash' } };

    // --- Trace Routing ---
    let activeTraces = [];
    if (currentView === 'step') {
        activeTraces = [rawTrace, cusumOverlayTrace, stepTrace];
        if (showSDCheckbox.checked) activeTraces.push(uclTrace, lclTrace);
    } else if (currentView === 'run') {
        activeTraces = [rawTrace, medianTrace, shiftAboveTrace, shiftBelowTrace];
    } else if (currentView === 'xmr') {
        // Stack all the X traces and the mR traces into one render
        activeTraces = [xRawTrace, globalMeanTrace, unplTrace, lnplTrace, mrTrace, mrMeanTrace, mrUrlTrace];
    } else if (currentView === 'cusum') {
        activeTraces = [isolatedCusumTrace, zeroLineTrace];
    } else if (currentView === 'raw') {
        activeTraces = [rawTrace];
    }

    // --- Layout Build ---
    const layout = {
        title: title,
        xaxis: { title: 'Date / Observation' },
        yaxis: {
            title: currentView === 'cusum' ? 'Cumulative Sum of Deviations' : 'Value',
            side: 'left'
        },
        hovermode: 'closest',
        legend: { orientation: "h", y: -0.2 }
    };

    // Subplot Layout Logic
    if (currentView === 'step') {
        // For Step Change: CUSUM gets overlaid on the right
        layout.yaxis2 = { title: 'Cusum', overlaying: 'y', side: 'right', showgrid: false };
    } else if (currentView === 'xmr') {
        // For X-mR: Split the screen horizontally into two stacked charts!
        layout.yaxis.domain = [0.35, 1]; // Top 65% of screen
        layout.yaxis.title = 'Individual Value (X)';

        layout.yaxis2 = {
            title: 'Moving Range (mR)',
            domain: [0, 0.25], // Bottom 25% of screen
            anchor: 'x'
        };
    }

    Plotly.newPlot(chartContainer, activeTraces, layout);
}