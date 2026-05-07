// app.js

// --- UI Elements ---
const pythonWorker = new Worker('worker.js');
const csvInput = document.getElementById('csvInput');
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
const paramStartDate = document.getElementById('paramStartDate'); // NEW
const paramEndDate = document.getElementById('paramEndDate');     // NEW

// --- Application State ---
let cachedCsvData = null;
let currentChartData = null;
let currentView = 'step';

csvInput.value = "";

// --- Worker Communication ---
pythonWorker.onmessage = function(event) {
    const message = event.data;
    if (message.status === "ready") {
        statusText.innerText = "Python Engine is ready! Select a CSV.";
        csvInput.disabled = false;
    } else if (message.status === "result") {
        statusText.innerText = "Analysis Complete!";
        recalcBtn.innerText = "Recalculate Chart";
        recalcBtn.disabled = false;

        currentChartData = message.data;
        tabContainer.style.display = "block";
        drawPlotlyChart();
    } else if (message.status === "error") {
        statusText.innerText = "Error: " + message.data;
        recalcBtn.disabled = false;
        recalcBtn.innerText = "Recalculate Chart";
    }
};

// --- File Upload & CSV Parsing ---
csvInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
        alert("Please upload a .csv file.");
        csvInput.value = "";
        return;
    }

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
});

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
        if (currentChartData) drawPlotlyChart();
    });
});

// --- Core Execution ---
function runPythonAnalysis() {
    if (!cachedCsvData) return;
    statusText.innerText = "Crunching numbers in Python...";
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
            start_date: paramStartDate.value, // NEW
            end_date: paramEndDate.value      // NEW
        }
    });
}

// --- Plotly Chart Rendering ---
function drawPlotlyChart() {
    const data = currentChartData;
    const title = document.getElementById('chartTitleInput').value;

    const globalStatsBox = `<span style="display:inline-block; margin-left: 15px; padding: 3px 10px; background: #e2e8f0; border-radius: 4px; font-size: 0.9em; font-weight: normal; color: #333;">N = <b>${data.global_count}</b> &nbsp;|&nbsp; Mean = <b>${data.global_mean}</b> &nbsp;|&nbsp; SD = <b>${data.global_sd}</b></span>`;

    if (currentView === 'step') {
        statsDiv.innerHTML = `Found ${data.step_count} distinct stages. ${globalStatsBox} <span style="font-size: 0.85em; font-weight: normal; margin-left: 15px; color: #666;">💡 <b>CUSUM:</b> ↗️ Above Avg | ↘️ Below Avg | ➡️ On Avg</span>`;
    } else if (currentView === 'run') {
        statsDiv.innerHTML = `Run Chart Analysis: Median = ${data.run_median.toFixed(2)} ${globalStatsBox}`;
    } else if (currentView === 'cusum') {
        statsDiv.innerHTML = `💡 <b>CUSUM Guide:</b> ↗️ Upward Slope = Above Average &nbsp;|&nbsp; ↘️ Downward Slope = Below Average &nbsp;|&nbsp; ➡️ Flat = On Average`;
    } else {
        statsDiv.innerHTML = `Displaying raw data points. ${globalStatsBox}`;
    }

    // Traces
    const rawTrace = {
        x: data.dates, y: data.raw_values, mode: 'lines+markers',
        name: 'All Points', line: { color: '#d62728', width: 1 }, marker: { size: 4 }
    };
    const cusumOverlayTrace = {
        x: data.dates, y: data.cusum_values, mode: 'lines',
        name: 'Cusum', yaxis: 'y2', line: { color: 'green', width: 1 }
    };
    const stepTrace = {
        x: data.stage_dates, y: data.stage_means, mode: 'lines+markers',
        name: 'Stage Mean', text: data.confleveltext, hoverinfo: 'text+x',
        line: { color: 'blue', width: 3 }, marker: { size: 6 }
    };
    const uclTrace = {
        x: data.stage_dates, y: data.stage_ucl, mode: 'lines',
        name: '+3 SD (UCL)', line: { color: 'rgba(0,0,255,0.4)', width: 2, dash: 'dash' }, hoverinfo: 'none'
    };
    const lclTrace = {
        x: data.stage_dates, y: data.stage_lcl, mode: 'lines',
        name: '-3 SD (LCL)', line: { color: 'rgba(0,0,255,0.4)', width: 2, dash: 'dash' }, hoverinfo: 'none'
    };
    const medianTrace = {
        x: [data.dates[0], data.dates[data.dates.length - 1]],
        y: [data.run_median, data.run_median],
        mode: 'lines', name: 'Median', line: { color: '#2ca02c', width: 2 }
    };
    const shiftAboveTrace = {
        x: data.shift_above_dates, y: data.shift_above_values, mode: 'markers',
        name: 'Shift (6+ Above)', marker: { color: 'red', size: 10, symbol: 'circle' }
    };
    const shiftBelowTrace = {
        x: data.shift_below_dates, y: data.shift_below_values, mode: 'markers',
        name: 'Shift (6+ Below)', marker: { color: 'blue', size: 10, symbol: 'circle' }
    };
    const isolatedCusumTrace = {
        x: data.dates, y: data.cusum_values, mode: 'lines',
        name: 'Cumulative Sum', line: { color: 'green', width: 2 }
    };
    const zeroLineTrace = {
        x: [data.dates[0], data.dates[data.dates.length - 1]], y: [0, 0],
        mode: 'lines', name: 'Zero Baseline', line: { color: 'black', width: 1, dash: 'dash' }
    };

    // Trace Routing
    let activeTraces = [];
    if (currentView === 'step') {
        activeTraces = [rawTrace, cusumOverlayTrace, stepTrace];
        if (showSDCheckbox.checked) activeTraces.push(uclTrace, lclTrace);
    } else if (currentView === 'run') {
        activeTraces = [rawTrace, medianTrace, shiftAboveTrace, shiftBelowTrace];
    } else if (currentView === 'cusum') {
        activeTraces = [isolatedCusumTrace, zeroLineTrace];
    } else if (currentView === 'raw') {
        activeTraces = [rawTrace];
    }

    // Layout
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

    if (currentView === 'step') {
        layout.yaxis2 = { title: 'Cusum', overlaying: 'y', side: 'right', showgrid: false };
    }

    Plotly.newPlot(chartContainer, activeTraces, layout);
}