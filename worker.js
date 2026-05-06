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
            const rawJsData = event.data.data;
            pyodide.globals.set("js_data", rawJsData);

            // Inject the parameters from JS directly into Python's global memory
            pyodide.globals.set("js_turn_length", event.data.params.turn_length);
            pyodide.globals.set("js_boot_num", event.data.params.boot_num);
            pyodide.globals.set("js_conf_limit", event.data.params.conf_limit);

            // Inject the chosen column names
            pyodide.globals.set("js_date_col", event.data.params.x_col);
            pyodide.globals.set("js_name_col", event.data.params.y_col);

            // ==========================================
            // THE PYTHON ENGINE
            // ==========================================
            const pythonCode = `
import pandas as pd
import numpy as np

# 1. HELPER: FIRST CUSUM
def firstcusum(df, pointname, pointdate, cusum_control, x):
    if x <= 1:
        z = int(cusum_control.iloc[x]['firstindex'])
        y = int(cusum_control.iloc[x]['lastindex'])
    else:
        z = int(cusum_control.iloc[x]['firstindex']) + 1
        y = int(cusum_control.iloc[x]['lastindex'])

    dx = df.iloc[z:y].copy()
    if len(dx) == 0:
        return 0, dx, 0, 0, z, y

    pointmean = dx[pointname].mean()
    dx['Mean'] = pointmean
    dx['Diff from mean'] = dx[pointname] - pointmean
    dx['Cusum'] = dx['Diff from mean'].cumsum()

    maxcusum = dx['Cusum'].max()
    mincusum = dx['Cusum'].min()
    sdiff = maxcusum - mincusum

    if abs(maxcusum) > abs(mincusum):
        turnpt = dx['Cusum'].idxmax()
    else:
        turnpt = dx['Cusum'].idxmin()

    return sdiff, dx, pointmean, turnpt, z, y

# 2. HELPER: BOOTSTRAP
def cusbootstrap_clean(dx, pointmean, pointname, sdiff, bootnum, cusum_control, x, fog, turnpt, z, countr, conflimit):
    count = 0
    raw_values = dx[pointname].values
    
    for j in range(bootnum):
        shuffled = np.random.permutation(raw_values)
        diff_from_mean = shuffled - pointmean
        shuff_cusum = np.cumsum(diff_from_mean)

        maxcusum = np.max(shuff_cusum)
        mincusum = np.min(shuff_cusum)
        if (maxcusum - mincusum) > sdiff:
            count += 1

    conflevel = 100 * (bootnum - count) / bootnum

    if conflevel >= conflimit and turnpt != z:
        firstindex = int(cusum_control.iloc[x]['firstindex'])
        lastindex_original = int(cusum_control.iloc[x]['lastindex'])
        
        new_rows = pd.DataFrame([
            {'firstindex': firstindex, 'lastindex': turnpt, 'conflevel': conflevel, 'Expanded': ''},
            {'firstindex': turnpt, 'lastindex': lastindex_original, 'conflevel': conflevel, 'Expanded': ''}
        ])
        cusum_control = pd.concat([cusum_control, new_rows], ignore_index=True)

        fog.append(countr + 1)
        countr += 1
        fog.append(countr + 1)
        countr += 1
        cusum_control.loc[x, 'Expanded'] = 'y'

    return conflevel, cusum_control, x, fog, countr

# 3. HELPER: STAGEMEANS
def stagemeans_clean(cusum_control, df, pointname, pointdate, decplaces=2):
    cusum_control = cusum_control[(cusum_control['Expanded'].isnull()) | (cusum_control['Expanded'] == '')].copy()
    cusum_control.sort_values('firstindex', ascending=True, inplace=True)
    cusum_control.reset_index(drop=True, inplace=True)

    manhatten_rows = []
    for y in range(len(cusum_control)):
        firstindex = int(cusum_control['firstindex'].iloc[y])
        lastindex = int(cusum_control['lastindex'].iloc[y])

        firstdate = df[pointdate].iloc[firstindex]
        lastdate = df[pointdate].iloc[lastindex]
        
        Meanlist = df[pointname].iloc[firstindex:lastindex + 1]
        StageMean = np.mean(Meanlist)
        StageMean = round(StageMean, int(decplaces))

        conflevel = cusum_control['conflevel'].iloc[y]
        if pd.isna(conflevel):
            conflevel = 100.0
        else:
            conflevel = round(float(conflevel), 2)

        if y == 0:
            confleveltext = f'SM = {StageMean}'
        else:
            confleveltext = f'SM = {StageMean}<br>% C = {conflevel}'

        manhatten_rows.append({pointdate: firstdate, 'StageMean': StageMean, 'confleveltext': confleveltext})
        manhatten_rows.append({pointdate: lastdate, 'StageMean': StageMean, 'confleveltext': ' '})

    return cusum_control, pd.DataFrame(manhatten_rows)

# 4. MANAGER: MANHATTEN CLEAN
def manhatten_clean(df, name_col, date_col, turn_length, boot_num, conf_limit):
    total_rows = len(df) - 1
    cusum_control = pd.DataFrame(columns=[
        'firstindex', 'firstdate', 'lastindex', 'lastdate', 
        'conflevel', 'changeptindex', 'StageMean', 'Expanded'
    ])
    cusum_control = pd.concat([cusum_control, pd.DataFrame([{'firstindex': 0, 'lastindex': int(total_rows), 'Expanded': ''}])], ignore_index=True)

    countr = 0  
    fog = [0]  
    
    i = 0
    while i < len(fog):
        x = fog[i]
        sdiff, dx, pointmean, turnpt, z, y = firstcusum(df, name_col, date_col, cusum_control, x)

        if (y - z) > turn_length:
            conflevel, cusum_control, x, fog, countr = cusbootstrap_clean(
                dx, pointmean, name_col, sdiff, boot_num, cusum_control, x, fog, turnpt, z, countr, conf_limit
            )

        if x == 15:
            break
        i += 1

    cusum_control1, manhatten_df = stagemeans_clean(cusum_control, df, name_col, date_col, decplaces=2)
  
    df['mean'] = df[name_col].mean()
    df['meandiff'] = df[name_col] - df['mean']
    df['cusum'] = df['meandiff'].cumsum()
    
    return {
        "dates": df[date_col].tolist(),
        "raw_values": df[name_col].tolist(),
        "cusum_values": df['cusum'].tolist(),
        "stage_dates": manhatten_df[date_col].tolist(),
        "stage_means": manhatten_df['StageMean'].tolist(),
        "step_count": len(cusum_control1)
    }

# --- EXECUTION ---
# 1. Convert JS data to Pandas DataFrame
python_data = js_data.to_py()
df = pd.DataFrame(python_data)

# 2. Use the explicit column names chosen by the user
date_col = js_date_col
name_col = js_name_col

# 3. Clean the data
df[name_col] = pd.to_numeric(df[name_col], errors='coerce')
df = df.dropna(subset=[name_col]).reset_index(drop=True) 

# --- THE NEW TRAP ---
# If dropping non-numbers resulted in an empty dataset, stop and warn the user safely!
if len(df) == 0:
    raise ValueError(f"The column '{name_col}' does not contain any valid numbers. Please select a different Y-Axis.")
if len(df) < 5:
    raise ValueError("Not enough valid data points to run the analysis.")
# --------------------

# 4. RUN THE ENGINE! 
results = manhatten_clean(df, name_col=name_col, date_col=date_col, 
                          turn_length=js_turn_length, 
                          boot_num=js_boot_num, 
                          conf_limit=js_conf_limit)

# Convert output back to JS
import pyodide.ffi
pyodide.ffi.to_js(results, dict_converter=pyodide.ffi.create_proxy)
            `;
            // ==========================================

            const pythonResult = await pyodide.runPythonAsync(pythonCode);

            const finalJsData = Object.fromEntries(pythonResult.toJs());

            self.postMessage({ status: "result", data: finalJsData });

        } catch (error) {
            self.postMessage({ status: "error", data: error.message });
        }
    }
};