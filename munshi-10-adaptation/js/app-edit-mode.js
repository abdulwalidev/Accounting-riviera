// ---- Edit mode: reopen a saved entry on the Guest Entry page ----
let editingEntryId = null;
// Snapshot of the entry as it was when editing began. Saving diffs the
// form against THIS (not the live entry), so a room/payment added from
// another device mid-edit is never mistaken for one the editor removed.
let editingBaseline = null;

function openEditModal(){
  if(!isAdmin()){
    showNotice('Editing saved entries is only available to admin accounts.');
    return;
  }
  const entry = getCurrentEntry();
  if(!entry) return;
  const t = computeTotals(entry);
  const roomNos = (entry.rooms || []).map(r=>r.roomNo).filter(Boolean).join(', ');
  document.getElementById('editBody').innerHTML = `
    <div class="grid" style="margin-bottom:14px;">
      <div><div class="confirm-lbl">Guest Name</div><div class="confirm-val">${entry.guestName || '-'}</div></div>
      <div><div class="confirm-lbl">Father Name</div><div class="confirm-val">${entry.fatherName || '-'}</div></div>
      <div><div class="confirm-lbl">CNIC</div><div class="confirm-val">${entry.cnic || '-'}</div></div>
      <div><div class="confirm-lbl">Rooms</div><div class="confirm-val">${roomNos || '-'}</div></div>
      <div><div class="confirm-lbl">Booking Total</div><div class="confirm-val">${t.bookingTotal.toLocaleString()}</div></div>
      <div><div class="confirm-lbl">Paid / Due</div><div class="confirm-val">${t.paid.toLocaleString()} / ${t.due.toLocaleString()}</div></div>
    </div>`;
  const input = document.getElementById('editTypeInput');
  input.value = '';
  input.classList.remove('duplicate');
  document.getElementById('editModalBackdrop').classList.add('active');
  input.focus();
}

function closeEditModal(){
  document.getElementById('editModalBackdrop').classList.remove('active');
}

function confirmEditEntry(){
  if(!isAdmin()){
    showNotice('Editing saved entries is only available to admin accounts.');
    closeEditModal();
    return;
  }
  const input = document.getElementById('editTypeInput');
  if(input.value.trim().toLowerCase() !== 'edit'){
    input.classList.add('duplicate');
    showNotice('Please type "edit" in the box to open this entry for editing.');
    input.focus();
    return;
  }
  const entry = getCurrentEntry();
  if(!entry) return;
  closeEditModal();
  startEditEntry(entry);
}

