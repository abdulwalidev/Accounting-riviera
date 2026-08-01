// ---- Munshi mode: room-type breakdown for the Reservations dashboard.
// Counts come straight off the master room/apartment lists — no fixed rate
// plan is configured anywhere in this system, so Rate is the average rent
// actually charged per type across current bookings (real data, not a
// fabricated price list). ----
function roomTypeCounts(){
  const counts = {};
  ROOM_NUMBERS.forEach(n=>{
    const type = getRoomType(n) || 'Other';
    counts[type] = (counts[type] || 0) + 1;
  });
  if(APARTMENT_NUMBERS.length) counts['3 Bed Apartment'] = APARTMENT_NUMBERS.length;
  return Object.entries(counts).sort((a,b)=> b[1] - a[1]);
}
function avgRentByType(){
  const sums = {};
  loadAllEntries().forEach(entry=>{
    (entry.rooms || []).forEach(r=>{
      const type = getRoomType(r.roomNo) || detectUnitType(r.roomNo) || 'Other';
      const rent = num(r.rent);
      if(!rent) return;
      const s = sums[type] || (sums[type] = { total:0, count:0 });
      s.total += rent; s.count++;
    });
  });
  return sums;
}
function renderMnRoomTypes(){
  const el = document.getElementById('mnRoomTypes');
  if(!el) return;
  const avgRent = avgRentByType();
  el.innerHTML = `
    <div class="mn-ratetable-row" style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:#8a8f98;">
      <span class="mn-ratetable-type">Room Type</span><span style="flex:0 0 auto; width:34px; text-align:center;">Rooms</span><span class="mn-ratetable-count" style="width:70px; text-align:right;">Rate</span>
    </div>` +
    roomTypeCounts().map(([type, count])=>{
      const avg = avgRent[type];
      const rate = avg ? Math.round(avg.total / avg.count).toLocaleString() : '-';
      return `<div class="mn-ratetable-row">
        <span class="mn-ratetable-type">${type}</span>
        <span style="flex:0 0 auto; width:34px; text-align:center; color:#8a8f98;">${count}</span>
        <span class="mn-ratetable-count" style="width:70px; text-align:right;">${rate}</span>
      </div>`;
    }).join('');
}
function mnScrollToResvList(){
  const el = document.getElementById('resvListPanel');
  if(el) el.scrollIntoView({ behavior:'smooth', block:'start' });
}

