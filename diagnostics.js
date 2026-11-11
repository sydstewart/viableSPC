/* Independent, experimental checks; does not alter the analysis worker. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const panel=$('diagnostic-panel'), frequency=$('check-frequency'), correlation=$('correlation-result'), repeat=$('repeat-result');
  const corBtn=$('check-correlation'), runBtn=$('check-repeat'), cancelBtn=$('cancel-repeat');
  let completed=null, pendingValid=false, repeatWorker=null;
  function stopRepeat(){ if(repeatWorker){repeatWorker.terminate();repeatWorker=null;} cancelBtn.hidden=true; runBtn.disabled=!completed; }
  function invalidate(){pendingValid=false;completed=null;stopRepeat();panel.hidden=true;correlation.textContent='';repeat.textContent='';}
  document.addEventListener('analysis-invalidated', invalidate);
  document.addEventListener('analysis-started',()=>{invalidate();pendingValid=true;});
  document.addEventListener('analysis-completed', e=>{if(!pendingValid || !e.detail.request)return; completed=e.detail;panel.hidden=false;runBtn.disabled=false;corBtn.disabled=false;pendingValid=false;});
  ['xColSelect','yColSelect','dateFormatSelect','startDate','endDate','paramTurnLength','paramBootNum','paramConfLimit'].forEach(id=>{
    const e=$(id); if(e){e.addEventListener('input',invalidate);e.addEventListener('change',invalidate);}
  });
  frequency.addEventListener('change',()=>correlation.textContent='');
  const day = s => /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s+'T00:00:00Z') : null;
  function adjacent(a,b,f){
    const d1=day(a),d2=day(b);if(!d1||!d2||!Number.isFinite(d1.getTime())||!Number.isFinite(d2.getTime()))return false;
    if(f==='daily')return d2-d1===86400000;
    if(f==='weekly')return d2-d1===7*86400000;
    if(f==='monthly')return (d2.getUTCFullYear()-d1.getUTCFullYear())*12+d2.getUTCMonth()-d1.getUTCMonth()===1;
    if(f==='yearly')return d2.getUTCFullYear()-d1.getUTCFullYear()===1;
    return false;
  }
  function calculateCorrelation(data,f){
    const dates=data.dates.map(x=>String(x).split(' ')[0]); const vals=data.raw_values; const ends=data.stage_dates;
    if(!f)return {error:'Choose how often the measure is recorded first. If its timing is irregular, this simple check is not suitable.'};
    if(dates.length!==vals.length || new Set(dates).size!==dates.length)return {error:'This check cannot use repeated dates or mismatched observations. Check your data first.'};
    if((f==='monthly'||f==='yearly') && new Set(dates.map(d=>d.slice(0,f==='monthly'?7:4))).size!==dates.length)return {error:'More than one observation occurs in the same recorded period. This check needs one observation per period.'};
    if(dates.some(d=>!day(d)) || dates.some((d,i)=>i>0 && d<=dates[i-1]))return {error:'This check needs distinct dates in chronological order. Check your data first.'};
    let assigned=0, skipped=0, xs=[], ys=[];
    for(let j=0;j<ends.length;j+=2){
      const a=String(ends[j]).split(' ')[0],b=String(ends[j+1]).split(' ')[0];
      const indexes=[]; for(let k=0;k<dates.length;k++)if(dates[k]>=a&&dates[k]<=b)indexes.push(k);
      assigned+=indexes.length;if(!indexes.length)continue;
      const avg=indexes.reduce((t,k)=>t+vals[k],0)/indexes.length;
      for(let k=1;k<indexes.length;k++){
        const i=indexes[k-1],h=indexes[k];
        if(!adjacent(dates[i],dates[h],f)){skipped++;continue;}
        xs.push(vals[i]-avg);ys.push(vals[h]-avg);
      }
    }
    if(assigned!==dates.length)return {error:'The estimated stages could not be matched safely to the dates. Check the data.'};
    const n=xs.length;
    if(n<20)return {error:`Only ${n} usable neighbouring pairs (${skipped} gap or irregular pairs skipped). This check requires at least 20 pairs; even that is not a guarantee of reliability.`};
    const mx=xs.reduce((a,b)=>a+b,0)/n,my=ys.reduce((a,b)=>a+b,0)/n;
    let xy=0, xx=0, yy=0; for(let i=0;i<n;i++){let x=xs[i]-mx,y=ys[i]-my;xy+=x*y;xx+=x*x;yy+=y*y;}
    if(xx<=1e-20||yy<=1e-20)return {error:`The usable pairs have too little variation to calculate this check (${n} pairs).`};
    return {r:xy/Math.sqrt(xx*yy),n,skipped};
  }
  corBtn.onclick=()=>{
    if(!completed)return;
    const out=calculateCorrelation(completed.data,frequency.value); correlation.textContent='';
    const p=document.createElement('p');
    if(out.error){p.textContent=out.error;correlation.append(p);return;}
    const r=out.r, direction=r>0.02?'positive':r< -0.02?'negative':'close to zero';
    p.textContent=`The estimate is ${direction}. ${direction==='positive'?'Neighbouring measurements may tend to move together, although a positive estimate can also arise by chance.':direction==='negative'?'Neighbouring measurements may tend to alternate, although a negative estimate can also arise by chance.':'A small estimate does not rule out a relationship.'} This is a clue, not a verdict.`;
    const q=document.createElement('p');q.textContent='Look at the dots and check for trends or seasonal patterns. Seek advice if the result matters to an important decision.';
    const more=document.createElement('details'),summary=document.createElement('summary'),explain=document.createElement('p');
    summary.textContent='See the estimate and how the check works';
    explain.textContent=`Exploratory estimate: ${r>=0?'+':''}${r.toFixed(2)}; ${out.n} consecutive within-stage pairs; ${out.skipped} ${out.skipped===1?'pair':'pairs'} skipped because dates were not consecutive for the chosen frequency. Estimated stages, trends, seasonal patterns and short stages can affect the estimate. This one-step check can miss longer-term relationships, and does not prove independence.`;
    more.append(summary,explain);correlation.append(p,q,more);
  };
  function boundaries(data){return data.stage_dates.filter((_,i)=>i>0&&i%2===0).map(v=>String(v).split(' ')[0]);}
  function summarize(runs){
    const counts={}, sets=new Map(), dates={};
    for(const d of runs){let b=boundaries(d), key=JSON.stringify(b);counts[d.step_count]=(counts[d.step_count]||0)+1;sets.set(key,(sets.get(key)||0)+1);for(const x of b)dates[x]=(dates[x]||0)+1;}
    return {counts,sets:[...sets.entries()].map(([key,count])=>({dates:JSON.parse(key),count})),dates};
  }
  // Report neighbouring final-stage averages only for runs in which a
  // varying boundary actually appears. Do not associate a split-test score
  // with these final stages; that would be a different comparison.
  function varyingBoundaryDetails(runs){
    const counts={}; for(const d of runs)for(const date of boundaries(d))counts[date]=(counts[date]||0)+1;
    const varying=Object.keys(counts).filter(date=>counts[date]<runs.length).sort();
    const details=[];
    for(const date of varying){
      const groups=new Map(); let unsafe=false;
      for(const d of runs){
        const ends=d.stage_dates.map(v=>String(v).split(' ')[0]);
        const j=ends.findIndex((x,i)=>i>0&&i%2===0&&x===date);if(j<0)continue;
        const dates=d.dates.map(x=>String(x).split(' ')[0]), values=d.raw_values;
        if(dates.length!==values.length||new Set(dates).size!==dates.length){unsafe=true;continue;}
        const a=ends[j-2],b=ends[j-1],c=ends[j],e=ends[j+1];
        const left=[],right=[];dates.forEach((dt,k)=>{if(dt>=a&&dt<=b)left.push(values[k]);if(dt>=c&&dt<=e)right.push(values[k]);});
        if(!left.length||!right.length||left.some(v=>!Number.isFinite(v))||right.some(v=>!Number.isFinite(v))){unsafe=true;continue;}
        const key=JSON.stringify([a,b,c,e]);
        if(!groups.has(key))groups.set(key,{from:a,to:b,nextFrom:c,nextTo:e,nLeft:left.length,nRight:right.length,meanLeft:left.reduce((x,y)=>x+y,0)/left.length,meanRight:right.reduce((x,y)=>x+y,0)/right.length,count:0});
        groups.get(key).count++;
      }
      details.push({date,count:counts[date],groups:[...groups.values()],unsafe});
    }
    return details;
  }
  function showSummary(runs){
    const s=summarize(runs);repeat.textContent='';
    const line=document.createElement('p');let first;
    if(s.sets.length===1)first='All 10 runs found the same stage boundaries. This shows repeatability here, not proof the result is correct.';
    else {
      let arr=s.sets.map(x=>new Set(x.dates));
      let all=new Set(arr.flatMap(x=>[...x]));let shared=[...all].filter(d=>arr.every(x=>x.has(d)));
      first=(all.size-shared.length===1?'One possible change is borderline. ':'One or more possible changes varied between runs. ')+'The broad picture may be useful, but do not rely on the varying boundary without further review.';
    }
    line.textContent=first;repeat.append(line);
    const mainKey=JSON.stringify(boundaries(completed.data));
    const matching=runs.filter(d=>JSON.stringify(boundaries(d))===mainKey).length;
    const main=document.createElement('p');main.textContent=`The chart currently displayed matches ${matching} of the 10 runs exactly.${matching<10?' Review differences before relying on its boundaries.':''}`;repeat.append(main);
    const c=document.createElement('p');c.textContent='Stage counts: '+Object.entries(s.counts).sort((a,b)=>Number(a[0])-Number(b[0])).map(([n,k])=>`${n} stages in ${k} of 10`).join('; ')+'.';repeat.append(c);
    const details=varyingBoundaryDetails(runs);
    if(details.length){
      const title=document.createElement('p');title.textContent='Look more closely at the varying dates (each date is the first observation in a new stage):';repeat.append(title);
      for(const x of details){
        const heading=document.createElement('p');heading.textContent=`${x.date}: found in ${x.count} of 10 runs.`;repeat.append(heading);
        const ul=document.createElement('ul');for(const g of x.groups){
          const li=document.createElement('li'),diff=g.meanRight-g.meanLeft;
          li.textContent=`In ${g.count} ${g.count===1?'run':'runs'}: ${g.from} to ${g.to}, average ${g.meanLeft.toFixed(2)} (${g.nLeft} observations) → ${g.nextFrom} to ${g.nextTo}, average ${g.meanRight.toFixed(2)} (${g.nRight} observations); difference ${diff>=0?'+':''}${diff.toFixed(2)} in the measure’s units.`;ul.append(li);
        }repeat.append(ul);
        if(x.unsafe){const p=document.createElement('p');p.textContent='Some neighbouring stage averages could not be matched safely to the dates. Review the data.';repeat.append(p);}
      }
      const caution=document.createElement('p');caution.textContent='These are observed averages from runs that found each boundary—not separate significance tests or proof of cause. Compare the dates and shape of the dots with what you know about the process.';repeat.append(caution);
    }
    const more=document.createElement('details'),title=document.createElement('summary');title.textContent='See all exact boundary sets';more.append(title);
    const ul=document.createElement('ul');s.sets.sort((a,b)=>b.count-a.count||a.dates.join().localeCompare(b.dates.join())).forEach(x=>{const li=document.createElement('li');li.textContent=`${x.count} of 10: ${x.dates.length?x.dates.join(', '):'no boundaries'}`;ul.append(li);});more.append(ul);repeat.append(more);
    const note=document.createElement('p');note.textContent='Compare the varying dates with the dots and process history; check data quality and possible dependence. More shuffles may reduce random variation, but repeated runs cannot fix dependence or prove a cause.';repeat.append(note);
  }
  runBtn.onclick=()=>{
    if(!completed||repeatWorker)return;
    let runs=[],request=completed.request;runBtn.disabled=true;cancelBtn.hidden=false;repeat.textContent='Starting repeatability check…';
    try{repeatWorker=new Worker('worker.js');}catch(e){stopRepeat();repeat.textContent='Could not start the repeatability check. '+e.message;return;}
    const w=repeatWorker;
    // Each repeat must use fresh random numbers: drop any seed the user entered,
    // otherwise all 10 runs would be identical and the check meaningless.
    const freshRequest=()=>({...request,params:{...request.params,seed:undefined}});
    w.onerror=()=>{if(repeatWorker!==w)return;stopRepeat();repeat.textContent='Repeatability check stopped because the worker encountered an error.';};
    w.onmessage=e=>{
      if(repeatWorker!==w)return;
      if(e.data.status==='ready'){repeat.textContent='Running analysis 1 of 10…';w.postMessage(freshRequest());}
      else if(e.data.status==='error'){stopRepeat();repeat.textContent='Repeatability check stopped: '+e.data.data;}
      else if(e.data.status==='result'){
        runs.push(e.data.data); if(runs.length===10){stopRepeat();showSummary(runs);}
        else {repeat.textContent=`Completed ${runs.length} of 10 runs. Running ${runs.length+1}…`;w.postMessage(freshRequest());}
      }
    };
  };
  cancelBtn.onclick=()=>{stopRepeat();repeat.textContent='Repeatability check cancelled. No partial result is reported.';};
  window.diagnosticUtils={calculateCorrelation,summarize,boundaries,varyingBoundaryDetails};
})();
