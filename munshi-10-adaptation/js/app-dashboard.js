// ---- Dashboard ----
// A guest entry only records one "Check-in Date" — there's no separate
// reservation-vs-arrival flag — so "expected" vs "actual" for arrivals is a
// heuristic: if the entry was saved to the system before the check-in date
// itself, it was booked ahead of time (still "expected" until that day
// shows up as system activity); if it was saved on/after the check-in date,
// the guest was already there when the front desk logged it ("actual").
// Checkouts have real separate fields (expected "Check-out" vs the actual
// checkout date), so those two are exact, not heuristic.
function buildMovementItem(entry){
  return { entry, t: computeTotals(entry), roomNos: (entry.rooms || []).map(r=> r.roomNo).filter(Boolean).join(', ') };
}

function computeMovement(fromDate, toDate){
  const all = loadAllEntries();
  const expectedCheckins = [];
  const actualCheckins = [];
  const expectedCheckouts = [];
  const actualCheckouts = [];

  all.forEach(entry=>{
    const checkIn = entry.checkIn || '';
    const checkOut = entry.checkOut || '';
    const actualCheckout = getDetailValue(entry, 'Actual Checkout') || '';
    const savedDate = entry.savedAt ? toKarachiDateStr(entry.savedAt) : '';
    const item = buildMovementItem(entry);

    if(checkIn && checkIn >= fromDate && checkIn <= toDate){
      if(savedDate && savedDate < checkIn) expectedCheckins.push(item);
      else actualCheckins.push(item);
    }
    if(checkOut && checkOut >= fromDate && checkOut <= toDate){
      expectedCheckouts.push(item);
    }
    if(actualCheckout && actualCheckout >= fromDate && actualCheckout <= toDate){
      actualCheckouts.push(item);
    }
  });

  return { expectedCheckins, actualCheckins, expectedCheckouts, actualCheckouts };
}

function renderMovementList(containerId, items){
  const el = document.getElementById(containerId);
  if(!el) return;
  if(items.length === 0){
    el.innerHTML = '<div class="empty-note">None.</div>';
    return;
  }
  const sorted = items.slice().sort((a,b)=> getLatestActivity(b.entry).localeCompare(getLatestActivity(a.entry)));
  el.innerHTML = `
    <table>
      <thead><tr><th>Guest</th><th style="width:90px;">Room</th><th style="width:92px;">Check-in</th><th style="width:110px;">Exp. Checkout</th><th style="width:100px;">Due</th><th style="width:84px;">Status</th></tr></thead>
      <tbody>${sorted.map(({entry, t, roomNos})=> `
        <tr style="cursor:pointer;" onclick="openDetail('${entry.id}')" title="Open this guest">
          <td>${entry.guestName || '(no name)'}</td>
          <td>${roomNos || '-'}</td>
          <td>${entry.checkIn ? formatDateShort(entry.checkIn) : '-'}</td>
          <td>${entry.checkOut ? formatDateShort(entry.checkOut) : '-'}</td>
          <td style="font-weight:700; color:${t.due > 0 ? 'var(--danger)' : 'inherit'};">${t.due.toLocaleString()}</td>
          <td><span class="status ${t.status.toLowerCase()}">${t.status}</span></td>
        </tr>`).join('')}</tbody>
    </table>`;
}

function setDash(key, val){
  document.querySelectorAll(`[data-dash="${key}"]`).forEach(el=> el.textContent = val);
}

function renderDashboard(){
  const keys = ['arrivals','inhouse','departures','checkedout','occ','ready','dirty','ooo','nightocc','nightavail'];
  if(!initialLoadDone){
    keys.forEach(k=> setDash(k, '…'));
    return;
  }
  const today = todayStr();
  const rooms = computeRoomStatuses(today);
  const totalRooms = rooms.length;
  const occupiedCount = rooms.filter(r=> r.occupied).length;
  const vacantCount = totalRooms - occupiedCount;
  const move = computeMovement(today, today);

  setDash('arrivals', move.expectedCheckins.length + move.actualCheckins.length);
  setDash('inhouse', occupiedCount);
  setDash('departures', move.expectedCheckouts.length);
  setDash('checkedout', move.actualCheckouts.length);
  setDash('occ', occupiedCount);
  setDash('ready', vacantCount);
  setDash('dirty', 0);
  setDash('ooo', 0);
  setDash('nightocc', occupiedCount);
  setDash('nightavail', vacantCount);
}

