/**
 * worker.js - Pure JavaScript SPC Analysis Engine
 * StepChangeAnalysis.com
 *
 * Complete replacement for Pyodide/Python version.
 * Zero external dependencies. Works offline, behind proxies,
 * and on air-gapped machines from first load.
 *
 * Identical input/output interface to previous Python version —
 * app.js requires NO changes.
 *
 * Algorithms implemented:
 *   - Bootstrap CUSUM step-change detection (Taylor, 2000)
 *   - Shewhart X-mR control chart (2.66 * mean moving range)
 *   - Run chart with 6+ shift detection
 *   - Stage means, UCL/LCL, confidence levels
 *   - Date parsing (UK DD/MM/YYYY, US MM/DD/YYYY, ISO, auto-detect)
 */

// Signal ready immediately — no download needed
self.postMessage({ status: "ready" });

// ─────────────────────────────────────────────
// MESSAGE HANDLER
// ─────────────────────────────────────────────
self.onmessage = function(event) {
    if (event.data.command === "process_csv") {
        try {
            const result = processCSV(
                event.data.data,
                event.data.params
            );
            self.postMessage({ status: "result", data: result });
        } catch (err) {
            self.postMessage({ status: "error", data: err.message });
        }
    }
};

// ─────────────────────────────────────────────
// MAIN ENTRY POINT
// ─────────────────────────────────────────────
function processCSV(rawData, params) {
    const {
        x_col,
        y_col,
        date_format,
        start_date,
        end_date,
        turn_length,
        boot_num,
        conf_limit
    } = params;

    // 1. Parse and clean data
    let rows = parseAndClean(rawData, x_col, y_col, date_format);

    // 2. Apply date filters
    if (start_date && start_date.trim() !== "") {
        const sd = new Date(start_date);
        rows = rows.filter(r => r.date >= sd);
    }
    if (end_date && end_date.trim() !== "") {
        const ed = new Date(end_date);
        rows = rows.filter(r => r.date <= ed);
    }

    if (rows.length < 5) {
        throw new Error("Dataset too small after cleaning or filtering (Need at least 5 points).");
    }

    const dates = rows.map(r => formatDateISO(r.date));
    const rawValues = rows.map(r => r.value);

    // 3. Bootstrap CUSUM step-change detection
    const cusumResult = manhatten(rawValues, turn_length, boot_num, conf_limit);

    // 4. Build stage means dataframe
    const stageData = buildStageMeans(cusumResult.stages, rawValues, dates);

    // 5. Global CUSUM line
    const globalMean = mean(rawValues);
    const cusumValues = computeCUSUM(rawValues, globalMean);

    // 6. Run chart shift detection
    const runResult = detectShifts(rawValues, dates);

    // 7. X-mR calculations
    const xmrResult = computeXmR(rawValues, globalMean);

    // 8. Summary statistics
    const globalSD = stddev(rawValues);

    return {
        dates,
        raw_values: rawValues,
        cusum_values: cusumValues,
        stage_dates: stageData.dates,
        stage_means: stageData.means,
        stage_ucl: stageData.ucl,
        stage_lcl: stageData.lcl,
        confleveltext: stageData.confleveltext,
        step_count: cusumResult.stages.length,
        run_median: median(rawValues),
        global_count: rawValues.length,
        global_mean: round2(globalMean),
        global_sd: round2(globalSD),
        shift_above_dates: runResult.aboveDates,
        shift_above_values: runResult.aboveValues,
        shift_below_dates: runResult.belowDates,
        shift_below_values: runResult.belowValues,
        xmr_unpl: xmrResult.unpl,
        xmr_lnpl: xmrResult.lnpl,
        mr_values: xmrResult.mrValues,
        mr_mean: xmrResult.mrMean,
        mr_url: xmrResult.mrUrl
    };
}

