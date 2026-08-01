// ---- Guest detail page ----
function openDetail(id){
  currentDetailId = id;
  showView('detail');
  renderDetail();
}

function getCurrentEntry(){
  const all = loadAllEntries();
  return all.find(e=> e.id === currentDetailId);
}

function renderDetail(){
  const entry = getCurrentEntry();
  if(!entry){
    showView('search');
    return;
  }
  document.getElementById('detailName').textContent = entry.guestName || '(no name)';
  const metaParts = [];
  if(entry.savedAt) metaParts.push('Entered ' + formatDate(toKarachiDateStr(entry.savedAt)) + (entry.savedBy ? ' by ' + entry.savedBy : ''));
  if(entry.editedAt) metaParts.push('Last edited ' + formatDate(toKarachiDateStr(entry.editedAt)) + (entry.editedBy ? ' by ' + entry.editedBy : ''));
  document.getElementById('detailMeta').textContent = metaParts.join('  ·  ');

  const resBadge = document.getElementById('detailResBadge');
  const resStatus = entry.resStatus || null;
  resBadge.textContent = reservationStatusLabel(entry);
  resBadge.className = 'res-status-badge ' + (resStatus || 'active');
  resBadge.style.display = resStatus ? '' : 'none';
  document.getElementById('cancelResBtn').style.display = resStatus ? 'none' : '';
  document.getElementById('noShowResBtn').style.display = resStatus ? 'none' : '';
  document.getElementById('reactivateResBtn').style.display = resStatus ? '' : 'none';

  document.getElementById('dGuestName').value = entry.guestName || '';
  document.getElementById('dFatherName').value = entry.fatherName || '';
  document.getElementById('dCnic').value = entry.cnic || '';
  document.getElementById('dContactNo').value = getDetailValue(entry, 'Contact No') || '—';
  document.getElementById('dCheckIn').value = entry.checkIn ? formatDate(entry.checkIn) : '—';
  document.getElementById('dCheckOut').value = entry.checkOut ? formatDate(entry.checkOut) : '—';
  const actualCheckout = getDetailValue(entry, 'Actual Checkout');
  document.getElementById('dActualCheckout').value = actualCheckout ? formatDate(actualCheckout) : '—';
  document.getElementById('dExtraDetails').innerHTML = visibleExtraDetails(entry).map(d=>
    `<div><div class="confirm-lbl">${d.kind}</div><div class="confirm-val">${formatExtraDetail(d)}</div></div>`
  ).join('');

  const roomBody = document.getElementById('detailRoomBody');
  roomBody.innerHTML = (entry.rooms || []).map(r=>`
    <tr>
      <td>${r.roomNo || '-'}</td>
      <td>${r.unitType || detectUnitType(r.roomNo) || '-'}</td>
      <td>${Number(r.rent || 0).toLocaleString()}</td>
      <td>${r.count || 1}</td>
      <td>${r.movedOut ? formatDate(r.movedOut) : '-'}</td>
      <td class="rowtotal">${(parseFloat(String(r.total || 0).replace(/,/g,'')) || 0).toLocaleString()}</td>
    </tr>`).join('') || '<tr><td colspan="6" class="empty-note">No rooms.</td></tr>';

  const payBody = document.getElementById('detailPayBody');
  const payments = (entry.payments || []).slice().sort((a,b)=> (a.date||'').localeCompare(b.date||''));
  payBody.innerHTML = payments.map(p=>{
    const isCash = p.mode === 'Cash';
    return `
    <tr class="${isCash ? 'mode-cash' : 'mode-bank'}">
      <td>${p.id && newPaymentIds.has(p.id) ? '<span class="new-flag">NEW!</span>' : ''}${formatDate(p.date)}</td>
      <td>${p.type}</td>
      <td><span class="mode-badge ${isCash ? 'cash' : 'bank'}">${p.mode}</span></td>
      <td>${p.bank || '-'}</td>
      <td>${p.remarks || '-'}</td>
      <td>${p.createdBy || '-'}</td>
      <td class="cash-amt">${p.cash ? Number(p.cash).toLocaleString() : '-'}</td>
      <td class="account-amt">${p.account ? Number(p.account).toLocaleString() : '-'}</td>
      <td class="rowtotal ${isCash ? 'cash-amt' : 'account-amt'}">${Number(p.total).toLocaleString()}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="9" class="empty-note">No payments yet.</td></tr>';

  renderChangeLog(entry);

  const t = computeTotals(entry);
  document.getElementById('dSumBooking').textContent = t.bookingTotal.toLocaleString();
  document.getElementById('dSumPaid').textContent = t.paid.toLocaleString();
  document.getElementById('dSumDue').textContent = t.due.toLocaleString();
  const statusEl = document.getElementById('dSumStatus');
  statusEl.className = 'status ' + t.status.toLowerCase();
  statusEl.textContent = t.status;

  // room detail starts collapsed every time the page opens
  document.getElementById('roomDetailCollapse').style.display = 'none';
  document.getElementById('roomCollapseChev').textContent = '▸ Show';
}

function cancelCurrentReservation(){
  const entry = getCurrentEntry();
  if(!entry) return;
  if(!confirm('Mark "' + (entry.guestName || 'this guest') + '" as Cancelled?')) return;
  setReservationStatus(entry.id, 'cancelled');
  renderDetail();
}
function markCurrentNoShow(){
  const entry = getCurrentEntry();
  if(!entry) return;
  if(!confirm('Mark "' + (entry.guestName || 'this guest') + '" as No-show?')) return;
  setReservationStatus(entry.id, 'no_show');
  renderDetail();
}
function reactivateCurrentReservation(){
  const entry = getCurrentEntry();
  if(!entry) return;
  setReservationStatus(entry.id, null);
  renderDetail();
}

// Every recorded action on this entry, newest first: who did what, when.
// The log is append-only on the server — nothing in the app can rewrite it.
const LOG_ACTION_LABELS = {
  created: 'Entry created', edited: 'Entry edited', payment_added: 'Payment added',
  res_cancelled: 'Reservation cancelled', res_no_show: 'Marked no-show', res_reactivated: 'Reservation reactivated',
  deleted: 'Entry deleted'
};

function renderChangeLog(entry){
  const box = document.getElementById('detailChangeLog');
  const logs = getLogsFor(entry.id);
  if(logs.length === 0){
    // entries saved before tracking existed have no log rows — fall back
    // to the stamps stored on the entry itself
    box.innerHTML = '<div class="empty-note">No change history recorded for this entry' + (entry.savedAt ? ' (saved before change tracking was added)' : '') + '.</div>';
    return;
  }
  box.innerHTML = `
    <table>
      <thead>
        <tr>
          <th style="width:170px;">When</th>
          <th style="width:160px;">Action</th>
          <th>By</th>
          <th style="width:90px;">Role</th>
        </tr>
      </thead>
      <tbody>
        ${logs.map(l=>`
          <tr>
            <td>${fmtLogTime(l.at)}</td>
            <td>${LOG_ACTION_LABELS[l.action] || l.action}</td>
            <td>${l.username || '-'}</td>
            <td><span class="mode-badge ${l.role === 'admin' ? 'bank' : 'cash'}">${l.role || '-'}</span></td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function fmtLogTime(iso){
  if(!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric', timeZone:'Asia/Karachi' })
    + ', ' + d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', timeZone:'Asia/Karachi' });
}

function toggleRoomDetail(){
  const box = document.getElementById('roomDetailCollapse');
  const chev = document.getElementById('roomCollapseChev');
  const isOpen = box.style.display !== 'none';
  box.style.display = isOpen ? 'none' : 'block';
  chev.textContent = isOpen ? '▸ Show' : '▾ Hide';
}

