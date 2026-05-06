// app.js
const pythonWorker = new Worker('worker.js');
const csvInput = document.getElementById('csvInput');
const statusText = document.getElementById('statusText');
const chartContainer = document.getElementById('chart-container');
const statsDiv = document.getElementById('stats');
const controlsDiv = document.getElementById('controls');
const recalcBtn = document.getElementById('recalcBtn');

const xColSelect = document.getElementById('xColSelect');
const yColSelect = document.getElementById('yColSelect');
const dateFormatSelect = document.getElementById('dateFormatSelect');

let cachedCsvData = null;
csvInput.value = "";

pythonWorker.onmessage = function(event) {
    const message = event.data;
    if (message.status === "ready") {
        statusText.innerText = "Python Engine is ready! Select a CSV.";
        csvInput.disabled = false;
    } else if (message.status === "result") {
        statusText.innerText = "Analysis Complete!";
        recalcBtn.innerText = "Recalculate Chart";
        recalcBtn.disabled = false;
        drawPlotlyChart(message.data);
    } else if (message.status === "error") {
        statusText.innerText = "Error: " + message.data;
        recalcBtn.disabled = false;
        recalcBtn.innerText = "Recalculate Chart";
    }
};

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

recalcBtn.addEventListener('click', runPythonAnalysis);

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

function drawPlotlyChart(data) {
    statsDiv.innerText = `Found ${data.step_count} distinct stages.`;
    const title = document.getElementById('chartTitleInput').value;

    const traces = [
        { x: data.dates, y: data.raw_values, mode: 'lines+markers', name: 'All Points', line: { color: 'firebrick', width: 1 }, marker: { size: 4 } },
        { x: data.dates, y: data.cusum_values, mode: 'lines', name: 'Cusum', yaxis: 'y2', line: { color: 'green', width: 1 } },
        { x: data.stage_dates, y: data.stage_means, mode: 'lines+markers', name: 'SM - Stage Mean', text: data.confleveltext, hoverinfo: 'text+x', line: { color: 'blue', width: 3 } }
    ];

    const layout = {
        title: title,
        xaxis: { title: 'Date' },
        yaxis: { title: 'Value', side: 'left' },
        yaxis2: { title: 'Cusum', overlaying: 'y', side: 'right', showgrid: false },
        hovermode: 'closest'
    };

    Plotly.newPlot(chartContainer, traces, layout);
}