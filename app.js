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

// Selectors & Parameters
const xColSelect = document.getElementById('xColSelect');
const yColSelect = document.getElementById('yColSelect');
const dateFormatSelect = document.getElementById('dateFormatSelect');

// --- Application State ---
let cachedCsvData = null;
let currentChartData = null; // Holds the latest Python results in memory
let currentView = 'step';    // Tracks the active tab

// Reset input on load
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

        // Save the math to memory
        currentChartData = message.data;

        // Reveal tabs and draw the initial chart
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

            // Auto-select defaults
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

// Tab Switching Logic
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        // Update active class styling
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');

        // Update view state and redraw instantly
        currentView = this.getAttribute('data-view');
        if (currentChartData) {
            drawPlotlyChart();
        }
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
            date_format: dateFormatSelect.value
        }
    });
}

// --- Plotly Chart Rendering ---
function drawPlotlyChart() {
    const data = currentChartData;
    const title = document.getElementById('chartTitleInput').value;

    // Update Contextual Headers
    if (currentView === 'step') {
        statsDiv.innerText = `Found ${data.step_count} distinct stages.`;
    } else if (currentView === 'run') {
        statsDiv.innerText = `Run Chart Analysis: Median = ${data.run_median.toFixed(2)}`;
    } else if (currentView === 'cusum') {
        statsDiv.innerText = `CUSUM Guide: ↗️ Upward Slope = Above Average | ↘️ Downward Slope = Below Average | ➡️ Flat = On Average`;
    } else {
        statsDiv.innerText = `Displaying raw data points.`;
    }

    // 1. Base Trace
    const rawTrace = {
        x: data.dates, y: data.raw_values, mode: 'lines+markers',
        name: 'All Points', line: { color: '#d62728', width: 1 }, marker: { size: 4 }
    };

    // 2. Step Change Traces
    const cusumOverlayTrace = {
        x: data.dates, y: data.cusum_values, mode: 'lines',
        name: 'Cusum', yaxis: 'y2', line: { color: 'green', width: 1 }
    };
    const stepTrace = {
        x: data.stage_dates, y: data.stage_means, mode: 'lines+markers',
        name: 'SM - Stage Mean', text: data.confleveltext, hoverinfo: 'text+x',
        line: { color: 'blue', width: 3 }, marker: { size: 6 }
    };

    // 3. Run Chart Traces
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

    // 4. Isolated CUSUM Traces
    const isolatedCusumTrace = {
        x: data.dates, y: data.cusum_values, mode: 'lines',
        name: 'Cumulative Sum', line: { color: 'green', width: 2 }
    };
    const zeroLineTrace = {
        x: [data.dates[0], data.dates[data.dates.length - 1]], y: [0, 0],
        mode: 'lines', name: 'Zero Baseline', line: { color: 'black', width: 1, dash: 'dash' }
    };

    // --- Trace Routing ---
    let activeTraces = [];
    if (currentView === 'step') {
        activeTraces = [rawTrace, cusumOverlayTrace, stepTrace];
    } else if (currentView === 'run') {
        activeTraces = [rawTrace, medianTrace, shiftAboveTrace, shiftBelowTrace];
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

    // Attach secondary axis only if looking at the hybrid Step view
    if (currentView === 'step') {
        layout.yaxis2 = { title: 'Cusum', overlaying: 'y', side: 'right', showgrid: false };
    }

    Plotly.newPlot(chartContainer, activeTraces, layout);
}