// ---- Munshi mode: dense "Reservations Report" table, styled after the
// reference PMS's report view. Same items/search as the Smart-mode list
// above (renderReservations builds both from one filtered array) — only
// Company (an optional extra detail, defaults to "Walkin Guests" when
// unset, same as the reference product) and Payment (the mode of the
// first payment on file) are new fields, both backed by real data. ----
function renderMnResvReport(items){
  const el = document.getElementById('mnResvReport');
  if(!el) return;
  if(items.length === 0){
    el.innerHTML = '<div class="empty-note">No upcoming reservations.</div>';
    return;
  }
  let sumRate = 0, sumDue = 0, sumNights = 0;
  const rows = items.map(({entry, t, roomNos})=>{
    const roomType = (entry.rooms || []).map(r=> getRoomType(r.roomNo)).filter(Boolean)[0] || '-';
    const company = getDetailValue(entry, 'Company Name') || 'Walkin Guests';
    const mobile = getDetailValue(entry, 'Contact No') || '-';
    const mode = (entry.payments && entry.payments[0] && entry.payments[0].mode) || '-';
    const nights = (entry.checkIn && entry.checkOut)
      ? Math.max(1, Math.round((new Date(entry.checkOut) - new Date(entry.checkIn)) / 86400000))
      : 0;
    sumRate += t.bookingTotal;
    sumDue += t.due;
    sumNights += nights;
    return `<tr>
      <td>${roomNos || 'NA'}</td>
      <td>${roomType}</td>
      <td><span class="mn-report-link" onclick="openDetail('${entry.id}')" title="Open this guest">${entry.guestName || '(no name)'}</span></td>
      <td>${company}</td>
      <td>${mobile}</td>
      <td>${t.bookingTotal.toLocaleString()}</td>
      <td>${mode.toLowerCase()}</td>
      <td>${formatDate(entry.checkIn)}</td>
      <td>${entry.checkOut ? formatDate(entry.checkOut) : '-'}</td>
      <td style="color:${t.due > 0 ? 'var(--danger)' : 'inherit'};">${t.due.toLocaleString()}</td>
      <td>${nights}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <table class="mn-report-table">
      <thead>
        <tr>
          <th>Room</th><th>Roomtype</th><th>Guest name</th><th>Company</th><th>Mobile</th>
          <th>Rate</th><th>Payment</th><th>Checkin</th><th>Checkout</th><th>Due</th><th>Nights</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td>${items.length}</td><td></td><td></td><td></td><td></td>
          <td>${sumRate.toLocaleString()}</td><td></td><td></td><td></td>
          <td>${sumDue.toLocaleString()}</td><td>${sumNights}</td>
        </tr>
      </tfoot>
    </table>
    <div class="mn-report-footer">${currentUser ? currentUser.username : ''} &middot; ${new Date().toLocaleString()}</div>`;
}

// ---- Munshi mode: last 10 reservations split into Active / Cancelled /
// No-show columns, like the reference PMS's dashboard. Sorted by most
// recent activity first (same idea as the entry-side "latest activity"
// sort), independent of check-in date so past stays still show up. ----
function renderMnLastReservations(){
  const el = document.getElementById('mnLastResv');
  if(!el) return;
  const all = loadAllEntries().slice().sort((a,b)=> getLatestActivity(b).localeCompare(getLatestActivity(a)));
  const groups = {
    active: all.filter(e=> !e.resStatus).slice(0, 10),
    cancelled: all.filter(e=> e.resStatus === 'cancelled').slice(0, 10),
    no_show: all.filter(e=> e.resStatus === 'no_show').slice(0, 10)
  };
  const cols = [
    ['active', 'active', 'Active'],
    ['cancelled', 'cancelled', 'Cancelled'],
    ['no_show', 'no_show', 'No show']
  ];
  el.innerHTML = cols.map(([key, dotClass, label])=>{
    const rows = groups[key].map(entry=>{
      const roomType = (entry.rooms || []).map(r=> getRoomType(r.roomNo)).filter(Boolean)[0] || 'NA';
      const t = computeTotals(entry);
      const resDate = entry.savedAt ? formatDate(toKarachiDateStr(entry.savedAt)) : '-';
      const nights = (entry.checkIn && entry.checkOut)
        ? Math.max(1, Math.round((new Date(entry.checkOut) - new Date(entry.checkIn)) / 86400000))
        : 0;
      return `<tr style="cursor:pointer;" onclick="openDetail('${entry.id}')" title="Open this guest">
        <td>${entry.id.slice(-6)}</td>
        <td>${entry.guestName || '(no name)'}</td>
        <td>${roomType}</td>
        <td>${resDate}</td>
        <td>${entry.checkIn ? formatDate(entry.checkIn) : '-'}</td>
        <td>${nights}</td>
        <td>${t.bookingTotal.toLocaleString()}</td>
        <td>${entry.savedBy || '-'}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="8" class="empty-note">None.</td></tr>';
    return `
      <div class="mn-card">
        <div class="mn-card-title with-dot"><span class="mn-status-dot ${dotClass}"></span>${label}</div>
        <div style="overflow-x:auto;">
          <table class="mn-report-table">
            <thead><tr><th>ID</th><th>Name</th><th>Type</th><th>Res Date</th><th>Check-in</th><th>Nts</th><th>Rate</th><th>User</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }).join('');
}

// ---- Reservations: entries booked for a future check-in date, soonest first ----
function renderReservations(){
  renderMnRoomTypes();
  renderMnLastReservations();
  const listEl = document.getElementById('resvList');
  const mnEl = document.getElementById('mnResvReport');
  if(!initialLoadDone){
    const note = '<div class="empty-note">' + cloudLoadingNote() + '</div>';
    listEl.innerHTML = note;
    if(mnEl) mnEl.innerHTML = note;
    return;
  }
  const all = loadAllEntries();
  const today = todayStr();
  const searchVal = document.getElementById('resvSearchInput').value.trim().toLowerCase();

  let items = all
    .filter(entry=> entry.checkIn && entry.checkIn > today && !entry.resStatus)
    .map(entry=>{
      const t = computeTotals(entry);
      const roomNos = (entry.rooms || []).map(r=> r.roomNo).filter(Boolean).join(', ');
      return { entry, t, roomNos };
    });

  if(searchVal){
    const searchValNoDash = stripDashes(searchVal);
    items = items.filter(({entry, roomNos})=>{
      const haystack = [entry.guestName, entry.fatherName, entry.cnic, roomNos].join(' ').toLowerCase();
      return haystack.includes(searchVal) || stripDashes(haystack).includes(searchValNoDash);
    });
  }

  if(items.length === 0){
    listEl.innerHTML = '<div class="empty-note">No upcoming reservations.</div>';
    renderMnResvReport(items);
    return;
  }

  items.sort((a,b)=> a.entry.checkIn.localeCompare(b.entry.checkIn));
  renderMnResvReport(items);

  listEl.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Guest</th>
          <th style="width:120px;">Room</th>
          <th style="width:140px;">CNIC</th>
          <th style="width:130px;">Contact No</th>
          <th style="width:100px;">Check-in</th>
          <th style="width:110px;">Expected Checkout</th>
          <th style="width:110px;">Total</th>
          <th style="width:100px;">Paid</th>
          <th style="width:100px;">Due</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(({entry, t, roomNos})=>{
          const contactNo = getDetailValue(entry, 'Contact No');
          return `<tr style="cursor:pointer;" onclick="openDetail('${entry.id}')" title="Open this guest">
            <td>${entry.guestName || '(no name)'}</td>
            <td>${roomNos || '-'}</td>
            <td>${entry.cnic || '-'}</td>
            <td>${contactNo || '-'}</td>
            <td>${formatDate(entry.checkIn)}</td>
            <td>${entry.checkOut ? formatDate(entry.checkOut) : '-'}</td>
            <td>${t.bookingTotal.toLocaleString()}</td>
            <td class="cash-amt">${t.paid.toLocaleString()}</td>
            <td style="font-weight:700; color:${t.due > 0 ? 'var(--danger)' : 'inherit'};">${t.due.toLocaleString()}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