// ─────────────────────────────────────────────
// DATE PARSING
// ─────────────────────────────────────────────
function parseDate(str, format) {
    if (!str || str.trim() === "") return null;
    str = str.trim();

    // ── Year only: "1949", "2024" ──
    // Treat as 1st January of that year
    if (/^\d{4}$/.test(str) && (format === "yyyy" || format === "auto")) {
        const y = parseInt(str, 10);
        const d = new Date(y, 0, 1);
        return isNaN(d.getTime()) ? null : d;
    }

    // ── Year-Month ISO: "2024-04" ──
    // Treat as 1st day of that month
    if (/^\d{4}-\d{2}$/.test(str) && (format === "yyyy-mm" || format === "auto")) {
        const parts = str.split('-');
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1);
        return isNaN(d.getTime()) ? null : d;
    }

    // ── Year-Month UK: "04/2024" or "04-2024" ──
    // Treat as 1st day of that month
    if (/^\d{1,2}[\/\-]\d{4}$/.test(str) && (format === "mm/yyyy" || format === "auto")) {
        const parts = str.split(/[\/\-]/);
        const d = new Date(parseInt(parts[1], 10), parseInt(parts[0], 10) - 1, 1);
        return isNaN(d.getTime()) ? null : d;
    }

    // ── ISO format YYYY-MM-DD (always unambiguous) ──
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
        const d = new Date(str);
        return isNaN(d) ? null : d;
    }

    // ── Full date: DD/MM/YYYY, MM/DD/YYYY, or auto-detect ──
    const parts = str.split(/[\/\-\.\s]/);
    if (parts.length < 3) return null;

    let day, month, year;

    if (format === "dd/mm/yyyy") {
        day   = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10) - 1;
        year  = parseInt(parts[2], 10);
    } else if (format === "mm/dd/yyyy") {
        month = parseInt(parts[0], 10) - 1;
        day   = parseInt(parts[1], 10);
        year  = parseInt(parts[2], 10);
    } else if (format === "yyyy-mm-dd") {
        year  = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10) - 1;
        day   = parseInt(parts[2], 10);
    } else {
        // Auto-detect: if first part > 12 it must be day (DD/MM)
        const p0 = parseInt(parts[0], 10);
        const p1 = parseInt(parts[1], 10);
        if (p0 > 12) {
            // Unambiguously DD/MM/YYYY
            day = p0; month = p1 - 1;
        } else if (p1 > 12) {
            // Unambiguously MM/DD/YYYY
            month = p0 - 1; day = p1;
        } else {
            // Ambiguous — default to DD/MM/YYYY (UK convention)
            day = p0; month = p1 - 1;
        }
        year = parseInt(parts[2], 10);
    }

    // Handle 2-digit years
    if (year < 100) year += year < 50 ? 2000 : 1900;

    const d = new Date(year, month, day);
    return isNaN(d.getTime()) ? null : d;
}

