// ---- Room Detail: rooms by floor, who's in each one right now ----
// ROOM_NUMBERS/APARTMENT_NUMBERS (used already by the room-picker) double
// as the property's master room list, so every room shows here even if
// it's never been booked. Floor/Block is derived from the room number
// itself (2xx/3xx/4xx floors, A-/B-/C-/D- blocks); a room number that
// shows up in a booking but isn't in that master list falls into "NA".
const ROOM_TYPE_BY_SUFFIX = { '01': 'Suit Room', '02': 'VIP Deluxe' };
function getRoomType(roomNo){
  const v = (roomNo || '').trim().toUpperCase();
  if(APARTMENT_NUMBERS.includes(v)) return '3 Bed Apartment';
  if(ROOM_NUMBERS.includes(v)){
    const suffix = v.slice(-2);
    if(ROOM_TYPE_BY_SUFFIX[suffix]) return ROOM_TYPE_BY_SUFFIX[suffix];
    const n = parseInt(suffix, 10);
    if(n >= 3 && n <= 8) return 'Family Deluxe with River';
    if(n >= 9 && n <= 14) return 'Family Deluxe with Mount';
  }
  return '';
}
function getRoomSection(roomNo){
  const v = (roomNo || '').trim().toUpperCase();
  if(ROOM_NUMBERS.includes(v)){
    return v[0] === '2' ? '2ND FLOOR' : v[0] === '3' ? '3RD FLOOR' : v[0] === '4' ? '4TH FLOOR' : 'NA';
  }
  if(APARTMENT_NUMBERS.includes(v)) return 'BLOCK ' + v[0];
  return 'NA';
}
const ROOM_SECTION_ORDER = ['2ND FLOOR','3RD FLOOR','4TH FLOOR','BLOCK A','BLOCK B','BLOCK C','BLOCK D','NA'];

