// ---- Detailed Graphs: sales & payment breakdown, bucketed by day/week/month.
// Reuses the Report page's own filtered rows (same From/To/search), so the
// graphs always match what's on screen back in Report. ----
const GRAPH_TYPE_COLORS = { 'Reservation': 'var(--ink)', 'Check-in': 'var(--cash)', 'Due Payment': 'var(--danger)' };
const GRAPH_MODE_COLORS = { 'Cash': 'var(--cash)', 'Card': 'var(--account)', 'Bank Transfer': 'var(--gold-deep)' };
let graphsPeriod = 'day';

function setGraphsPeriod(period){
  graphsPeriod = period;
  document.getElementById('gPeriodDay').classList.toggle('active', period === 'day');
  document.getElementById('gPeriodWeek').classList.toggle('active', period === 'week');
  document.getElementById('gPeriodMonth').classList.toggle('active', period === 'month');
  renderGraphs();
}

function graphBucketKey(dateStr){
  if(graphsPeriod === 'month') return dateStr.slice(0, 7);
  if(graphsPeriod === 'week'){
    const dow = new Date(dateStr + 'T00:00:00').getDay();
    const diffToMonday = dow === 0 ? -6 : 1 - dow;
    return addDaysToDateStr(dateStr, diffToMonday);
  }
  return dateStr;
}

function graphBucketLabel(key){
  if(graphsPeriod === 'month'){
    const [y, m] = key.split('-');
    return new Date(parseInt(y,10), parseInt(m,10) - 1, 1).toLocaleDateString('en-GB', { month:'short', year:'numeric' });
  }
  if(graphsPeriod === 'week'){
    return formatDateShort(key) + '–' + formatDateShort(addDaysToDateStr(key, 6));
  }
  return formatDateShort(key);
}

function renderGraphs(){
  const salesEl = document.getElementById('graphSales');
  const caEl = document.getElementById('graphCashAccount');
  const typeEl = document.getElementById('graphByType');
  const modeEl = document.getElementById('graphByMode');
  if(!initialLoadDone){
    salesEl.innerHTML = '<div class="empty-note">' + cloudLoadingNote() + '</div>';
    caEl.innerHTML = ''; typeEl.innerHTML = ''; modeEl.innerHTML = '';
    return;
  }

  const { rows, fromVal, toVal } = getFilteredReportRows();
  document.getElementById('graphsSub').textContent =
    'Sales & payment breakdown, ' + (fromVal || toVal ? `${fromVal ? formatDate(fromVal) : 'Start'} to ${toVal ? formatDate(toVal) : 'Today'}` : 'all dates') +
    ' (from the Report filters)';

  if(rows.length === 0){
    salesEl.innerHTML = '<div class="empty-note">No payments match the current Report filters.</div>';
    caEl.innerHTML = ''; typeEl.innerHTML = ''; modeEl.innerHTML = '';
    return;
  }

  const buckets = {};
  rows.forEach(r=>{
    const key = graphBucketKey(r.date);
    if(!buckets[key]) buckets[key] = { cash:0, account:0, total:0 };
    buckets[key].cash += r.cash;
    buckets[key].account += r.account;
    buckets[key].total += r.total;
  });
  const keys = Object.keys(buckets).sort();

  renderSalesBarChart(salesEl, keys.map(k=> ({ label: graphBucketLabel(k), value: buckets[k].total })));
  renderStackedBarChart(caEl, keys.map(k=> ({ label: graphBucketLabel(k), cash: buckets[k].cash, account: buckets[k].account })));

  const typeTotals = {}, modeTotals = {};
  rows.forEach(r=>{
    typeTotals[r.type] = (typeTotals[r.type] || 0) + r.total;
    modeTotals[r.mode] = (modeTotals[r.mode] || 0) + r.total;
  });
  renderCategoryBarChart(typeEl, typeTotals, GRAPH_TYPE_COLORS);
  renderCategoryBarChart(modeEl, modeTotals, GRAPH_MODE_COLORS);
}

function renderSalesBarChart(container, data){
  const max = Math.max(1, ...data.map(d=> d.value));
  const barMaxH = 140;
  let peak = data[0];
  data.forEach(d=>{ if(d.value > peak.value) peak = d; });
  const bars = data.map(d=>{
    const h = Math.max(2, Math.round((d.value / max) * barMaxH));
    return `<div class="chart-col" title="${d.label}: Rs. ${Math.round(d.value).toLocaleString()}">
      <div class="chart-col-bararea"><div class="chart-col-bar" style="height:${h}px; background:var(--ink);"></div></div>
      <div class="chart-col-label">${d.label}</div>
    </div>`;
  }).join('');
  container.innerHTML = `
    <div class="chart-peak">Peak: <b>Rs. ${Math.round(peak.value).toLocaleString()}</b> (${peak.label})</div>
    <div class="chart-col-track">${bars}</div>`;
}

function renderStackedBarChart(container, data){
  const max = Math.max(1, ...data.map(d=> d.cash + d.account));
  const barMaxH = 140;
  const bars = data.map(d=>{
    const accH = Math.round((d.account / max) * barMaxH);
    const cashH = Math.round((d.cash / max) * barMaxH);
    return `<div class="chart-col" title="${d.label}: Cash Rs. ${Math.round(d.cash).toLocaleString()}, Account Rs. ${Math.round(d.account).toLocaleString()}">
      <div class="chart-col-bararea">
        <div class="chart-col-bar" style="height:${accH}px; background:var(--account); border-radius:4px 4px 0 0;"></div>
        <div style="height:2px; width:100%;"></div>
        <div class="chart-col-bar" style="height:${cashH}px; background:var(--cash); border-radius:0 0 4px 4px;"></div>
      </div>
      <div class="chart-col-label">${d.label}</div>
    </div>`;
  }).join('');
  container.innerHTML = `
    <div class="chart-legend"><span><i style="background:var(--account);"></i> Account</span><span><i style="background:var(--cash);"></i> Cash</span></div>
    <div class="chart-col-track">${bars}</div>`;
}

function renderCategoryBarChart(container, totals, colorMap){
  const entries = Object.entries(totals).filter(([k])=> k).sort((a,b)=> b[1] - a[1]);
  if(entries.length === 0){
    container.innerHTML = '<div class="empty-note">No data.</div>';
    return;
  }
  const max = Math.max(1, ...entries.map(e=> e[1]));
  const rows = entries.map(([label, value])=>{
    const color = colorMap[label] || 'var(--muted)';
    const pct = Math.max(2, Math.round((value / max) * 100));
    return `<div class="chart-hrow">
      <div class="chart-hrow-label">${label}</div>
      <div class="chart-hrow-track"><div class="chart-hrow-bar" style="width:${pct}%; background:${color};"></div></div>
      <div class="chart-hrow-val">Rs. ${Math.round(value).toLocaleString()}</div>
    </div>`;
  }).join('');
  container.innerHTML = `<div class="chart-hbars">${rows}</div>`;
}