function formatDateISO(d) {
    // Returns YYYY-MM-DD 00:00:00 to match previous Python strftime output
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day} 00:00:00`;
}

// ─────────────────────────────────────────────
// DATA PARSING AND CLEANING
// ─────────────────────────────────────────────
function parseAndClean(rawData, xCol, yCol, dateFormat) {
    const rows = [];
    for (const row of rawData) {
        const rawDate = row[xCol];
        const rawVal  = row[yCol];
        if (!rawDate || !rawVal) continue;

        const d = parseDate(String(rawDate), dateFormat);
        if (!d) continue;

        // Handle European comma decimals and thousands separators
        let valStr = String(rawVal).trim()
            .replace(/\s/g, '')
            .replace(/,(?=\d{3})/g, '')  // thousands comma: 1,234
            .replace(',', '.');           // European decimal: 1,5 → 1.5

        const v = parseFloat(valStr);
        if (isNaN(v)) continue;

        rows.push({ date: d, value: v });
    }

    // Sort chronologically
    rows.sort((a, b) => a.date - b.date);
    return rows;
}

// ─────────────────────────────────────────────
// BOOTSTRAP CUSUM — Core Algorithm
// Direct translation of Python manhatten_clean()
// ─────────────────────────────────────────────
function manhatten(values, turnLength, bootNum, confLimit) {
    const n = values.length;

    // cusum_control table — mirrors Python's DataFrame structure exactly.
    // Each row represents a segment (firstIndex to lastIndex).
    // 'expanded' = 'y' means this segment was split and should be ignored
    // in the final stage output.
    const cusumControl = [{
        firstIndex: 0,
        lastIndex: n - 1,
        conflevel: null,
        expanded: ''
    }];

    // fog = the processing queue. Mirrors Python's fog list exactly.
    // Starts with [0] meaning "process row 0 of cusumControl first".
    const fog = [0];
    let countr = 0;  // counts how many new rows have been added
    let i = 0;       // current position in fog queue

    while (i < fog.length) {
        const x = fog[i];  // x = row index in cusumControl to process now

        // Mirror Python exactly:
        // idx_start = firstindex + (1 if x > 1 else 0)
        // x > 1 means: skip boundary point for all segments except
        // the very first (x=0) and second (x=1) entries processed
        const idxStart = cusumControl[x].firstIndex + (x > 1 ? 1 : 0);
        const idxEnd   = cusumControl[x].lastIndex;

        // Segment too short — skip (mirrors Python's len(dx) == 0 check
        // and the turn_length guard)
        if ((idxEnd - idxStart) <= turnLength) {
            i++;
            continue;
        }

        // Extract segment values
        const dx = values.slice(idxStart, idxEnd + 1);
        const pMean = mean(dx);

        // Compute CUSUM for this segment
        const cusum = computeCUSUM(dx, pMean);
        const cusumMax = Math.max(...cusum);
        const cusumMin = Math.min(...cusum);
        const sdiff = cusumMax - cusumMin;

        // Find turn point (index of most extreme CUSUM value)
        let turnOffset;
        if (Math.abs(cusumMax) >= Math.abs(cusumMin)) {
            turnOffset = cusum.indexOf(cusumMax);
        } else {
            turnOffset = cusum.indexOf(cusumMin);
        }
        // Convert local offset back to absolute index in full dataset
        const turnPt = idxStart + turnOffset;

        // Bootstrap confidence test
        const conf = bootstrapConfidence(dx, pMean, sdiff, bootNum);

        // Mirror Python condition: conf >= conflimit AND turnpt != z
        // z = idxStart (the start of this segment)
        if (conf >= confLimit && turnPt !== idxStart) {

            // Add two new rows to cusumControl (the split segments)
            cusumControl.push({
                firstIndex: cusumControl[x].firstIndex,
                lastIndex: turnPt,
                conflevel: conf,
                expanded: ''
            });
            cusumControl.push({
                firstIndex: turnPt,
                lastIndex: cusumControl[x].lastIndex,
                conflevel: conf,
                expanded: ''
            });

            // Add their indices to the fog queue
            fog.push(countr + 1, countr + 2);
            countr += 2;

            // Mark current segment as expanded (excluded from final output)
            cusumControl[x].expanded = 'y';
        }

        i++;
    }

    // Final stages = all non-expanded rows, sorted chronologically
    const finalSegs = cusumControl
        .filter(s => s.expanded !== 'y')
        .sort((a, b) => a.firstIndex - b.firstIndex);

    return { stages: finalSegs };
}

// ─────────────────────────────────────────────
// BOOTSTRAP CONFIDENCE CALCULATION
// ─────────────────────────────────────────────
function bootstrapConfidence(slice, segMean, sdiff, bootNum) {
    // IMPORTANT: Python original calls np.random.permutation TWICE per
    // iteration — once for the max, once for the min — using two independent
    // random permutations. We replicate this exactly to match Python results.
    //
    // Python:
    //   np.max(np.cumsum(np.random.permutation(raw) - mean))
    //   - np.min(np.cumsum(np.random.permutation(raw) - mean))
    let count = 0;
    for (let b = 0; b < bootNum; b++) {
        // First permutation for max
        const perm1 = shuffle([...slice]);
        const cs1 = computeCUSUM(perm1, segMean);
        const bMax = Math.max(...cs1);

        // Second independent permutation for min (matches Python exactly)
        const perm2 = shuffle([...slice]);
        const cs2 = computeCUSUM(perm2, segMean);
        const bMin = Math.min(...cs2);

        if ((bMax - bMin) > sdiff) count++;
    }
    return 100 * (bootNum - count) / bootNum;
}

// Fisher-Yates shuffle — unbiased random permutation
function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ─────────────────────────────────────────────
// CUSUM COMPUTATION
// ─────────────────────────────────────────────
function computeCUSUM(values, refMean) {
    const result = [];
    let cumSum = 0;
    for (const v of values) {
        cumSum += (v - refMean);
        result.push(round2(cumSum));
    }
    return result;
}

// ─────────────────────────────────────────────
// STAGE MEANS — builds the step-mean line
// Equivalent to Python stagemeans_clean()
// ─────────────────────────────────────────────
function buildStageMeans(stages, values, dates) {
    const outDates = [];
    const outMeans = [];
    const outUCL   = [];
    const outLCL   = [];
    const outText  = [];

    for (let i = 0; i < stages.length; i++) {
        const seg = stages[i];
        const slice = values.slice(seg.firstIndex, seg.lastIndex + 1);
        if (slice.length === 0) continue;

        const sMean = round2(mean(slice));
        const sSD   = slice.length > 1 ? round2(stddev(slice)) : 0;
        const ucl   = round2(sMean + 3 * sSD);
        const lcl   = round2(sMean - 3 * sSD);
        const conf  = seg.conflevel !== null ? round2(seg.conflevel) : 100.0;

        const txt = i === 0
            ? `Mean: ${sMean}<br>SD: ${sSD}`
            : `Mean: ${sMean}<br>SD: ${sSD}<br>Conf: ${conf}%`;

        // Two points per stage (start and end) to draw horizontal step line
        outDates.push(dates[seg.firstIndex], dates[seg.lastIndex]);
        outMeans.push(sMean, sMean);
        outUCL.push(ucl, ucl);
        outLCL.push(lcl, lcl);
        outText.push(txt, ' ');
    }

    return {
        dates: outDates,
        means: outMeans,
        ucl: outUCL,
        lcl: outLCL,
        confleveltext: outText
    };
}

// ─────────────────────────────────────────────
// X-mR CHART CALCULATIONS
// ─────────────────────────────────────────────
function computeXmR(values, globalMean) {
    const mrValues = [null]; // First point has no moving range
    for (let i = 1; i < values.length; i++) {
        mrValues.push(round2(Math.abs(values[i] - values[i - 1])));
    }

    const mrNonNull = mrValues.filter(v => v !== null);
    const mrMean = mean(mrNonNull);

    return {
        unpl:     round2(globalMean + 2.66 * mrMean),
        lnpl:     round2(globalMean - 2.66 * mrMean),
        mrValues: mrValues,
        mrMean:   round2(mrMean),
        mrUrl:    round2(3.267 * mrMean)
    };
}

// ─────────────────────────────────────────────
// RUN CHART — 6+ shift detection above/below median
// ─────────────────────────────────────────────
function detectShifts(values, dates) {
    const med = median(values);
    const aboveDates = [], aboveValues = [];
    const belowDates = [], belowValues = [];

    let currSign = 0;
    let runIndices = [];

    function flushRun() {
        if (runIndices.length >= 6) {
            for (const idx of runIndices) {
                if (currSign === 1) {
                    aboveDates.push(dates[idx]);
                    aboveValues.push(values[idx]);
                } else if (currSign === -1) {
                    belowDates.push(dates[idx]);
                    belowValues.push(values[idx]);
                }
            }
        }
    }

    for (let i = 0; i < values.length; i++) {
        if (values[i] === med) continue;
        const s = values[i] > med ? 1 : -1;
        if (s === currSign) {
            runIndices.push(i);
        } else {
            flushRun();
            currSign = s;
            runIndices = [i];
        }
    }
    flushRun(); // Don't forget the last run

    return { aboveDates, aboveValues, belowDates, belowValues };
}

// ─────────────────────────────────────────────
// STATISTICS UTILITIES
// ─────────────────────────────────────────────
function mean(arr) {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function median(arr) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stddev(arr) {
    if (arr.length < 2) return 0;
    const m = mean(arr);
    const variance = arr.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / (arr.length - 1);
    return Math.sqrt(variance);
}

function round2(v) {
    return Math.round(v * 100) / 100;
}