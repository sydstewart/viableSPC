/* StepChange Analyzer: shared data module (FMEA action A1/A2).
 *
 * One set of rules for reading values and dates, used by the analysis
 * (worker.js) and by the page (app.js), so the two can never disagree.
 * Loaded with importScripts in the worker and a <script> tag in the page.
 *
 *   DataCore.parseNumber(text, format)      -> { kind: 'ok'|'censored'|'rejected', value, side, reason, flags }
 *   DataCore.detectNumberFormat(texts)      -> { format: 'uk'|'eu'|'ambiguous'|'mixed', examples }
 *   DataCore.parseDate(text, format, conv)  -> { date, reason, twoDigitYear }
 *   DataCore.detectDateConvention(texts)    -> { convention: 'dmy'|'mdy'|'ambiguous'|'mixed', examples }
 *   DataCore.prepareRows(rows, xCol, yCol, options)
 *        -> { rows, rejected, warnings, numberFormat, dateConvention }  or  { error: { type, message } }
 *   DataCore.findMissingPeriods(dates)      -> number of missing periods
 *
 * Choices (stage 5.1). prepareRows takes options.censored ('ask'|'exclude'|
 * 'limit'|'half'), options.combine ('ask'|'keep'|'sum'|'mean') with
 * options.combinePeriod ('date'|'week'|'month'), and options.missing
 * ('ask'|'zero'|'leave'). When a choice applies and is still 'ask', the result
 * lists it in choicesNeeded and the analysis waits for the user.
 */
