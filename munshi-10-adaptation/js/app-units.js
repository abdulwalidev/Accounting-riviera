// ---------- Unit lists (from the property's existing room/apartment map) ----------
const ROOM_NUMBERS = [
  "201","202","203","204","205","206","207",
  "208","209","210","211","212","213","214",
  "301","302","303","304","305","306","307",
  "308","309","310","311","312","313","314",
  "401","402","403","404","405","406","407",
  "408","409","410","411","412","413","414"
];
const APARTMENT_NUMBERS = [
  "A-101","A-102","A-201","A-202","A-301","A-302","A-401","A-402",
  "B-101","B-102","B-201","B-202","B-301","B-303","B-401","B-402",
  "C-01","C-101","C-102","C-201","C-202","C-301","C-302","C-401","C-402",
  "D-101","D-102","D-201","D-202","D-301","D-302","D-401","D-402"
];
const ALL_UNITS = [
  { value:'N/A', group:'Not decided' },
  ...ROOM_NUMBERS.map(n=>({ value:n, group:'Room' })),
  ...APARTMENT_NUMBERS.map(n=>({ value:n, group:'Apartment' }))
];

function detectUnitType(roomNo){
  const v = (roomNo || '').trim().toUpperCase();
  if(ROOM_NUMBERS.includes(v)) return 'Room';
  if(APARTMENT_NUMBERS.includes(v)) return 'Apartment';
  return '';
}

// Auto-fills the Type column from the picked unit; when the unit is N/A
// (or hand-typed and unknown) the dropdown unlocks so the user must say
// whether it's a Room or an Apartment.
function updateUnitType(tr){
  const v = tr.querySelector('.roomNo').value.trim().toUpperCase();
  const typeSel = tr.querySelector('.unitType');
  const placeholder = typeSel.querySelector('option[value=""]');
  const roomOpt = typeSel.querySelector('option[value="Room"]');
  const aptOpt = typeSel.querySelector('option[value="Apartment"]');
  roomOpt.textContent = 'Room';
  aptOpt.textContent = 'Apartment';
  typeSel.classList.remove('auto-detected');
  if(!v){
    typeSel.value = ''; typeSel.disabled = true;
    placeholder.textContent = '—';
    typeSel.classList.remove('needs-pick');
    return;
  }
  const detected = detectUnitType(v);
  if(detected){
    // show a confident green "Room ✓" instead of a washed-out disabled look
    typeSel.value = detected; typeSel.disabled = true;
    (detected === 'Room' ? roomOpt : aptOpt).textContent = detected + ' ✓';
    typeSel.classList.add('auto-detected');
    placeholder.textContent = '—';
    typeSel.classList.remove('needs-pick');
    return;
  }
  // N/A or hand-typed unknown unit: the user must pick Room or Apartment
  typeSel.disabled = false;
  placeholder.textContent = 'SELECT THIS';
  typeSel.classList.toggle('needs-pick', !typeSel.value);
}

function getUsedRoomNumbers(excludeTr){
  return new Set(
    Array.from(document.querySelectorAll('#roomBody .roomNo'))
      .filter(inp => inp.closest('tr') !== excludeTr)
      .map(inp => inp.value.trim().toUpperCase())
      .filter(v => v && v !== 'N/A')
  );
}

function renderRoomNoList(listEl, filter, currentTr){
  const f = (filter || '').trim().toLowerCase();
  const usedElsewhere = getUsedRoomNumbers(currentTr);
  const rawMatches = ALL_UNITS.filter(u=> !f || u.value.toLowerCase().includes(f));
  const matches = rawMatches.filter(u=> !usedElsewhere.has(u.value.toUpperCase()));
  if(matches.length === 0){
    listEl.innerHTML = rawMatches.length > 0
      ? '<div class="roomno-empty">Already added in another row</div>'
      : '<div class="roomno-empty">No match</div>';
    return;
  }
  listEl.innerHTML = matches.map(u=>
    `<div class="roomno-item" data-value="${u.value}">${u.value}<span class="grp">${u.group}</span></div>`
  ).join('');
}

// Flags any room-number field whose value is already used in another row,
// so a mistaken duplicate (typed by hand, not picked from the list) is
// still caught and visibly marked before it can be saved.
function refreshDuplicateRoomHighlights(){
  const inputs = Array.from(document.querySelectorAll('#roomBody .roomNo'));
  const counts = {};
  inputs.forEach(inp=>{
    const v = inp.value.trim().toUpperCase();
    if(!v || v === 'N/A') return; // several undecided rooms are allowed
    counts[v] = (counts[v] || 0) + 1;
  });
  inputs.forEach(inp=>{
    const v = inp.value.trim().toUpperCase();
    inp.classList.toggle('duplicate', !!v && counts[v] > 1);
  });
}

// Event delegation so this works for every room row, including ones added later
const roomBodyEl = document.getElementById('roomBody');

roomBodyEl.addEventListener('input', e=>{
  if(!e.target.classList.contains('roomNo')) return;
  const wrap = e.target.closest('.roomno-wrap');
  const tr = e.target.closest('tr');
  const list = wrap.querySelector('.roomno-list');
  renderRoomNoList(list, e.target.value, tr);
  list.classList.add('show');
  refreshDuplicateRoomHighlights();
  updateUnitType(tr);
});

