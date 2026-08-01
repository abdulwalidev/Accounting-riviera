// ---- Today's Entries: everything saved today, newest at the top ----
function renderTodayEntries(){
  const box = document.getElementById('todayEntriesBody');
  if(!initialLoadDone){
    box.innerHTML = '<div class="empty-note">' + cloudLoadingNote() + '</div>';
    return;
  }
  const all = loadAllEntries();
  const t = todayStr();
  const todays = all.filter(e => e.savedAt && toKarachiDateStr(e.savedAt) === t);
  if(todays.length === 0){
    box.innerHTML = '<div class="empty-note">No entries saved today yet.</div>';
    return;
  }
  todays.sort((a,b)=> (b.savedAt || '').localeCompare(a.savedAt || ''));
  box.innerHTML = `
    <table>
      <thead>
        <tr>
          <th style="width:70px;">Time</th>
          <th>Guest</th>
          <th>Rooms</th>
          <th style="width:140px;">Entered By</th>
          <th style="width:120px;">Booking Total</th>
          <th style="width:100px;">Paid</th>
          <th style="width:100px;">Due</th>
          <th style="width:90px;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${todays.map(e=>{
          const tt = computeTotals(e);
          const roomNos = (e.rooms || []).map(r=>r.roomNo).filter(Boolean).join(', ');
          const time = e.savedAt ? new Date(e.savedAt).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', timeZone:'Asia/Karachi' }) : '-';
          return `<tr style="cursor:pointer;" onclick="openDetail('${e.id}')" title="Open this guest">
            <td>${time}</td>
            <td>${e.guestName || '(no name)'}</td>
            <td>${roomNos || '-'}</td>
            <td>${(e.editedBy || e.savedBy) ? (e.editedBy && e.editedBy !== e.savedBy ? (e.savedBy || '-') + ' <span style="color:var(--muted);">(edited: ' + e.editedBy + ')</span>' : (e.savedBy || e.editedBy)) : '-'}</td>
            <td>${tt.bookingTotal.toLocaleString()}</td>
            <td class="cash-amt">${tt.paid.toLocaleString()}</td>
            <td style="font-weight:700; color:${tt.due > 0 ? 'var(--danger)' : 'inherit'};">${tt.due.toLocaleString()}</td>
            <td><span class="status ${tt.status.toLowerCase()}">${tt.status}</span></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

