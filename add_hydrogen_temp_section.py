#!/usr/bin/env python3
"""
Run from your project directory to add furnace temperature section to hydrogen page.
  python3 add_hydrogen_temp_section.py
"""

FURNACE_SECTION = """
    <h3>Furnace tube temperature as a corroborating monitor</h3>

    <p>Further to the methane-based residual CUSUM, we added a second independent signal that provided valuable corroboration. The reforming furnace contains tubes packed with catalyst operating at temperatures of 800&ndash;900&deg;C. As catalyst efficiency diminishes, the reaction goes less far to completion at a given temperature and throughput rate &mdash; incomplete reforming allows more methane to pass through unreacted. To maintain hydrogen output the furnace temperature rises with the throughput rate. This relationship between catalyst condition and operating temperature is an independent physical signal of the same underlying degradation.</p>

    <p>We began taking spot checks of the tube temperature once per shift using an <strong>optical pyrometer</strong> &mdash; a non-contact instrument that reads surface temperature from the thermal radiation emitted by the tube wall. One reading per shift, logged on the same control sheet as the methane reading, added approximately two minutes to the shift supervisor&rsquo;s routine. The temperature residual was calculated in exactly the same way as the methane residual: actual temperature minus expected temperature at the current production rate, using a reference line established during the healthy catalyst baseline period.</p>

    <p>The two residual series &mdash; methane and temperature &mdash; are not independent. Both are driven by the same underlying variable (catalyst activity), so they tend to move together. But their correlated movement is exactly what makes them valuable as a combined monitoring system:</p>

    <ul>
        <li>A rising methane residual <em>accompanied by</em> a rising temperature residual is strong confirmation of genuine catalyst degradation &mdash; two independent physical signals pointing in the same direction.</li>
        <li>A rising methane residual <em>without</em> a corresponding temperature signal warrants investigation of the methane analyser before concluding the catalyst is at fault &mdash; instrument drift rather than process degradation.</li>
        <li>A rising temperature residual <em>without</em> a methane signal is the rarer case &mdash; possible if the methane analyser has failed low &mdash; and should prompt immediate instrument calibration.</li>
    </ul>

    <div class="callout-box">
        <h3>&#128202; Two independent signals, one underlying cause</h3>
        <p>Running Bootstrap CUSUM on both residual series and comparing the change points provides a powerful cross-check. If the methane residual shows a change point at the same date as the temperature residual, the probability that both are false alarms simultaneously is vanishingly small. Conversely, if only one series signals, the cause is more likely to be in the measurement system than in the catalyst. Two independent Bootstrap CUSUM change points at the same date are categorically stronger evidence than a change point on one measure alone.</p>
    </div>

"""

with open('hydrogen-plant-cusum.html', encoding='utf-8') as f:
    content = f.read()

INSERT_BEFORE = '<h2 id="section-applications">Broader applications'

if INSERT_BEFORE in content:
    content = content.replace(INSERT_BEFORE, FURNACE_SECTION + '    ' + INSERT_BEFORE)
    with open('hydrogen-plant-cusum.html', 'w', encoding='utf-8') as f:
        f.write(content)
    print("✓ Furnace temperature section added before section-applications")
else:
    print("✗ Insertion point not found — searching for alternatives...")
    import re
    # Try finding the pen-and-paper callout
    idx = content.find('pen-and-paper principle')
    if idx > 0:
        # Find the closing </div> after it
        close = content.find('</div>', idx)
        hr = content.find('<hr', close)
        print(f"Found pen-and-paper at {idx}, next </div> at {close}, next <hr at {hr}")
        print(repr(content[hr:hr+100]))