// "Occupied as of a date" is a heuristic: of the bookings for a room, the
// most recent one that had actually checked in by that date is treated as
// current for that date; it counts as occupied unless its Actual Checkout
// had already happened by then (a checkout dated after the reference date
// doesn't count yet — the guest was still in on that earlier date).
// Each room row optionally carries a "Moved Out" date — the day the guest
// left THAT specific room, used when a guest changes rooms mid-stay. A
// row's occupancy window is chained off its neighbors: it starts when the
// previous row's Moved Out date fires (or the entry's check-in, for the
// first row) and ends on its own Moved Out date (or the entry's actual
// checkout, if this is the last room, i.e. still open-ended). Rows that
// never set Moved Out — genuinely simultaneous rooms, not a room change —
// all collapse back to the whole-entry window, matching the old behavior.
function computeRoomStatuses(asOfDate){
  const refDate = asOfDate || todayStr();
  const all = loadAllEntries();
  const byRoom = {};
  all.forEach(entry=>{
    const rows = entry.rooms || [];
    const entryCheckIn = entry.checkIn || (entry.savedAt ? toKarachiDateStr(entry.savedAt) : '');
    const entryCheckout = getDetailValue(entry, 'Actual Checkout');
    rows.forEach((r, i)=>{
      if(!r.roomNo) return;
      const key = r.roomNo.trim().toUpperCase();
      const prev = rows[i - 1];
      const from = (prev && prev.movedOut) ? prev.movedOut : entryCheckIn;
      const to = r.movedOut || entryCheckout || '';
      (byRoom[key] = byRoom[key] || []).push({ entry, room: r, from, to });
    });
  });

  const masterKeys = [...ROOM_NUMBERS, ...APARTMENT_NUMBERS];
  const extraKeys = Object.keys(byRoom)
    .filter(k=> !masterKeys.includes(k))
    .sort((a,b)=> a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  return masterKeys.concat(extraKeys).map(roomNo=>{
    const bookings = (byRoom[roomNo] || []).slice().sort((a,b)=> (b.from || '').localeCompare(a.from || ''));
    const current = bookings.find(b=> !b.from || b.from <= refDate) || null;
    const occupied = !!current && (!current.to || current.to > refDate);
    return {
      roomNo,
      section: getRoomSection(roomNo),
      type: getRoomType(roomNo),
      entry: current ? current.entry : null,
      occupied,
      actualCheckout: current ? current.to : '',
      bookingCount: bookings.length
    };
  });
}

// ---- House Count: room-type x status matrix, under Front Desk. Vacant and
// Occupied come straight off computeRoomStatuses (real data); OOS/Dirty/OOO
// are genuine housekeeping states this system has no way to track (no
// room-condition input anywhere), so they're honestly shown as 0 rather
// than invented — same call already made for the Dashboard's own
// Dirty/OOO tiles. ----
function renderHouseCount(){
  const el = document.getElementById('houseCountBody');
  if(!el) return;
  if(!initialLoadDone){
    el.innerHTML = '<tr><td colspan="6" class="empty-note">' + cloudLoadingNote() + '</td></tr>';
    return;
  }
  const rooms = computeRoomStatuses(todayStr());
  const byType = {};
  rooms.forEach(r=>{
    const type = r.type || 'Other';
    const t = byType[type] || (byType[type] = { vacant:0, occupied:0 });
    if(r.occupied) t.occupied++; else t.vacant++;
  });
  const types = Object.keys(byType).sort((a,b)=> (byType[b].vacant + byType[b].occupied) - (byType[a].vacant + byType[a].occupied));
  let totVacant = 0, totOccupied = 0;
  el.innerHTML = types.map(type=>{
    const t = byType[type];
    totVacant += t.vacant; totOccupied += t.occupied;
    return `<tr>
      <td>${type}</td>
      <td style="text-align:center;">0</td>
      <td style="text-align:center;">0</td>
      <td style="text-align:center;">${t.vacant}</td>
      <td style="text-align:center;">${t.occupied}</td>
      <td style="text-align:center;">0</td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" class="empty-note">No rooms configured.</td></tr>';
  const totalRow = document.getElementById('houseCountTotal');
  if(totalRow){
    totalRow.innerHTML = `
      <td>Total</td>
      <td style="text-align:center;">0</td>
      <td style="text-align:center;">0</td>
      <td style="text-align:center;">${totVacant}</td>
      <td style="text-align:center;">${totOccupied}</td>
      <td style="text-align:center;">0</td>`;
  }
}

// Room Detail has two interchangeable layouts for the same filtered room
// list: SMART (one full-width table per floor/block) and MUNCHI (a grid of
// small floor/block panels, matching a reference PMS's "Rooms by Floor"
// board). Both are rendered every time so switching between them is an
// instant show/hide, never a re-render.
const roomDetailModeState = { rd: 'munchi', fd: 'munchi' };
function setRoomDetailMode(prefix, mode){
  roomDetailModeState[prefix] = mode;
  document.getElementById(prefix + 'ModeSmart').classList.toggle('active', mode === 'smart');
  document.getElementById(prefix + 'ModeMunchi').classList.toggle('active', mode === 'munchi');
  document.getElementById(prefix + 'SmartBody').style.display = mode === 'smart' ? '' : 'none';
  document.getElementById(prefix + 'MunchiBody').style.display = mode === 'munchi' ? '' : 'none';
}

function renderRoomDetail(prefix){
  prefix = prefix || 'rd';
  const smartBody = document.getElementById(prefix + 'SmartBody');
  const munchiBody = document.getElementById(prefix + 'MunchiBody');
  const summaryEl = document.getElementById(prefix + 'Summary');
  if(!initialLoadDone){
    smartBody.innerHTML = '<div class="empty-note">' + cloudLoadingNote() + '</div>';
    munchiBody.innerHTML = '';
    summaryEl.innerHTML = '';
    return;
  }
  const searchVal = document.getElementById(prefix + 'SearchInput').value.trim().toLowerCase();
  const occupiedOnly = document.getElementById(prefix + 'OccupiedOnly').checked;
  const rdDateEl = document.getElementById(prefix + 'Date');
  const asOfDate = rdDateEl.value || todayStr();
  updateDateReadout(rdDateEl, document.getElementById(prefix + 'DateReadout'));
  const asOfLabel = asOfDate === todayStr() ? 'today' : 'on ' + formatDate(asOfDate);

  let rooms = computeRoomStatuses(asOfDate);
  const totalRooms = rooms.length;
  const occupiedCount = rooms.filter(r=> r.occupied).length;

  if(searchVal){
    const searchValNoDash = stripDashes(searchVal);
    rooms = rooms.filter(r=>{
      const haystack = [r.roomNo, r.type, r.entry ? r.entry.guestName : '', r.entry ? r.entry.fatherName : ''].join(' ').toLowerCase();
      return haystack.includes(searchVal) || stripDashes(haystack).includes(searchValNoDash);
    });
  }
  if(occupiedOnly){
    rooms = rooms.filter(r=> r.occupied);
  }

  summaryEl.innerHTML = `
    <span><b>${totalRooms}</b> rooms total</span>
    <span><b>${occupiedCount}</b> occupied ${asOfLabel}</span>
    <span><b>${totalRooms - occupiedCount}</b> vacant</span>`;

  if(rooms.length === 0){
    smartBody.innerHTML = '<div class="empty-note">No rooms match.</div>';
    munchiBody.innerHTML = '<div class="empty-note">No rooms match.</div>';
    return;
  }

  const groups = {};
  rooms.forEach(r=> (groups[r.section] = groups[r.section] || []).push(r));
  const sections = ROOM_SECTION_ORDER.filter(section=> groups[section] && groups[section].length);

  smartBody.innerHTML = sections.map(section=>{
    const list = groups[section];
    const occ = list.filter(r=> r.occupied).length;
    const rows = list.map(r=>{
      const due = r.entry ? computeTotals(r.entry).due : 0;
      const clickable = !!r.entry;
      const arrival = r.entry && r.entry.checkIn ? formatDateShort(r.entry.checkIn) : '-';
      const guestCell = r.occupied
        ? (r.entry.guestName || '(no name)')
        : (r.entry ? `<span class="muted-guest">${r.entry.guestName || '(no name)'}${r.actualCheckout ? ' · left ' + formatDateShort(r.actualCheckout) : ''}</span>` : '-');
      return `<tr ${clickable ? `style="cursor:pointer;" onclick="openDetail('${r.entry.id}')" title="Open this guest"` : ''}>
        <td><b>${r.roomNo}</b></td>
        <td>${r.type || '-'}</td>
        <td>${arrival}</td>
        <td>${clickable ? due.toLocaleString() : '-'}</td>
        <td><span class="status ${r.occupied ? 'pending' : 'paid'}">${r.occupied ? 'Occupied' : 'Vacant'}</span></td>
        <td>${guestCell}</td>
      </tr>`;
    }).join('');
    return `
      <div class="day-group">
        <div class="day-head">
          <span>${section}</span>
          <span class="day-total">${occ} / ${list.length} occupied ${asOfLabel}</span>
        </div>
        <table>
          <thead><tr><th>Room</th><th style="width:170px;">Type</th><th style="width:80px;">Arrival</th><th style="width:100px;">Due</th><th style="width:100px;">Status</th><th>Guest</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join('');

  munchiBody.innerHTML = sections.map(section=>{
    const rows = groups[section].map(r=>{
      const clickable = !!r.entry;
      const arrival = r.entry && r.entry.checkIn ? formatDateShort(r.entry.checkIn) : '';
      const guestText = r.occupied
        ? (r.entry.guestName || '')
        : (r.entry ? (r.entry.guestName || '(no name)') + (r.actualCheckout ? ' · left ' + formatDateShort(r.actualCheckout) : '') : '');
      return `<div class="smart-row${clickable ? ' clickable' : ''}" ${clickable ? `onclick="openDetail('${r.entry.id}')" title="Open this guest"` : ''}>
        <span class="sr-room">${r.roomNo}</span>
        <span class="sr-type">${r.type || ''}</span>
        <span class="sr-status ${r.occupied ? 'occupied' : 'vacant'}">${r.occupied ? 'occupied' : 'vacant'}</span>
        <span class="sr-arrival">${arrival}</span>
        <span class="sr-guest${r.occupied ? '' : (r.entry ? ' sr-guest-muted' : '')}">${guestText}</span>
      </div>`;
    }).join('');
    return `
      <div class="smart-panel">
        <div class="smart-panel-head">${section}</div>
        <div>${rows}</div>
      </div>`;
  }).join('');
}