roomBodyEl.addEventListener('change', e=>{
  if(!e.target.classList.contains('unitType')) return;
  e.target.classList.toggle('needs-pick', !e.target.value);
});

// keep the "18 Jul 2026" readouts in sync with their date selectors
['input','change'].forEach(evt=>{
  document.getElementById('payBody').addEventListener(evt, e=>{
    if(!e.target.classList.contains('payDate')) return;
    updateDateReadout(e.target, e.target.parentElement.querySelector('.payDateReadout'));
  });
  document.getElementById('extraDetailList').addEventListener(evt, e=>{
    if(!e.target.classList.contains('edValue')) return;
    updateDateReadout(e.target, e.target.closest('.extra-detail-row').querySelector('.edValueReadout'));
  });
  roomBodyEl.addEventListener(evt, e=>{
    if(!e.target.classList.contains('movedOut')) return;
    updateDateReadout(e.target, e.target.closest('tr').querySelector('.movedOutReadout'));
  });
});

roomBodyEl.addEventListener('focusin', e=>{
  if(!e.target.classList.contains('roomNo')) return;
  const wrap = e.target.closest('.roomno-wrap');
  const tr = e.target.closest('tr');
  const list = wrap.querySelector('.roomno-list');
  renderRoomNoList(list, e.target.value, tr);
  list.classList.add('show');
});

roomBodyEl.addEventListener('focusout', e=>{
  if(!e.target.classList.contains('roomNo')) return;
  const wrap = e.target.closest('.roomno-wrap');
  setTimeout(()=>{ wrap.querySelector('.roomno-list').classList.remove('show'); }, 150);
});

roomBodyEl.addEventListener('mousedown', e=>{
  const item = e.target.closest('.roomno-item');
  if(!item || !item.dataset.value) return;
  e.preventDefault();
  const wrap = item.closest('.roomno-wrap');
  wrap.querySelector('.roomNo').value = item.dataset.value;
  wrap.querySelector('.roomno-list').classList.remove('show');
  refreshDuplicateRoomHighlights();
  updateUnitType(wrap.closest('tr'));
});

roomBodyEl.addEventListener('keydown', e=>{
  if(e.key !== 'Enter') return;
  const isRoomNo = e.target.classList.contains('roomNo');
  const isRent = e.target.classList.contains('rent');
  if(!isRoomNo && !isRent) return;
  e.preventDefault();

  const tr = e.target.closest('tr');

  if(isRoomNo){
    // if the autocomplete list is open, pick the top match; either way, move to Rent
    const list = tr.querySelector('.roomno-list');
    const firstItem = list.querySelector('.roomno-item');
    if(list.classList.contains('show') && firstItem && firstItem.dataset.value){
      e.target.value = firstItem.dataset.value;
      list.classList.remove('show');
      refreshDuplicateRoomHighlights();
      updateUnitType(tr);
    }
    tr.querySelector('.rent').focus();
    return;
  }

  // Enter in Rent field: go to the next row if one exists, otherwise add a new row
  const rows = Array.from(roomBodyEl.querySelectorAll('tr'));
  const idx = rows.indexOf(tr);
  const nextRow = rows[idx + 1];
  if(nextRow){
    nextRow.querySelector('.roomNo').focus();
  } else {
    addRow();
    const newRow = roomBodyEl.querySelector('tr:last-child');
    newRow.querySelector('.roomNo').focus();
  }
});

function addRow(){
  rowCount++;
  const tbody = document.getElementById('roomBody');
  const tr = document.createElement('tr');
  tr.dataset.rooms = 1;
  tr.innerHTML = `
    <td class="rmno">${rowCount}</td>
    <td>
      <div class="roomno-wrap">
        <input type="text" placeholder="Search room / apt no" class="roomNo" autocomplete="off">
        <div class="roomno-list"></div>
      </div>
    </td>
    <td>
      <select class="unitType" disabled>
        <option value="">—</option>
        <option value="Room">Room</option>
        <option value="Apartment">Apartment</option>
      </select>
    </td>
    <td><input type="text" inputmode="decimal" placeholder="0 or Guest" class="rent" oninput="calcRow(this)"></td>
    <td>
      <div class="roomctrl">
        <button onclick="changeRooms(this,-1)">-</button>
        <span class="roomCount">1</span>
        <button onclick="changeRooms(this,1)">+</button>
      </div>
    </td>
    <td class="edit-only"><input type="date" class="movedOut" title="Date the guest left THIS room (leave blank while still here)"><div class="date-readout movedOutReadout"></div></td>
    <td class="rowtotal">0</td>
    <td class="del"><button class="btn danger" onclick="requestDeleteRow(this,'room')">✕</button></td>
  `;
  tbody.appendChild(tr);
}

// "Change Room": pick the room the guest is leaving and the room they're
// moving into — the move always happens same-day, so one date covers both
// sides. Confirming stamps that date as Moved Out on the old room's row
// (chained occupancy in computeRoomStatuses uses it to flip the old room to
// vacant and the new room to occupied) and adds a fresh row for the new room.
let changeRoomActiveRows = [];

