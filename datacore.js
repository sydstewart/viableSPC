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

        const rows = [], rejected = [];
        let twoDigit = 0, currency = 0, percent = 0, accounting = 0;
        for (let i = 0; i < rawRows.length; i++) {
            const d = parseDate(dateTexts[i], dateFormat, dateConvention);
            if (!d.date) { rejected.push({ row: i + 1, date: dateTexts[i], value: valueTexts[i], reason: d.reason }); continue; }
            const v = parseNumber(valueTexts[i], numberFormat);
            if (v.kind === 'censored') { rejected.push({ row: i + 1, date: dateTexts[i], value: valueTexts[i], reason: 'censored value (below or above a limit)' }); continue; }
            if (v.kind !== 'ok') { rejected.push({ row: i + 1, date: dateTexts[i], value: valueTexts[i], reason: v.reason }); continue; }
            if (d.twoDigitYear) twoDigit++;
            if (v.flags.currency) currency++;
            if (v.flags.percent) percent++;
            if (v.flags.accounting) accounting++;
            rows.push({ date: d.date, value: v.value, decimals: v.decimals, row: i + 1 });
        }
        if (twoDigit) warnings.push({ code: 'two-digit-year', message: `${twoDigit} date${twoDigit > 1 ? 's have' : ' has'} a two-digit year; years 00\u201349 were read as 2000\u20132049 and 50\u201399 as 1950\u20131999. Check the century is right.` });
        if (currency) warnings.push({ code: 'currency', message: `Currency symbols were removed from ${currency} value${currency > 1 ? 's' : ''}.` });
        if (percent) warnings.push({ code: 'percent', message: `Percent signs were removed from ${percent} value${percent > 1 ? 's' : ''}; they are read as written (12% as 12).` });
        if (accounting) warnings.push({ code: 'accounting', message: `${accounting} value${accounting > 1 ? 's' : ''} in brackets, such as (123), ${accounting > 1 ? 'were' : 'was'} read as negative.` });
        return { rows, rejected, warnings, numberFormat, numberFormatSource, dateConvention };
    }

    // Missing periods: typical (median) interval, then periods skipped by larger gaps
    function findGaps(dates) {
        const ts = dates.filter(d => d instanceof Date && !isNaN(d)).map(d => d.getTime()).sort((a, b) => a - b);
        const steps = [];
        for (let i = 1; i < ts.length; i++) if (ts[i] > ts[i - 1]) steps.push({ d: ts[i] - ts[i - 1], from: ts[i - 1], to: ts[i] });
        if (steps.length < 2) return { missing: 0, gaps: [] };
        const sorted = steps.map(x => x.d).sort((a, b) => a - b);
        const typical = sorted[Math.floor(sorted.length / 2)];
        const gaps = [];
        for (const x of steps) if (x.d > typical * 1.4) gaps.push({ from: new Date(x.from), to: new Date(x.to), missing: Math.round(x.d / typical) - 1 });
        return { missing: gaps.reduce((a, g) => a + g.missing, 0), gaps };
    }
    function findMissingPeriods(dates) { return findGaps(dates).missing; }

    return { parseNumber, detectNumberFormat, parseDate, detectDateConvention, prepareRows, findGaps, findMissingPeriods };
})();
if (typeof self !== 'undefined') self.DataCore = DataCore;
