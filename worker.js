/**
 * StepChangeAnalysis.com — Bootstrap CUSUM SPC Tool
 * Copyright © Syd Stewart / StepChangeAnalysis.com 2026
 * All rights reserved.
 *
 * This file contains proprietary statistical algorithms implementing
 * Bootstrap CUSUM step-change analysis. Unauthorised copying, modification,
 * distribution or use of this code, in whole or in part, without the express
 * written permission of the author is strictly prohibited.
 *
 * The Bootstrap CUSUM algorithm was originally developed in Python and
 * converted to JavaScript for browser-based execution. The intellectual
 * property in the algorithm design and implementation belongs to the author.
 */


/**
 * TEST-ONLY CORRECTED CANDIDATE — NOT FOR WEBSITE UPLOAD.
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
// The data's display precision applies only within one analysis: it is reset
// afterwards, however the analysis ends, so nothing carries over to the next.
function processCSV(rawData, params) {
    try {
        return processCSVInner(rawData, params);
    } finally {
        DISPLAY_MIN_DEC = 2;
        clearRandomSeed();
    }
}

// ─────────────────────────────────────────────
// REPRODUCIBLE RANDOM NUMBERS (FMEA BS-02, OUT-04)
// ─────────────────────────────────────────────
// Every analysis uses its own seeded generator, so any result can be
// regenerated exactly from its seed and settings. Generator: xoshiro128**
// (Blackman and Vigna), seeded through a SplitMix-style mixer.
// Outside an analysis (for example in tests calling functions directly)
// Math.random is used.
const ANALYSER_VERSION = 'R4';
let seededRandom = null;

// xoshiro128** core: returns 32-bit unsigned integers from state (a, b, c, d).
function makeXoshiro128ss(a, b, c, d) {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    return function () {
        const result = Math.imul(rotl(Math.imul(b, 5) >>> 0, 7), 9) >>> 0;
        const t = (b << 9) >>> 0;
        c = (c ^ a) >>> 0; d = (d ^ b) >>> 0; b = (b ^ c) >>> 0; a = (a ^ d) >>> 0;
        c = (c ^ t) >>> 0;
        d = rotl(d, 11);
        return result;
    };
}
// Seeded generator of numbers on [0, 1): the 32-bit seed is expanded into the
// four state words with a SplitMix-style mixer (MurmurHash3 finaliser).
function makeSeededRandom(seed) {
    let x = seed >>> 0;
    function mix() {
        x = (x + 0x9E3779B9) >>> 0;
        let z = x;
        z = Math.imul(z ^ (z >>> 16), 0x85EBCA6B) >>> 0;
        z = Math.imul(z ^ (z >>> 13), 0xC2B2AE35) >>> 0;
        return (z ^ (z >>> 16)) >>> 0;
    }
    const next = makeXoshiro128ss(mix(), mix(), mix(), mix());
    return () => next() / 4294967296;
}
function rotl(v, k) { return ((v << k) | (v >>> (32 - k))) >>> 0; }

function newSeed() {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        return crypto.getRandomValues(new Uint32Array(1))[0];
    }
    return Math.floor(Math.random() * 4294967296);
}
function validSeed(s) {
    const n = typeof s === 'string' && s.trim() !== '' ? Number(s) : s;
    return Number.isInteger(n) && n >= 0 && n <= 4294967295 ? n : null;
}
function setRandomSeed(seed) { seededRandom = makeSeededRandom(seed); return seed; }
function clearRandomSeed() { seededRandom = null; }
function random() { return seededRandom ? seededRandom() : Math.random(); }

// Short fingerprint of the data actually analysed (dates and values after
// cleaning and filtering): FNV-1a, 32-bit, shown as 8 hex digits.
function dataFingerprint(dates, values) {
    let h = 0x811C9DC5;
    const text = dates.map((d, i) => d + '=' + values[i]).join('|');
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
}

function processCSVInner(rawData, params) {
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

    // 0. Random seed: the one supplied, or a new one, always returned
    if (params.seed !== undefined && params.seed !== null && params.seed !== '' && validSeed(params.seed) === null)
        throw new Error("Seed must be a whole number from 0 to 4294967295, or left blank.");
    const seed = validSeed(params.seed) !== null ? validSeed(params.seed) : newSeed();
    setRandomSeed(seed);

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

    setDisplayDecimals(rows);
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
        display_decimals: DISPLAY_MIN_DEC,
        global_mean: roundDisplay(globalMean),
        global_sd: roundDisplay(globalSD),
        shift_above_dates: runResult.aboveDates,
        shift_above_values: runResult.aboveValues,
        shift_below_dates: runResult.belowDates,
        shift_below_values: runResult.belowValues,
        xmr_unpl: xmrResult.unpl,
        xmr_lnpl: xmrResult.lnpl,
        xmr_lnpl_applies: xmrResult.lnplApplies,
        mr_values: xmrResult.mrValues,
        mr_mean: xmrResult.mrMean,
        mr_url: xmrResult.mrUrl,
        stage_confidence: [...cusumResult.stages].sort((p, q) => p.firstIndex - q.firstIndex).map(st => st.conflevel),
        // Everything needed to reproduce this result exactly
        seed,
        settings: { x_col, y_col, date_format, start_date: start_date || '', end_date: end_date || '',
                    turn_length, boot_num, conf_limit },
        data_fingerprint: dataFingerprint(dates, rawValues),
        analyser_version: ANALYSER_VERSION
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

        // Decimal places as recorded, used to set display precision
        const decMatch = /e/i.test(valStr) ? null : valStr.match(/\.(\d+)$/);
        rows.push({ date: d, value: v, decimals: decMatch ? decMatch[1].length : 0 });
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
    // Reject invalid inputs rather than silently producing misleading stages.
    if (!Array.isArray(values) || values.some(v => !Number.isFinite(v)))
        throw new Error("Values must all be finite numbers.");
    const n = values.length;
    if (!Number.isInteger(turnLength) || turnLength < 1)
        throw new Error("Turn Length must be a positive whole number.");
    if (!Number.isSafeInteger(bootNum) || bootNum < 1)
        throw new Error("Loops must be a positive whole number.");
    if (!Number.isFinite(confLimit) || confLimit <= 0 || confLimit >= 100)
        throw new Error("Conf % must be greater than 0 and less than 100.");
    if (confLimit <= 1)
        throw new Error(`Conf % is a percentage: enter 95 for 95%, not ${confLimit}.`);
    if (confLimit < 50)
        throw new Error("Conf % must be at least 50. Values below 50% would report most random variation as change.");
    if (turnLength >= n - 1)
        throw new Error(`Turn Length (${turnLength}) must be smaller than the number of data points minus one (${n - 1}); otherwise no change can be tested.`);
    const minTail = 1 / (bootNum + 1);
    if (minTail > (1 - confLimit / 100) + 1e-15)
        throw new Error("Too few loops for this confidence threshold with the finite-shuffle correction. Increase Loops.");

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

        // Stages have disjoint, inclusive bounds; no boundary-point skip is needed.
        const idxStart = cusumControl[x].firstIndex;
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
        const cusum = computeCUSUMTestPrecision(dx, pMean);
        const ext = cusumExtremes(cusum);          // includes S0 = 0 explicitly
        const cusumMax = ext.max;
        const cusumMin = ext.min;
        const sdiff = cusumMax - cusumMin;

        // Find turn point (index of most extreme CUSUM value; -1 means S0)
        const turnOffset = Math.abs(cusumMax) >= Math.abs(cusumMin) ? ext.maxIndex : ext.minIndex;
        // Convert local offset back to absolute index in full dataset
        const turnPt = idxStart + turnOffset;

        // Bootstrap confidence test
        const conf = bootstrapConfidence(dx, pMean, sdiff, bootNum);

        // Keep both children nonempty and retain the existing start-point guard.
        if (conf >= confLimit && turnPt > idxStart && turnPt < idxEnd) {

            // Add two new rows to cusumControl (the split segments)
            cusumControl.push({
                firstIndex: cusumControl[x].firstIndex,
                lastIndex: turnPt,
                conflevel: conf,
                expanded: ''
            });
            cusumControl.push({
                firstIndex: turnPt + 1,
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
function bootstrapConfidence(data, dataMean, observedRange, loops) {
    let exceedances = 0;

    for (let i = 0; i < loops; i++) {
        // Create one shuffled CUSUM path per iteration.
        const shuffledCusum = computeCUSUMTestPrecision(
            shuffle([...data]),
            dataMean
        );

        // Take both extremes from that same path (S0 = 0 included).
        const e = cusumExtremes(shuffledCusum);
        const bootstrapRange = e.max - e.min;

        if (testAtLeastAsExtreme(bootstrapRange, observedRange, data, dataMean)) {
            exceedances++;
        }
    }

    // Sampled permutations: include the observed arrangement once in the
    // Monte Carlo tail estimate. This avoids treating zero sampled tail
    // excursions as zero probability. It does not correct serial dependence.
    return 100 * (1 - (exceedances + 1) / (loops + 1));
}

// Fisher-Yates shuffle — unbiased random permutation
function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// TEST-ONLY prototype: retain full precision for statistical decisions.
// The original display-oriented computeCUSUM remains unchanged.
function computeCUSUMTestPrecision(values, refMean) {
    let total = 0;
    return values.map(v => (total += v - refMean));
}

// Experimental tolerance for floating-point comparisons; requires review.
function testAtLeastAsExtreme(range, observed, data, dataMean) {
    // Conservative relative tolerance guards against treating a numerical tie
    // as smaller. This policy remains subject to independent statistical review.
    let scale = Math.abs(observed);
    for (const v of data) { const d = Math.abs(v - dataMean); if (d > scale) scale = d; }
    const tolerance = 64 * Number.EPSILON * data.length * scale;
    return range >= observed - tolerance;
}

// ─────────────────────────────────────────────
// CUSUM COMPUTATION
// ─────────────────────────────────────────────
function computeCUSUM(values, refMean) {
    const result = [];
    let cumSum = 0;
    for (const v of values) {
        cumSum += (v - refMean);
        result.push(roundDisplay(cumSum));
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

        // Calculate bands before rounding for display.
        const rawMean = mean(slice);
        const rawSD = slice.length > 1 ? stddev(slice) : 0;
        const sMean = roundDisplay(rawMean);
        const sSD = roundDisplay(rawSD);
        const ucl = roundDisplay(rawMean + 3 * rawSD);
        const lcl = roundDisplay(rawMean - 3 * rawSD);

        // A child inherits its parent's split statistic; it is not an
        // independent stage confidence. Withhold it from chart/table output.
        const txt = `Mean: ${sMean}<br>SD: ${sSD}`;

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
    // Moving ranges are averaged unrounded (FMEA OUT-02); rounding is for display only.
    const mrRaw = [];
    for (let i = 1; i < values.length; i++) mrRaw.push(Math.abs(values[i] - values[i - 1]));
    const mrMean = mean(mrRaw);
    const mrValues = [null].concat(mrRaw.map(roundDisplay)); // First point has no moving range

    // A lower limit below zero has no meaning when every value is zero or more
    // (counts, totals, times): report that there is no lower limit (FMEA OUT-07).
    const lnplRaw = globalMean - 2.66 * mrMean;
    const lnplApplies = !(lnplRaw < 0 && values.every(v => v >= 0));
    return {
        unpl:     roundDisplay(globalMean + 2.66 * mrMean),
        lnpl:     roundDisplay(lnplRaw),
        lnplApplies,
        mrValues: mrValues,
        mrMean:   roundDisplay(mrMean),
        mrUrl:    roundDisplay(3.267 * mrMean)
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
    // Shifted, compensated mean: accurate for values with a large common
    // offset (e.g. around 1e9), where a plain running sum loses digits.
    if (arr.length === 0) return 0;
    const shift = arr[0];
    let sum = 0, comp = 0;
    for (const v of arr) {
        const y = (v - shift) - comp;
        const t = sum + y;
        comp = (t - sum) - y;
        sum = t;
    }
    return shift + sum / arr.length;
}

// Maximum and minimum of a CUSUM path S1..Sn with S0 = 0 included explicitly.
// maxIndex / minIndex give the first position in S1..Sn holding that value,
// or -1 when the extreme is S0 alone. Uses loops, not array spreads, so it
// works for series of any length.
function cusumExtremes(S) {
    let max = 0, min = 0, maxIndex = -1, minIndex = -1;
    for (let i = 0; i < S.length; i++) {
        const v = S[i];
        if (v > max || (v === max && maxIndex === -1 && v === 0)) { max = v; maxIndex = i; }
        if (v < min || (v === min && minIndex === -1 && v === 0)) { min = v; minIndex = i; }
    }
    return { max, min, maxIndex, minIndex };
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

// Rounding for display (FMEA CU-03, OUT-01). A result is shown with:
//   - never fewer decimal places than the data typically has (DISPLAY_MIN_DEC,
//     the median decimal places of the values as recorded, capped at 6);
//   - never fewer than 2 decimal places;
//   - at least 3 significant figures.
// Data with 0-2 decimal places therefore looks exactly as before (23.22);
// small values keep their digits (0.0803, not 0.08); values recorded to
// 3 decimals (10.004) are shown to at least 3.
let DISPLAY_MIN_DEC = 2;
function setDisplayDecimals(rows) {
    const d = rows.map(r => r.decimals || 0).sort((a, b) => a - b);
    DISPLAY_MIN_DEC = d.length ? Math.min(6, Math.max(2, d[Math.floor(d.length / 2)])) : 2;
    return DISPLAY_MIN_DEC;
}
function displayDecimals(v) {
    if (!Number.isFinite(v) || v === 0) return DISPLAY_MIN_DEC;
    const mag = Math.floor(Math.log10(Math.abs(v)));
    return Math.min(10, Math.max(DISPLAY_MIN_DEC, 2 - mag));
}
function roundDisplay(v) {
    if (!Number.isFinite(v)) return v;
    const f = Math.pow(10, displayDecimals(v));
    return Math.round(v * f) / f;
}

