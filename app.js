// app.js

const pythonWorker = new Worker('worker.js');
const csvInput = document.getElementById('csvInput');
const statusText = document.getElementById('statusText');
const chartContainer = document.getElementById('chart-container');
const statsDiv = document.getElementById('stats');

// THE FIX: Force the browser to clear the file input on page load.
// This prevents the browser from silently holding onto the file after a page refresh.
csvInput.value = "";

// 1. Listen for messages from the background worker
pythonWorker.onmessage = function(event) {
    const message = event.data;

    if (message.status === "ready") {
        statusText.innerText = "Python Engine is ready! Select a CSV.";
        csvInput.disabled = false; // Enable the file upload
    }
    else if (message.status === "result") {
        // Python finished the math!
        const chartData = message.data;
        statusText.innerText = "Analysis Complete!";

        // Draw the chart
        drawPlotlyChart(chartData);
    }
    else if (message.status === "error") {
        statusText.innerText = "Error: " + message.data;
        console.error("Worker Error:", message.data);
    }
};

// 2. Listen for a file upload
csvInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    statusText.innerText = "Parsing CSV locally...";

    // 3. Use PapaParse to read the file locally
    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            statusText.innerText = "Crunching numbers in Python (this may take a few seconds)...";

            // Send the parsed array to the Python worker
            pythonWorker.postMessage({
                command: "process_csv",
                data: results.data
            });
        }
    });
});

// 4. Draw the Plotly Chart
function drawPlotlyChart(data) {
    // Update the UI with the number of steps found
    statsDiv.innerText = `Analysis Complete: Found ${data.step_count} distinct stages.`;

    // Trace 1: The Raw Data Points
    const rawTrace = {
        x: data.dates,
        y: data.raw_values,
        mode: 'lines+markers',
        name: 'All Points',
        line: { color: 'firebrick', width: 1 },
        marker: { size: 4 }
    };

    // Trace 2: The CUSUM Line (Mapped to a secondary right-side axis)
    const cusumTrace = {
        x: data.dates,
        y: data.cusum_values,
        mode: 'lines',
        name: 'Cusum',
        yaxis: 'y2', // This tells Plotly to use the secondary axis
        line: { color: 'green', width: 1 }
    };

    // Trace 3: The Manhatten Step Chart
    const stepTrace = {
        x: data.stage_dates,
        y: data.stage_means,
        mode: 'lines+markers',
        name: 'SM - Stage Mean %CL',
        text: data.confleveltext, // Hover text from Python
        hoverinfo: 'text+x',
        line: { color: 'blue', width: 3 },
        marker: { color: 'blue', size: 6 }
    };

    // Layout configuration
    const layout = {
        title: 'Step Change Analysis',
        xaxis: { title: 'Date / Observation' },
        yaxis: {
            title: 'Value',
            side: 'left'
        },
        yaxis2: {
            title: 'Cusum',
            overlaying: 'y',
            side: 'right', // Put CUSUM on the right side
            showgrid: false
        },
        hovermode: 'closest'
    };

    // Render the chart!
    Plotly.newPlot(chartContainer, [rawTrace, cusumTrace, stepTrace], layout);
}