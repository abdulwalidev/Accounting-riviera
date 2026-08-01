// ---- Report: Payment Detail per day ----
function getFilteredReportRows(){
  const all = loadAllEntries();

  const fromVal = document.getElementById('filterFrom').value;
  const toVal = document.getElementById('filterTo').value;
  const searchVal = document.getElementById('filterSearch').value.trim().toLowerCase();
  const cashSearchVal = document.getElementById('filterCashSearch').value.replace(/,/g,'').trim();

  // flatten payments with guest + booking info attached, for filtering by "anything"
  let rows = [];
  all.forEach(entry=>{
    const roomNos = (entry.rooms || []).map(r=>r.roomNo).filter(Boolean).join(', ');
    (entry.payments || []).forEach(p=>{
      if(!p.date) return;
      rows.push({
        id: entry.id,
        date: p.date,
        guest: entry.guestName || '(no name)',
        father: entry.fatherName || '',
        cnic: entry.cnic || '',
        roomNos: roomNos,
        type: p.type,
        mode: p.mode,
        bank: p.bank || '',
        remarks: p.remarks || '',
        by: p.createdBy || entry.savedBy || '',
        cash: p.cash || 0,
        account: p.account || 0,
        total: p.total || 0
      });
    });
  });

  // date range filter
  if(fromVal){
    rows = rows.filter(r => r.date >= fromVal);
  }
  if(toVal){
    rows = rows.filter(r => r.date <= toVal);
  }

  // search across everything
  if(searchVal){
    const searchValNoDash = stripDashes(searchVal);
    rows = rows.filter(r=>{
      const haystack = [
        r.guest, r.father, r.cnic,
        r.roomNos, r.type, r.mode, r.bank, r.remarks, r.date
      ].join(' ').toLowerCase();
      return haystack.includes(searchVal) || stripDashes(haystack).includes(searchValNoDash);
    });
  }

  // search by any amount (cash, account, or total), comma or no comma (e.g. "31250" or "31,250")
  if(cashSearchVal){
    rows = rows.filter(r =>
      String(r.cash).includes(cashSearchVal) ||
      String(r.account).includes(cashSearchVal) ||
      String(r.total).includes(cashSearchVal)
    );
  }

  return { rows, fromVal, toVal, searchVal, cashSearchVal };
}

function renderReport(){
  const container = document.getElementById('reportBody');
  const barEl = document.getElementById('reportGrandbar');
  if(!initialLoadDone){
    container.innerHTML = '<div class="empty-note">' + cloudLoadingNote() + '</div>';
    barEl.style.display = 'none';
    return;
  }
  const { rows, fromVal, toVal } = getFilteredReportRows();

  const subParts = [];
  subParts.push(fromVal || toVal ? `${fromVal ? formatDate(fromVal) : 'Start'} to ${toVal ? formatDate(toVal) : 'Today'}` : 'All dates');
  subParts.push('Generated ' + formatDate(todayStr()));
  document.getElementById('printHeaderSub').textContent = subParts.join('  ·  ');

  if(rows.length === 0){
    container.innerHTML = '<div class="empty-note">No payments match these filters.</div>';
    barEl.style.display = 'none';
    return;
  }

  // group by date, newest first
  const groups = {};
  rows.forEach(r=>{
    if(!groups[r.date]) groups[r.date] = [];
    groups[r.date].push(r);
  });
  const dates = Object.keys(groups).sort((a,b)=> b.localeCompare(a));

  let grandCash = 0, grandAccount = 0, grandTotal = 0;
  let html = '';

  dates.forEach(date=>{
    const dayRows = groups[date];
    let dayTotal = 0;
    let bodyRows = '';
    dayRows.forEach(r=>{
      dayTotal += r.total;
      grandCash += r.cash;
      grandAccount += r.account;
      const isCash = r.mode === 'Cash';
      bodyRows += `
        <tr class="${isCash ? 'mode-cash' : 'mode-bank'}" style="cursor:pointer;" onclick="openDetail('${r.id}')" title="Open this guest">
          <td>${r.guest}</td>
          <td>${r.type}</td>
          <td><span class="mode-badge ${isCash ? 'cash' : 'bank'}">${r.mode}</span></td>
          <td>${r.bank || '-'}</td>
          <td>${r.remarks || '-'}</td>
          <td>${r.roomNos || '-'}</td>
          <td class="cash-amt">${r.cash ? r.cash.toLocaleString() : '-'}</td>
          <td class="account-amt">${r.account ? r.account.toLocaleString() : '-'}</td>
          <td class="rowtotal ${isCash ? 'cash-amt' : 'account-amt'}">${r.total.toLocaleString()}</td>
        </tr>`;
    });
    grandTotal += dayTotal;

    html += `
      <div class="day-group">
        <div class="day-head">
          <span>${formatDate(date)}</span>
          <span class="day-total">Rs. ${dayTotal.toLocaleString()}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Guest</th>
              <th style="width:100px;">Type</th>
              <th style="width:90px;">Mode</th>
              <th style="width:90px;">Bank</th>
              <th style="width:140px;">Remarks</th>
              <th style="width:120px;">Room No</th>
              <th style="width:100px;">Cash</th>
              <th style="width:100px;">Account</th>
              <th style="width:100px;">Total</th>
            </tr>
          </thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>`;
  });

  container.innerHTML = html;
  barEl.style.display = 'flex';
  document.getElementById('repCash').textContent = grandCash.toLocaleString();
  document.getElementById('repAccount').textContent = grandAccount.toLocaleString();
  document.getElementById('repGrand').textContent = grandTotal.toLocaleString();
}

function formatDate(iso){
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
}

function formatDateShort(iso){
  if(!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short' });
}