function openCheckoutModal(){
  if(!editingEntryId){
    showNotice('Open an existing entry for editing first.');
    return;
  }
  const name = document.getElementById('guestName').value.trim() || '(no name)';
  document.getElementById('checkoutModalSub').textContent = `Set ${formatDate(todayStr())} as the Actual Checkout date for "${name}"?`;
  document.getElementById('checkoutModalBackdrop').classList.add('active');
}

function closeCheckoutModal(){
  document.getElementById('checkoutModalBackdrop').classList.remove('active');
}

function confirmCheckoutToday(){
  setStayDate('actualCheckoutDate', todayStr());
  updateDateReadout(document.getElementById('actualCheckoutDate'), document.getElementById('actualCheckoutDateReadout'));
  closeCheckoutModal();
  showNotice('Actual Checkout set to today — click Save Entry to save it.', 'success');
}

function openChangeRoomModal(){
  const rows = Array.from(document.getElementById('roomBody').querySelectorAll('tr'));
  changeRoomActiveRows = rows.filter(tr=> tr.querySelector('.roomNo').value.trim() && !tr.querySelector('.movedOut').value);
  if(changeRoomActiveRows.length === 0){
    showNotice('Add a room for this guest first, then use Change Room to move them to a different one.');
    return;
  }
  const fromSel = document.getElementById('crFromRoom');
  fromSel.innerHTML = changeRoomActiveRows.map((tr,i)=>
    `<option value="${i}">${tr.querySelector('.roomNo').value.trim()}</option>`
  ).join('');
  const toInput = document.getElementById('crToRoom');
  toInput.value = '';
  document.getElementById('crToRoomList').classList.remove('show');
  document.getElementById('changeRoomModalBackdrop').classList.add('active');
  fromSel.focus();
}

function closeChangeRoomModal(){
  document.getElementById('changeRoomModalBackdrop').classList.remove('active');
}

function confirmChangeRoom(){
  const fromTr = changeRoomActiveRows[parseInt(document.getElementById('crFromRoom').value)];
  const toRoomNo = document.getElementById('crToRoom').value.trim();
  if(!fromTr) return;
  if(!toRoomNo){
    showNotice('Please pick the room the guest is moving into.');
    focusError(document.getElementById('crToRoom'));
    return;
  }
  if(getUsedRoomNumbers(null).has(toRoomNo.toUpperCase())){
    showNotice('Room ' + toRoomNo + ' is already used in this entry.');
    focusError(document.getElementById('crToRoom'));
    return;
  }

  const movedOutInput = fromTr.querySelector('.movedOut');
  movedOutInput.value = todayStr();
  updateDateReadout(movedOutInput, fromTr.querySelector('.movedOutReadout'));

  addRow();
  const newRow = document.getElementById('roomBody').querySelector('tr:last-child');
  newRow.querySelector('.roomNo').value = toRoomNo;
  updateUnitType(newRow);
  refreshDuplicateRoomHighlights();
  closeChangeRoomModal();
  newRow.querySelector('.rent').focus();
}

// The "moving into" search box mirrors the per-row room-number autocomplete
// (renderRoomNoList/getUsedRoomNumbers), just wired directly instead of via
// #roomBody delegation since this input lives in a modal, not a table row.
document.getElementById('crToRoom').addEventListener('input', e=>{
  renderRoomNoList(document.getElementById('crToRoomList'), e.target.value, null);
  document.getElementById('crToRoomList').classList.add('show');
});
document.getElementById('crToRoom').addEventListener('focus', e=>{
  renderRoomNoList(document.getElementById('crToRoomList'), e.target.value, null);
  document.getElementById('crToRoomList').classList.add('show');
});
document.getElementById('crToRoom').addEventListener('blur', ()=>{
  setTimeout(()=>{ document.getElementById('crToRoomList').classList.remove('show'); }, 150);
});
document.getElementById('crToRoomList').addEventListener('mousedown', e=>{
  const item = e.target.closest('.roomno-item');
  if(!item || !item.dataset.value) return;
  e.preventDefault();
  document.getElementById('crToRoom').value = item.dataset.value;
  document.getElementById('crToRoomList').classList.remove('show');
});

function changeRooms(btn, delta){
  const tr = btn.closest('tr');
  let rooms = parseInt(tr.dataset.rooms) + delta;
  if(rooms < 1) rooms = 1;
  tr.dataset.rooms = rooms;
  tr.querySelector('.roomCount').textContent = rooms;
  calcRow(tr.querySelector('.rent'));
}

function calcRow(rentInput){
  const tr = rentInput.closest('tr');
  const rent = parseFloat(rentInput.value) || 0;
  const rooms = parseInt(tr.dataset.rooms) || 1;
  const total = rent * rooms;
  tr.querySelector('.rowtotal').textContent = total.toLocaleString();
  calcGrandTotal();
}

function deleteRow(btn){
  btn.closest('tr').remove();
  calcGrandTotal();
  renumber();
  refreshDuplicateRoomHighlights();
}

