// =========================================================
// LEDGERS — room-night by room-night. A booking stores one row per room
// with a single rent/day and a night count; this expands that into one row
// per actual calendar night. Payments aren't tied to a specific night, so
// they're applied oldest-night-first (FIFO): a payment bigger than one
// night's rent rolls over to cover the next night(s); a night bigger than
// one payment gets topped up by whichever payment comes next. Balance per
// row is that night alone (Debt − Credit received against it) — never
// negative, since a night can't receive more than its own rent.
// =========================================================
function addDaysToDateStr(dateStr, days){
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildLedgersRecords(){
  const all = loadAllEntries();
  const records = [];
  all.forEach(entry=>{
    const startDate = entry.checkIn || (entry.savedAt ? toKarachiDateStr(entry.savedAt) : '');
    if(!startDate) return;
    const guest = entry.guestName || '(no name)';

    const nights = [];
    (entry.rooms || []).forEach(r=>{
      if(!r.roomNo) return;
      const nightsCount = parseInt(r.count) || 1;
      const rent = parseFloat(String(r.rent).replace(/,/g,'')) || 0;
      for(let i = 0; i < nightsCount; i++){
        nights.push({ date: addDaysToDateStr(startDate, i), roomNo: r.roomNo, rent, received: 0, guestId: entry.id, guest });
      }
    });
    nights.sort((a,b)=> a.date.localeCompare(b.date));

    const payments = (entry.payments || [])
      .slice()
      .sort((a,b)=> (a.date || '').localeCompare(b.date || ''))
      .map(p=> ({ remaining: parseFloat(p.total) || 0 }));

    let payIdx = 0;
    nights.forEach(night=>{
      let owed = night.rent;
      while(owed > 0 && payIdx < payments.length){
        const pay = payments[payIdx];
        if(pay.remaining <= 0){ payIdx++; continue; }
        const applied = Math.min(owed, pay.remaining);
        night.received += applied;
        pay.remaining -= applied;
        owed -= applied;
        if(pay.remaining <= 0) payIdx++;
      }
    });

    records.push(...nights);
  });
  return records;
}

function populateLedgersPersonSelect(){
  const sel = document.getElementById('lgPersonSelect');
  const prev = sel.value;
  const all = loadAllEntries().slice().sort((a,b)=> (a.guestName || '').localeCompare(b.guestName || ''));
  sel.innerHTML = '<option value="">All Guests</option>' + all.map(e=>
    `<option value="${e.id}">${(e.guestName || '(no name)')}${e.cnic ? ' — ' + e.cnic : ''}</option>`
  ).join('');
  if(prev && all.some(e=> e.id === prev)) sel.value = prev;
}

function updateLedgersDateReadouts(){
  const fromVal = document.getElementById('lgFrom').value;
  const toVal = document.getElementById('lgTo').value;
  document.getElementById('lgFromReadout').textContent = fromVal ? formatDate(fromVal) : '';
  document.getElementById('lgToReadout').textContent = toVal ? formatDate(toVal) : '';
}

function clearLedgersFilters(){
  document.getElementById('lgFrom').value = '';
  document.getElementById('lgTo').value = '';
  document.getElementById('lgPersonSelect').value = '';
  updateLedgersDateReadouts();
  renderLedgers();
}

function setLedgersToday(){
  const t = todayStr();
  document.getElementById('lgFrom').value = t;
  document.getElementById('lgTo').value = t;
  updateLedgersDateReadouts();
  renderLedgers();
}

function getFilteredLedgersRecords(){
  const fromVal = document.getElementById('lgFrom').value;
  const toVal = document.getElementById('lgTo').value;
  const personId = document.getElementById('lgPersonSelect').value;

  let rows = buildLedgersRecords();
  if(fromVal) rows = rows.filter(r=> r.date >= fromVal);
  if(toVal) rows = rows.filter(r=> r.date <= toVal);
  if(personId) rows = rows.filter(r=> r.guestId === personId);

  // sorted by guest (so a guest's nights land next to each other), then
  // by date within that guest — the multi-night "connected" read
  rows.sort((a,b)=> a.guest.localeCompare(b.guest) || a.date.localeCompare(b.date) || a.roomNo.localeCompare(b.roomNo));
  return { rows, fromVal, toVal };
}

function renderLedgers(){
  const container = document.getElementById('ledgersBody');
  const barEl = document.getElementById('ledgersGrandbar');
  if(!initialLoadDone){
    container.innerHTML = '<div class="empty-note">' + cloudLoadingNote() + '</div>';
    barEl.style.display = 'none';
    return;
  }
  populateLedgersPersonSelect();

  const { rows, fromVal, toVal } = getFilteredLedgersRecords();

  const subParts = [];
  subParts.push(fromVal || toVal ? `${fromVal ? formatDate(fromVal) : 'Start'} to ${toVal ? formatDate(toVal) : 'Today'}` : 'All dates');
  const sel = document.getElementById('lgPersonSelect');
  if(sel.value && sel.selectedIndex >= 0) subParts.push(sel.options[sel.selectedIndex].textContent);
  subParts.push('Generated ' + formatDate(todayStr()));
  document.getElementById('lgPrintHeaderSub').textContent = subParts.join('  ·  ');

  if(rows.length === 0){
    container.innerHTML = '<div class="empty-note">No room-nights match these filters.</div>';
    barEl.style.display = 'none';
    return;
  }

  let totalDebt = 0, totalCredit = 0, totalBalance = 0;
  let lastGuestId = null;
  const bodyRows = rows.map(r=>{
    const balance = r.rent - r.received;
    totalDebt += r.rent;
    totalCredit += r.received;
    totalBalance += balance;
    // A guest's second and later night in the list reads as a continuation
    // of the row above it (same guest, next night) rather than a fresh,
    // unrelated entry — a small tree connector plus a lighter name marks
    // that, instead of repeating the full-strength name on every row.
    const isContinuation = r.guestId === lastGuestId;
    lastGuestId = r.guestId;
    const nameCell = isContinuation
      ? `<span class="lg-connector">↳</span><span class="lg-name-continued">${r.guest}</span>`
      : `<span class="lg-name-primary">${r.guest}</span>`;
    return `
      <tr style="cursor:pointer;" onclick="openDetail('${r.guestId}')" title="Open this guest">
        <td>${formatDate(r.date)}</td>
        <td>${nameCell}</td>
        <td>${r.roomNo}</td>
        <td class="cash-amt">${r.received ? r.received.toLocaleString() : '-'}</td>
        <td>${r.rent.toLocaleString()}</td>
        <td style="font-weight:700; color:${balance > 0 ? 'var(--danger)' : 'inherit'};">${balance.toLocaleString()}</td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <table>
      <thead>
        <tr><th style="width:100px;">Date</th><th>Name</th><th style="width:110px;">Room No</th><th style="width:110px;">Credit</th><th style="width:110px;">Debt</th><th style="width:110px;">Balance</th></tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>`;

  barEl.style.display = 'flex';
  document.getElementById('lgDebt').textContent = totalDebt.toLocaleString();
  document.getElementById('lgCredit').textContent = totalCredit.toLocaleString();
  document.getElementById('lgBalance').textContent = totalBalance.toLocaleString();
}

function exportLedgersExcel(){
  const { rows } = getFilteredLedgersRecords();
  if(rows.length === 0){ showNotice('No room-nights match the current filters.'); return; }
  const data = rows.map(r=> ({
    'Date': formatDate(r.date),
    'Name': r.guest,
    'Room No': r.roomNo,
    'Credit': r.received,
    'Debt': r.rent,
    'Balance': r.rent - r.received
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [{wch:12},{wch:20},{wch:14},{wch:12},{wch:12},{wch:12}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ledgers');
  XLSX.writeFile(wb, `ledgers-${todayStr()}.xlsx`);
}

function printLedgers(){
  const { rows } = getFilteredLedgersRecords();
  if(rows.length === 0){ showNotice('No room-nights match the current filters.'); return; }
  window.print();
}

