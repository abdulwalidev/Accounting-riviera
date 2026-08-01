// ---- Search page ----
let currentDetailId = null;
// payments added in this session, so the history can flag them with NEW!
const newPaymentIds = new Set();

function renderSearch(){
  if(!initialLoadDone){
    document.getElementById('gsearchList').innerHTML = '<div class="empty-note">' + cloudLoadingNote() + '</div>';
    return;
  }
  const all = loadAllEntries();
  const searchVal = document.getElementById('gsearchInput').value.trim().toLowerCase();
  const dueOnly = document.getElementById('gsearchDueOnly').checked;
  const hideCheckedOut = document.getElementById('gsearchHideCheckedOut').checked;
  const showZero = document.getElementById('gsearchShowZero').checked;
  const dateVal = document.getElementById('gsearchDate').value;
  document.getElementById('gsearchDateReadout').textContent = dateVal ? formatDate(dateVal) : '';
  const listEl = document.getElementById('gsearchList');

  let items = all.map(entry=>{
    const t = computeTotals(entry);
    const roomNos = (entry.rooms || []).map(r=>r.roomNo).filter(Boolean).join(', ');
    return { entry, t, roomNos };
  });

  // Free stays (owner's guests — rent typed as "Guest", total booking = 0)
  // are hidden by default; "Show 0Rs guests" brings them back in.
  if(!showZero){
    items = items.filter(({t})=> t.bookingTotal > 0);
  }

  if(searchVal){
    const searchValNoDash = stripDashes(searchVal);
    items = items.filter(({entry, roomNos})=>{
      const haystack = [
        entry.guestName, entry.fatherName, entry.cnic, roomNos,
        (entry.extraDetails || []).map(d=>d.value).join(' ')
      ].join(' ').toLowerCase();
      return haystack.includes(searchVal) || stripDashes(haystack).includes(searchValNoDash);
    });
  }

  // "System Entry Date" means any system activity that day — a new guest
  // entry, an edit to one, or a new payment added (even if the payment's
  // own date is backdated) — not just entries first created that day.
  if(dateVal){
    items = items.filter(({entry})=>
      (entry.savedAt && toKarachiDateStr(entry.savedAt) === dateVal) ||
      (entry.editedAt && toKarachiDateStr(entry.editedAt) === dateVal) ||
      (entry.payments || []).some(p=> p.enteredAt && toKarachiDateStr(p.enteredAt) === dateVal)
    );
  }

  if(dueOnly){
    items = items.filter(({t})=> t.due > 0);
  }

  if(hideCheckedOut){
    items = items.filter(({entry})=> !getDetailValue(entry, 'Actual Checkout'));
  }

  if(items.length === 0){
    listEl.innerHTML = '<div class="empty-note">No guests match.</div>';
    return;
  }

  // Sort by latest activity (created, edited, or a payment added), newest
  // first — always, filtered or not.
  items.sort((a,b)=> getLatestActivity(b.entry).localeCompare(getLatestActivity(a.entry)));

  listEl.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Guest</th>
          <th style="width:120px;">Room</th>
          <th style="width:140px;">CNIC</th>
          <th style="width:100px;">Entry Date</th>
          <th style="width:100px;">Check-in</th>
          <th style="width:100px;">Expected Checkout</th>
          <th style="width:100px;">Actual Checkout</th>
          <th style="width:110px;">Total</th>
          <th style="width:100px;">Paid</th>
          <th style="width:100px;">Due</th>
          <th style="width:90px;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(({entry, t, roomNos})=>{
          const statusClass = t.status.toLowerCase();
          const actualCheckout = getDetailValue(entry, 'Actual Checkout');
          return `<tr style="cursor:pointer;" onclick="openDetail('${entry.id}')" title="Open this guest">
            <td>${entry.guestName || '(no name)'}</td>
            <td>${roomNos || '-'}</td>
            <td>${entry.cnic || '-'}</td>
            <td>${entry.savedAt ? formatDate(toKarachiDateStr(entry.savedAt)) : '-'}</td>
            <td>${entry.checkIn ? formatDate(entry.checkIn) : '-'}</td>
            <td>${entry.checkOut ? formatDate(entry.checkOut) : '-'}</td>
            <td>${actualCheckout ? formatDate(actualCheckout) : '-'}</td>
            <td>${t.bookingTotal.toLocaleString()}</td>
            <td class="cash-amt">${t.paid.toLocaleString()}</td>
            <td style="font-weight:700; color:${t.due > 0 ? 'var(--danger)' : 'inherit'};">${t.due.toLocaleString()}</td>
            <td><span class="status ${statusClass}">${t.status}</span></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

