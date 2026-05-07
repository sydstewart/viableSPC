// worker.js
importScripts("https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js");

let pyodide;

async function setupPython() {
    try {
        pyodide = await loadPyodide();
        await pyodide.loadPackage(['pandas', 'numpy']);
        self.postMessage({ status: "ready" });
    } catch (error) {
        self.postMessage({ status: "error", data: error.message });
    }
}
setupPython();

self.onmessage = async function(event) {
    if (event.data.command === "process_csv") {
        try {
            pyodide.globals.set("js_data", event.data.data);
            pyodide.globals.set("js_turn_length", event.data.params.turn_length);
            pyodide.globals.set("js_boot_num", event.data.params.boot_num);
            pyodide.globals.set("js_conf_limit", event.data.params.conf_limit);
            pyodide.globals.set("js_date_col", event.data.params.x_col);
            pyodide.globals.set("js_name_col", event.data.params.y_col);
            pyodide.globals.set("js_date_format", event.data.params.date_format);

            const pythonCode = `
import pandas as pd
import numpy as np

def firstcusum(df, pointname, pointdate, cusum_control, x):
    idx_start = int(cusum_control.iloc[x]['firstindex']) + (1 if x > 1 else 0)
    idx_end = int(cusum_control.iloc[x]['lastindex'])
    dx = df.iloc[idx_start:idx_end].copy()
    if len(dx) == 0: return 0, dx, 0, 0, idx_start, idx_end
    p_mean = dx[pointname].mean()
    dx['Cusum'] = (dx[pointname] - p_mean).cumsum()
    sdiff = dx['Cusum'].max() - dx['Cusum'].min()
    turnpt = dx['Cusum'].idxmax() if abs(dx['Cusum'].max()) > abs(dx['Cusum'].min()) else dx['Cusum'].idxmin()
    return sdiff, dx, p_mean, turnpt, idx_start, idx_end

def cusbootstrap_clean(dx, pointmean, pointname, sdiff, bootnum, cusum_control, x, fog, turnpt, z, countr, conflimit):
    raw = dx[pointname].values
    count = sum(1 for _ in range(bootnum) if (np.max(np.cumsum(np.random.permutation(raw) - pointmean)) - np.min(np.cumsum(np.random.permutation(raw) - pointmean))) > sdiff)
    conf = 100 * (bootnum - count) / bootnum
    if conf >= conflimit and turnpt != z:
        new_rows = pd.DataFrame([{'firstindex': int(cusum_control.iloc[x]['firstindex']), 'lastindex': turnpt, 'conflevel': conf, 'Expanded': ''},
                                 {'firstindex': turnpt, 'lastindex': int(cusum_control.iloc[x]['lastindex']), 'conflevel': conf, 'Expanded': ''}])
        cusum_control = pd.concat([cusum_control, new_rows], ignore_index=True)
        fog.extend([countr + 1, countr + 2])
        countr += 2
        cusum_control.loc[x, 'Expanded'] = 'y'
    return conf, cusum_control, x, fog, countr

def stagemeans_clean(cusum_control, df, pointname, pointdate):
    cc = cusum_control[cusum_control['Expanded'] != 'y'].copy().sort_values('firstindex').reset_index(drop=True)
    m_rows = []
    for i in range(len(cc)):
        f_idx, l_idx = int(cc.iloc[i]['firstindex']), int(cc.iloc[i]['lastindex'])
        s_mean = round(df[pointname].iloc[f_idx:l_idx+1].mean(), 2)
        conf = round(float(cc.iloc[i]['conflevel']), 2) if not pd.isna(cc.iloc[i]['conflevel']) else 100.0
        txt = f'SM={s_mean}' if i == 0 else f'SM={s_mean}<br>%C={conf}'
        m_rows.extend([{pointdate: df[pointdate].iloc[f_idx], 'StageMean': s_mean, 'confleveltext': txt},
                       {pointdate: df[pointdate].iloc[l_idx], 'StageMean': s_mean, 'confleveltext': ' '}])
    return cc, pd.DataFrame(m_rows)

def manhatten_clean(df, name_col, date_col, turn_length, boot_num, conf_limit):
    cc = pd.DataFrame([{'firstindex': 0, 'lastindex': len(df)-1, 'Expanded': '', 'conflevel': np.nan}])
    fog, countr, i = [0], 0, 0
    while i < len(fog):
        sdiff, dx, p_mean, turnpt, z, y = firstcusum(df, name_col, date_col, cc, fog[i])
        if (y - z) > turn_length:
            _, cc, _, fog, countr = cusbootstrap_clean(dx, p_mean, name_col, sdiff, boot_num, cc, fog[i], fog, turnpt, z, countr, conf_limit)
        i += 1
    cc_final, m_df = stagemeans_clean(cc, df, name_col, date_col)
    df['cusum'] = (df[name_col] - df[name_col].mean()).cumsum()
    
    # --- UPDATED: STRICT RUN CHART CALCULATIONS ---
    median_val = df[name_col].median()
    raw_vals = df[name_col].tolist()
    dates = df[date_col].tolist()

    above_idx, below_idx = [], []
    run_inds = []
    curr_sign = 0

    for idx, val in enumerate(raw_vals):
        # 1. Ignore points exactly on the median
        if val == median_val:
            continue 
            
        # 2. Determine sign
        s = 1 if val > median_val else -1
        
        # 3. Check if run continues
        if s == curr_sign:
            run_inds.append(idx)
        else:
            # Run broke. Did it reach 6 before breaking?
            if len(run_inds) >= 6:
                if curr_sign == 1: above_idx.extend(run_inds)
                elif curr_sign == -1: below_idx.extend(run_inds)
            
            # Start new run
            curr_sign = s
            run_inds = [idx]
            
    # 4. Check the very last run in the dataset
    if len(run_inds) >= 6:
        if curr_sign == 1: above_idx.extend(run_inds)
        elif curr_sign == -1: below_idx.extend(run_inds)

    return {
        "dates": dates, 
        "raw_values": raw_vals, 
        "cusum_values": df['cusum'].tolist(),
        "stage_dates": m_df[date_col].tolist(), 
        "stage_means": m_df['StageMean'].tolist(), 
        "confleveltext": m_df['confleveltext'].tolist(), 
        "step_count": len(cc_final),
        "run_median": median_val,
        "shift_above_dates": [dates[x] for x in above_idx],
        "shift_above_values": [raw_vals[x] for x in above_idx],
        "shift_below_dates": [dates[x] for x in below_idx],
        "shift_below_values": [raw_vals[x] for x in below_idx]
    }

df = pd.DataFrame(js_data.to_py())
df[js_name_col] = pd.to_numeric(df[js_name_col], errors='coerce')

if js_date_format == 'dd/mm/yyyy': df[js_date_col] = pd.to_datetime(df[js_date_col], dayfirst=True, errors='coerce')
elif js_date_format == 'mm/dd/yyyy': df[js_date_col] = pd.to_datetime(df[js_date_col], dayfirst=False, errors='coerce')
else: df[js_date_col] = pd.to_datetime(df[js_date_col], errors='ignore')

if pd.api.types.is_datetime64_any_dtype(df[js_date_col]): df[js_date_col] = df[js_date_col].dt.strftime('%Y-%m-%d %H:%M:%S')
df = df.dropna(subset=[js_name_col]).reset_index(drop=True)

if len(df) < 5: raise ValueError("Dataset too small after cleaning.")

res = manhatten_clean(df, js_name_col, js_date_col, js_turn_length, js_boot_num, js_conf_limit)
import pyodide.ffi
pyodide.ffi.to_js(res, dict_converter=pyodide.ffi.create_proxy)
            `;
            const result = await pyodide.runPythonAsync(pythonCode);
            self.postMessage({ status: "result", data: Object.fromEntries(result.toJs()) });
        } catch (err) {
            self.postMessage({ status: "error", data: err.message });
        }
    }
};