var DataCore = (function () {
    'use strict';

    // ── Numbers ─────────────────────────────────────────────────────────
    // UK: 1,234.56   European: 1.234,56   (thousands groups must start 1-9)
    const UK_NUMBER = /^(?:[1-9]\d{0,2}(?:,\d{3})+|\d+)(?:\.\d+)?$/;
    const EU_NUMBER = /^(?:[1-9]\d{0,2}(?:\.\d{3})+|\d+)(?:,\d+)?$/;
    const SCIENTIFIC = /^\d+(?:\.\d+)?[eE][+-]?\d+$/;
    const CURRENCY_TEST = /^[£$€¥]|[£$€¥]$/;
    const CURRENCY_STRIP = /^[£$€¥]+|[£$€¥]+$/g;

    // Strip what surrounds the digits; remember what was removed.
    function unwrap(text) {
        let s = String(text == null ? '' : text).trim().replace(/[\u00A0\u2009\u202F ]/g, '');
        const flags = {};
        if (/^\(.*\)$/.test(s)) { s = s.slice(1, -1); flags.accounting = true; }
        s = s.replace(/[\u2212\u2012\u2013]/g, '-');            // Unicode minus and dashes
        let sign = '';
        if (/^[+-]/.test(s)) { sign = s[0] === '-' ? '-' : ''; s = s.slice(1); }
        if (CURRENCY_TEST.test(s)) { s = s.replace(CURRENCY_STRIP, ''); flags.currency = true; }
        if (/^[+-]/.test(s)) { sign = s[0] === '-' ? '-' : sign; s = s.slice(1); }  // £-5
        if (/%$/.test(s)) { s = s.slice(0, -1); flags.percent = true; }
        if (flags.accounting) sign = sign === '-' ? '' : '-';
        return { body: s, sign, flags };
    }

    function parseNumber(text, format) {
        const raw = String(text == null ? '' : text).trim();
        if (raw === '') return { kind: 'rejected', reason: 'blank value' };
        const cens = raw.match(/^(<=|>=|≤|≥|<|>)\s*(.+)$/);
        if (cens) {
            const inner = parseNumber(cens[2], format);
            if (inner.kind !== 'ok') return { kind: 'rejected', reason: `censored value "${raw}" could not be read` };
            return { kind: 'censored', side: /^(<|≤)/.test(cens[1]) ? 'below' : 'above', value: inner.value, decimals: inner.decimals };
        }
        const u = unwrap(raw);
        const b = u.body;
        let canonical = null;
        if ((format || 'uk') === 'eu') {
            if (EU_NUMBER.test(b)) canonical = b.replace(/\./g, '').replace(',', '.');
        } else {
            if (UK_NUMBER.test(b)) canonical = b.replace(/,/g, '');
        }
        if (canonical === null && SCIENTIFIC.test(b)) canonical = b;
        if (canonical === null) return { kind: 'rejected', reason: `"${raw}" is not a number in the ${format === 'eu' ? 'European' : 'UK'} number format` };
        const value = Number(u.sign + canonical);
        if (!Number.isFinite(value)) return { kind: 'rejected', reason: `"${raw}" is not a finite number` };
        const dm = /e/i.test(canonical) ? null : canonical.match(/\.(\d+)$/);
        return { kind: 'ok', value, decimals: dm ? dm[1].length : 0, flags: u.flags };
    }

    // Decide UK or European from the evidence in all the values.
    function detectNumberFormat(texts) {
        const uk = [], eu = [], amb = [];
        for (const t of texts) {
            const raw = String(t == null ? '' : t).trim();
            if (!raw) continue;
            const b = unwrap(raw.replace(/^(<=|>=|≤|≥|<|>)\s*/, '')).body;
            // £ and $ amounts follow UK/US conventions (1,234.56); Europe uses €
            if (/[£$]/.test(raw) && !/^\d+,\d{1,2}$/.test(b)) { uk.push(raw); continue; }
            const hasDot = b.includes('.'), hasComma = b.includes(',');
            if (hasDot && hasComma) { (b.lastIndexOf('.') > b.lastIndexOf(',') ? uk : eu).push(raw); continue; }
            if (hasComma) {
                if (/^\d{1,3}(,\d{3}){2,}$/.test(b)) uk.push(raw);
                else if (/^[1-9]\d{0,2},\d{3}$/.test(b)) amb.push(raw);
                else if (/^\d+,\d+$/.test(b)) eu.push(raw);           // 1,5   0,123   12,3456
                continue;
            }
            if (hasDot) {
                if (/^\d{1,3}(\.\d{3}){2,}$/.test(b)) eu.push(raw);
                else if (/^[1-9]\d{0,2}\.\d{3}$/.test(b)) amb.push(raw);
                else if (/^\d+\.\d+$/.test(b) || SCIENTIFIC.test(b)) uk.push(raw);   // 12.5   0.123
            }
        }
        if (uk.length && eu.length) return { format: 'mixed', examples: { uk: uk.slice(0, 3), eu: eu.slice(0, 3) } };
        if (uk.length) return { format: 'uk', examples: { uk: uk.slice(0, 3) } };
        if (eu.length) return { format: 'eu', examples: { eu: eu.slice(0, 3) } };
        if (amb.length) return { format: 'ambiguous', examples: { ambiguous: amb.slice(0, 3) } };
        return { format: 'uk', examples: {} };
    }

    // ── Dates ───────────────────────────────────────────────────────────
    const THREE_PART = /^(\d{1,2})[\/\-.\s](\d{1,2})[\/\-.\s](\d{2}|\d{4})(?:[T\s].*)?$/;

    function makeDate(y, m, d) {
        const date = new Date(y, m - 1, d);       // local midnight
        if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;  // rolled over
        return date;
    }

    // conv: 'dmy' or 'mdy' for ambiguous day/month dates when format is 'auto'
    function parseDate(text, format, conv) {
        const s = String(text == null ? '' : text).trim();
        format = format || 'auto';
        if (!s) return { date: null, reason: 'blank date' };
        let m;
        if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/))) {
            const d = makeDate(+m[1], +m[2], +m[3]);
            return d ? { date: d } : { date: null, reason: `"${s}" is not a real date` };
        }
        if ((format === 'yyyy' || format === 'auto') && /^\d{4}$/.test(s)) return { date: new Date(+s, 0, 1) };
        if ((format === 'yyyy-mm' || format === 'auto') && (m = s.match(/^(\d{4})-(\d{2})$/))) {
            const d = makeDate(+m[1], +m[2], 1);
            return d ? { date: d } : { date: null, reason: `"${s}" is not a real month` };
        }
        if ((format === 'mm/yyyy' || format === 'auto') && (m = s.match(/^(\d{1,2})[\/\-](\d{4})$/))) {
            const d = makeDate(+m[2], +m[1], 1);
            return d ? { date: d } : { date: null, reason: `"${s}" is not a real month` };
        }
        if (format === 'yyyy-mm-dd' && (m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/))) {
            const d = makeDate(+m[1], +m[2], +m[3]);
            return d ? { date: d } : { date: null, reason: `"${s}" is not a real date` };
        }
        if (!(m = s.match(THREE_PART))) return { date: null, reason: `"${s}" is not a recognised date` };
        const a = +m[1], b = +m[2];
        let year = +m[3], twoDigitYear = false;
        if (m[3].length === 2) { year += year < 50 ? 2000 : 1900; twoDigitYear = true; }
        let day, month;
        if (format === 'dd/mm/yyyy') { day = a; month = b; }
        else if (format === 'mm/dd/yyyy') { month = a; day = b; }
        else if (a > 12) { day = a; month = b; }
        else if (b > 12) { month = a; day = b; }
        else if (conv === 'mdy') { month = a; day = b; }
        else { day = a; month = b; }                    // ambiguous: day/month (UK)
        const d = makeDate(year, month, day);
        return d ? { date: d, twoDigitYear } : { date: null, reason: `"${s}" is not a real date` };
    }

    // One convention for the whole file: day/month or month/day.
    function detectDateConvention(texts) {
        const dmy = [], mdy = [];
        texts.forEach((t, i) => {
            const m = String(t == null ? '' : t).trim().match(THREE_PART);
            if (!m) return;
            if (+m[1] > 12 && +m[2] <= 12) dmy.push({ row: i + 1, text: t });
            else if (+m[2] > 12 && +m[1] <= 12) mdy.push({ row: i + 1, text: t });
        });
        if (dmy.length && mdy.length) return { convention: 'mixed', examples: { dmy: dmy.slice(0, 3), mdy: mdy.slice(0, 3) } };
        if (dmy.length) return { convention: 'dmy', examples: {} };
        if (mdy.length) return { convention: 'mdy', examples: {} };
        return { convention: 'ambiguous', examples: {} };
    }

    // ── A whole file ────────────────────────────────────────────────────
    // options: { dateFormat: 'auto'|..., numberFormat: 'auto'|'uk'|'eu' }
    function prepareRows(rawRows, xCol, yCol, options) {
        const opts = options || {};
        const dateFormat = opts.dateFormat || 'auto';
        const dateTexts = rawRows.map(r => r[xCol] == null ? '' : String(r[xCol]));
        const valueTexts = rawRows.map(r => r[yCol] == null ? '' : String(r[yCol]));
        const warnings = [];

        // Number format: as set, or detected; ask when it cannot be told
        let numberFormat = opts.numberFormat && opts.numberFormat !== 'auto' ? opts.numberFormat : null;
        let numberFormatSource = 'set';
        if (!numberFormat) {
            const det = detectNumberFormat(valueTexts);
            numberFormatSource = 'detected';
            if (det.format === 'mixed') return { error: { type: 'number-format',
                message: `The value column mixes UK-style numbers (for example ${det.examples.uk.join(', ')}) and European-style numbers (for example ${det.examples.eu.join(', ')}). Choose the number format used in your file, then Recalculate.` } };
            if (det.format === 'ambiguous') return { error: { type: 'number-format',
                message: `Values such as ${det.examples.ambiguous.join(', ')} could be read two ways: as thousands (UK, 1,234 = one thousand two hundred and thirty-four) or as decimals (European, 1,234 = one point two three four). Choose the number format used in your file, then Recalculate.` } };
            numberFormat = det.format;
        }

        // Date convention: one for the whole file
        let dateConvention = null;
        if (dateFormat === 'auto') {
            const det = detectDateConvention(dateTexts);
            if (det.convention === 'mixed') {
                const ex = l => l.map(e => `${e.text} (row ${e.row})`).join(', ');
                return { error: { type: 'date-convention',
                    message: `Some dates are written day first (for example ${ex(det.examples.dmy)}) and others month first (for example ${ex(det.examples.mdy)}), so the file cannot be read one way. Choose the date format used in your file (DD/MM/YYYY or MM/DD/YYYY), then Recalculate.` } };
            }
            dateConvention = det.convention === 'mdy' ? 'mdy' : 'dmy';
            if (det.convention === 'ambiguous' && dateTexts.some(t => THREE_PART.test(String(t).trim())))
                warnings.push({ code: 'date-convention-assumed', message: 'Every date could be read day first or month first; they were read day first (DD/MM/YYYY). If your dates are month first, choose MM/DD/YYYY.' });
        }

        const rows = [], rejected = [], choicesNeeded = [], counts = {};
        const censoredChoice = opts.censored || 'ask';
        const censoredSeen = [];
        let twoDigit = 0, currency = 0, percent = 0, accounting = 0;
        for (let i = 0; i < rawRows.length; i++) {
            const d = parseDate(dateTexts[i], dateFormat, dateConvention);
            if (!d.date) { rejected.push({ row: i + 1, date: dateTexts[i], value: valueTexts[i], reason: d.reason }); continue; }
            const v = parseNumber(valueTexts[i], numberFormat);
            if (v.kind === 'censored') {
                censoredSeen.push({ row: i + 1, text: valueTexts[i], side: v.side, limit: v.value });
                if (censoredChoice === 'limit' || censoredChoice === 'half') {
                    const val = censoredChoice === 'half' && v.side === 'below' ? v.value / 2 : v.value;
                    rows.push({ date: d.date, value: val, decimals: (v.decimals || 0) + (censoredChoice === 'half' ? 1 : 0), row: i + 1, censored: v.side });
                } else {
                    rejected.push({ row: i + 1, date: dateTexts[i], value: valueTexts[i], reason: 'censored value (below or above a limit), left out', _date: d.date });
                }
                continue;
            }
            if (v.kind !== 'ok') { rejected.push({ row: i + 1, date: dateTexts[i], value: valueTexts[i], reason: v.reason, _date: d.date }); continue; }
            if (d.twoDigitYear) twoDigit++;
            if (v.flags.currency) currency++;
            if (v.flags.percent) percent++;
            if (v.flags.accounting) accounting++;
            rows.push({ date: d.date, value: v.value, decimals: v.decimals, row: i + 1 });
        }
        // Censored values: ask, and warn when the limit changes (a new limit can
        // create a step that is not in the process; FMEA CR-04)
        if (censoredSeen.length) {
            if (censoredChoice === 'ask') choicesNeeded.push({ type: 'censored', count: censoredSeen.length,
                examples: censoredSeen.slice(0, 3).map(c => `${c.text} (row ${c.row})`) });
            else counts.censored = censoredSeen.length;
            for (const side of ['below', 'above']) {
                const list = censoredSeen.filter(c => c.side === side);
                for (let k = 1; k < list.length; k++) if (list[k].limit !== list[k - 1].limit) {
                    warnings.push({ code: 'limit-change', message: `The limit for censored values changes from ${list[k - 1].text} to ${list[k].text} (row ${list[k].row}). A change of limit can create a step that is not in the process.` });
                    break;
                }
            }
        }
        if (twoDigit) warnings.push({ code: 'two-digit-year', message: `${twoDigit} date${twoDigit > 1 ? 's have' : ' has'} a two-digit year; years 00\u201349 were read as 2000\u20132049 and 50\u201399 as 1950\u20131999. Check the century is right.` });
        if (currency) warnings.push({ code: 'currency', message: `Currency symbols were removed from ${currency} value${currency > 1 ? 's' : ''}.` });
        if (percent) warnings.push({ code: 'percent', message: `Percent signs were removed from ${percent} value${percent > 1 ? 's' : ''}; they are read as written (12% as 12).` });
        if (accounting) warnings.push({ code: 'accounting', message: `${accounting} value${accounting > 1 ? 's' : ''} in brackets, such as (123), ${accounting > 1 ? 'were' : 'was'} read as negative.` });
        // Several rows sharing a date (for example transaction-level data; FMEA IN-34)
        let finalRows = rows.slice().sort((p, q) => p.date - q.date || p.row - q.row);
        const perDate = new Map();
        for (const r of finalRows) { const k = dayKey(r.date); perDate.set(k, (perDate.get(k) || 0) + 1); }
        const sharedDates = [...perDate.values()].filter(n => n > 1).length;
        const combine = opts.combine || 'ask';
        let combinePending = false;
        if (sharedDates) {
            if (combine === 'ask') {
                combinePending = true;
                const ex = finalRows.find(r => perDate.get(dayKey(r.date)) > 1);
                choicesNeeded.push({ type: 'combine', count: sharedDates, rows: finalRows.length,
                    example: `${perDate.get(dayKey(ex.date))} rows on ${dateTexts[ex.row - 1]}` });
            } else if (combine === 'sum' || combine === 'mean') {
                const period = opts.combinePeriod || 'date';
                const groups = new Map();
                for (const r of finalRows) {
                    const start = periodStart(r.date, period), k = start.getTime();
                    if (!groups.has(k)) groups.set(k, { date: start, values: [], decimals: 0, row: r.row, censored: null });
                    const g = groups.get(k);
                    g.values.push(r.value); g.decimals = Math.max(g.decimals, r.decimals || 0);
                    if (r.censored) g.censored = r.censored;
                }
                const before = finalRows.length;
                finalRows = [...groups.values()].sort((p, q) => p.date - q.date).map(g => ({
                    date: g.date, row: g.row, decimals: g.decimals, censored: g.censored, combined: g.values.length,
                    value: combine === 'sum' ? g.values.reduce((a, b) => a + b, 0) : g.values.reduce((a, b) => a + b, 0) / g.values.length }));
                counts.combined = { from: before, to: finalRows.length, how: combine, period };
            }
        }

        // Missing periods: no activity (enter 0) or no data (leave out)? (FMEA IN-35)
        const missingChoice = opts.missing || 'ask';
        // A missing period is a date absent from the file altogether. Rows that are
        // present but left out (blank, unreadable or censored values) are not missing.
        const presentDates = finalRows.map(r => r.date).concat(rejected.filter(x => x._date).map(x => x._date));
        const presentKeys = new Set(presentDates.map(dayKey));
        if (!combinePending && finalRows.length > 2) {
            const g = findGaps(presentDates);
            if (g.missing > 0) {
                const unit = periodUnit(g.typical, g.workingDays);
                if (missingChoice === 'ask') {
                    choicesNeeded.push({ type: 'missing', count: g.missing, canFill: !!unit,
                        examples: g.gaps.slice(0, 3).map(x => `${x.missing} between ${shortDate(x.from)} and ${shortDate(x.to)}`) });
                } else if (missingChoice === 'zero') {
                    if (!unit) warnings.push({ code: 'fill-not-possible', message: 'Missing periods could not be entered as 0 because the dates are irregular; they were left out.' });
                    else {
                        let added = 0;
                        const filled = [];
                        for (let k = 0; k < finalRows.length; k++) {
                            filled.push(finalRows[k]);
                            if (k + 1 < finalRows.length) {
                                let next = stepDate(finalRows[k].date, unit);
                                while (next < finalRows[k + 1].date) {
                                    if (!presentKeys.has(dayKey(next))) {     // only dates absent from the file
                                        filled.push({ date: next, value: 0, decimals: 0, row: null, filled: true });
                                        added++;
                                    }
                                    next = stepDate(next, unit);
                                }
                            }
                        }
                        finalRows = filled;
                        counts.zeroFilled = added;
                    }
                }
            }
        }

        const choices = {};
        if (censoredSeen.length && censoredChoice !== 'ask') choices.censored = censoredChoice;
        if (sharedDates && combine !== 'ask') choices.combine = combine === 'keep' ? 'keep' : `${combine} by ${opts.combinePeriod || 'date'}`;
        if (counts.zeroFilled !== undefined || (missingChoice !== 'ask' && opts.missing)) choices.missing = missingChoice;
        return { rows: finalRows, rejected, warnings, numberFormat, numberFormatSource, dateConvention, choicesNeeded, choices, counts };
    }

    // ── Periods ─────────────────────────────────────────────────────────
    function shortDate(d) { return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear(); }
    function dayKey(d) { return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
    function periodStart(d, period) {
        if (period === 'month') return new Date(d.getFullYear(), d.getMonth(), 1);
        if (period === 'week') { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
    // Recording frequency from the typical interval (ms); null when irregular
    function periodUnit(typical, workingDays) {
        const days = typical / 86400000;
        if (Math.abs(days - 1) < 0.1) return workingDays ? 'workday' : 'day';
        if (Math.abs(days - 7) < 0.2) return 'week';
        if (days >= 27.5 && days <= 31.5) return 'month';
        if (days >= 88 && days <= 93) return 'quarter';
        if (days >= 364 && days <= 367) return 'year';
        return null;
    }
    function stepDate(d, unit) {
        const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        if (unit === 'day') x.setDate(x.getDate() + 1);
        else if (unit === 'workday') { do { x.setDate(x.getDate() + 1); } while (x.getDay() === 0 || x.getDay() === 6); }
        else if (unit === 'week') x.setDate(x.getDate() + 7);
        else if (unit === 'month') x.setMonth(x.getMonth() + 1);
        else if (unit === 'quarter') x.setMonth(x.getMonth() + 3);
        else if (unit === 'year') x.setFullYear(x.getFullYear() + 1);
        return x;
    }

    // Missing periods: typical (median) interval, then periods skipped by larger gaps
    function findGaps(dates) {
        const ds = dates.filter(d => d instanceof Date && !isNaN(d)).slice().sort((a, b) => a - b);
        const ts = ds.map(d => d.getTime());
        const steps = [];
        for (let i = 1; i < ts.length; i++) if (ts[i] > ts[i - 1]) steps.push({ d: ts[i] - ts[i - 1], from: ts[i - 1], to: ts[i] });
        if (steps.length < 2) return { missing: 0, gaps: [], typical: 0, workingDays: false };
        const sorted = steps.map(x => x.d).sort((a, b) => a - b);
        const typical = sorted[Math.floor(sorted.length / 2)];
        // Daily data with (almost) no Saturday or Sunday rows: a working-day
        // calendar, so weekends are not missing (FMEA IN-33)
        const daily = Math.abs(typical / 86400000 - 1) < 0.1;
        const weekendRows = ds.filter(d => d.getDay() === 0 || d.getDay() === 6).length;
        const workingDays = daily && ds.length >= 10 && weekendRows <= ds.length * 0.02;
        const gaps = [];
        for (const x of steps) {
            let missing;
            if (workingDays) {
                missing = 0;
                const c = new Date(x.from); c.setDate(c.getDate() + 1);
                while (c.getTime() < x.to - 3600000) { if (c.getDay() !== 0 && c.getDay() !== 6) missing++; c.setDate(c.getDate() + 1); }
            } else {
                missing = x.d > typical * 1.4 ? Math.round(x.d / typical) - 1 : 0;
            }
            if (missing > 0) gaps.push({ from: new Date(x.from), to: new Date(x.to), missing });
        }
        return { missing: gaps.reduce((a, g) => a + g.missing, 0), gaps, typical, workingDays };
    }
    function findMissingPeriods(dates) { return findGaps(dates).missing; }

    return { parseNumber, detectNumberFormat, parseDate, detectDateConvention, prepareRows, findGaps, findMissingPeriods };
})();
if (typeof self !== 'undefined') self.DataCore = DataCore;
