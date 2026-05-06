// app.js

const pythonWorker = new Worker('worker.js');
const csvInput = document.getElementById('csvInput');
const statusText = document.getElementById('statusText');
const chartContainer = document.getElementById('chart-container');
const statsDiv = document.getElementById('stats');
const controlsDiv = document.getElementById('controls');
const recalcBtn = document.getElementById('recalcBtn');

// New Dropdown elements
const xColSelect = document.getElementById('xColSelect');
const yColSelect = document.getElementById('yColSelect');

let cachedCsvData = null;

csvInput.value = "";

pythonWorker.onmessage = function(event) {
    const message = event.data;

    if (message.status === "ready") {
        statusText.innerText = "Python Engine is ready! Select a CSV.";
        csvInput.disabled = false;
    }
    else if (message.status === "result") {
        const chartData = message.data;
        statusText.innerText = "Analysis Complete!";
        recalcBtn.innerText = "Recalculate Chart";
        recalcBtn.disabled = false;
        drawPlotlyChart(chartData);
    }
    else if (message.status === "error") {
        statusText.innerText = "Error: \n" + message.data;
        recalcBtn.innerText = "Recalculate Chart";
        recalcBtn.disabled = false;
        console.error("Worker Error:", message.data);
    }
};

// Listen for a file upload
csvInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    // --- THE TRAP: File Format Validation ---
    if (!file.name.toLowerCase().endsWith('.csv')) {
        alert("Invalid format! Please upload a .csv file (Excel .xlsx files are not supported).");
        statusText.innerText = "Upload blocked. Awaiting valid CSV file.";
        csvInput.value = ""; // Reset the input box
        return;
    }

    statusText.innerText = "Parsing CSV locally...";

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            cachedCsvData = results.data;

            // --- NEW: Populate Column Dropdowns ---
            const headers = results.meta.fields; // PapaParse extracts the column headers
            xColSelect.innerHTML = '';
            yColSelect.innerHTML = '';

            headers.forEach(header => {
                xColSelect.innerHTML += `<option value="${header}">${header}</option>`;
                yColSelect.innerHTML += `<option value="${header}">${header}</option>`;
            });

            // Set sensible defaults (assume Col 0 is Date, Col 1 is Value)
            if (headers.length >= 2) {
                xColSelect.selectedIndex = 0;
                yColSelect.selectedIndex = 1;
            }

            controlsDiv.style.display = "flex";
            runPythonAnalysis();
        }
    });
});

recalcBtn.addEventListener('click', function() {
    if (!cachedCsvData) return;
    runPythonAnalysis();
});

function runPythonAnalysis() {
    statusText.innerText = "Crunching numbers in Python...";
    recalcBtn.innerText = "Calculating...";
    recalcBtn.disabled = true;

    const tLength = parseInt(document.getElementById('paramTurnLength').value);
    const bNum = parseInt(document.getElementById('paramBootNum').value);
    const cLimit = parseFloat(document.getElementById('paramConfLimit').value);

    // Grab the user's selected column names
    const xCol = xColSelect.value;
    const yCol = yColSelect.value;

    pythonWorker.postMessage({
        command: "process_csv",
        data: cachedCsvData,
        params: {
            turn_length: tLength,
            boot_num: bNum,
            conf_limit: cLimit,
            x_col: xCol, // Send selected columns to Python
            y_col: yCol
        }
    });
}

function drawPlotlyChart(data) {
    statsDiv.innerText = `Analysis Complete: Found ${data.step_count} distinct stages.`;

    const rawTrace = {
        x: data.dates, y: data.raw_values, mode: 'lines+markers',
        name: 'All Points', line: { color: 'firebrick', width: 1 }, marker: { size: 4 }
    };
    const cusumTrace = {
        x: data.dates, y: data.cusum_values, mode: 'lines',
        name: 'Cusum', yaxis: 'y2', line: { color: 'green', width: 1 }
    };
    const stepTrace = {
        x: data.stage_dates, y: data.stage_means, mode: 'lines+markers',
        name: 'SM - Stage Mean %CL', text: data.confleveltext, hoverinfo: 'text+x',
        line: { color: 'blue', width: 3 }, marker: { color: 'blue', size: 6 }
    };

    const layout = {
        title: 'Step Change Analysis',
        xaxis: { title: 'Date / Observation' },
        yaxis: { title: 'Value', side: 'left' },
        yaxis2: { title: 'Cusum', overlaying: 'y', side: 'right', showgrid: false },
        hovermode: 'closest'
    };

    Plotly.newPlot(chartContainer, [rawTrace, cusumTrace, stepTrace], layout);
}