function startEditEntry(entry){
  if(!isAdmin()){
    showNotice('Editing saved entries is only available to admin accounts.');
    return;
  }
  editingEntryId = entry.id;
  editingBaseline = JSON.parse(JSON.stringify(entry));
  document.body.classList.add('editing-mode'); // reveals Moved Out — only relevant when amending a saved entry

  document.getElementById('guestName').value = entry.guestName || '';
  document.getElementById('fatherName').value = entry.fatherName || '';
  document.getElementById('fatherNameNA').checked = entry.fatherName === 'N/A';
  document.getElementById('fatherName').disabled = entry.fatherName === 'N/A';
  document.getElementById('cnic').value = entry.cnic || '';
  document.getElementById('cnicNA').checked = entry.cnic === 'N/A';
  document.getElementById('cnic').disabled = entry.cnic === 'N/A';
  document.getElementById('contactNo').value = getDetailValue(entry, 'Contact No');
  setStayDate('checkInDate', entry.checkIn || '');
  setStayDate('checkOutDate', entry.checkOut || '');
  setStayDate('actualCheckoutDate', getDetailValue(entry, 'Actual Checkout'));
  updateDateReadout(document.getElementById('checkInDate'), document.getElementById('checkInDateReadout'));
  updateDateReadout(document.getElementById('checkOutDate'), document.getElementById('checkOutDateReadout'));
  updateDateReadout(document.getElementById('actualCheckoutDate'), document.getElementById('actualCheckoutDateReadout'));
  // an entry that already had a checkout saved keeps it — only a blank one
  // (never set) still auto-follows Check-in from here on
  checkoutSetByUser = !!entry.checkOut;
  autoFillExpectedCheckout();

  document.getElementById('extraDetailList').innerHTML = '';
  visibleExtraDetails(entry).forEach(d=> addExtraDetailRow(d.kind, d.value));
  fillMnEntryDetails(entry);

  document.getElementById('roomBody').innerHTML = '';
  rowCount = 0;
  (entry.rooms && entry.rooms.length ? entry.rooms : [null]).forEach(r=>{
    addRow();
    if(!r) return;
    const tr = document.querySelector('#roomBody tr:last-child');
    if(r.id) tr.dataset.roomId = r.id;
    tr.querySelector('.roomNo').value = r.roomNo || '';
    const days = parseInt(r.count) || 1;
    tr.dataset.rooms = days;
    tr.querySelector('.roomCount').textContent = days;
    tr.querySelector('.rent').value = (r.rent === 0 || r.rent === '0') ? 'Guest' : (r.rent || '');
    const movedOutInput = tr.querySelector('.movedOut');
    movedOutInput.value = r.movedOut || '';
    updateDateReadout(movedOutInput, tr.querySelector('.movedOutReadout'));
    updateUnitType(tr);
    const typeSel = tr.querySelector('.unitType');
    if(!typeSel.disabled && r.unitType){
      typeSel.value = r.unitType;
      typeSel.classList.remove('needs-pick');
    }
    calcRow(tr.querySelector('.rent'));
  });
  refreshDuplicateRoomHighlights();

  document.getElementById('payBody').innerHTML = '';
  payCount = 0;
  (entry.payments && entry.payments.length ? entry.payments : [null]).forEach(p=>{
    addPayRow();
    if(!p) return;
    const tr = document.querySelector('#payBody tr:last-child');
    if(p.id) tr.dataset.payId = p.id;
    tr.querySelector('.payDate').value = p.date || todayStr();
    updateDateReadout(tr.querySelector('.payDate'), tr.querySelector('.payDateReadout'));
    const typeSel = tr.querySelector('.payType');
    const mappedType = p.type === 'Pending' ? 'Due Payment' : (p.type || 'Other');
    // A saved payment may hold a type no longer offered as a fresh choice
    // (e.g. the retired "Other") — add it just for this row so editing
    // never silently rewrites history to a different type.
    if(!Array.from(typeSel.options).some(o=> o.value === mappedType)){
      const opt = document.createElement('option');
      opt.value = mappedType;
      opt.textContent = mappedType;
      typeSel.appendChild(opt);
    }
    typeSel.value = mappedType;
    const modeSel = tr.querySelector('.payMode');
    modeSel.value = p.mode || 'Cash';
    if(modeSel.selectedIndex === -1) modeSel.value = 'Cash';
    toggleMode(modeSel);
    if(modeSel.value === 'Cash'){
      tr.querySelector('.payCash').value = p.cash || '';
    } else {
      tr.querySelector('.payBank').value = p.bank || '';
      tr.querySelector('.payAccount').value = p.account || '';
    }
    tr.querySelector('.payRemarks').value = p.remarks || '';
    calcPayRow(tr.querySelector('.payCash'));
  });

  document.getElementById('editModeName').textContent = entry.guestName || '(no name)';
  document.getElementById('editModeBar').style.display = 'flex';
  document.getElementById('checkoutTodayBtn').style.display = 'inline-block';
  showView('entry');
  window.scrollTo(0, 0);
}

function cancelEditMode(){
  editingEntryId = null;
  editingBaseline = null;
  document.getElementById('editModeBar').style.display = 'none';
  document.getElementById('checkoutTodayBtn').style.display = 'none';
  resetEntryForm();
  if(currentDetailId){
    openDetail(currentDetailId); // back to the guest page, nothing changed
  }
}

