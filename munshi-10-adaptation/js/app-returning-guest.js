// ---- Returning guest: typing a known CNIC offers to load the person's
// saved details into the NEW entry, so this visit starts from what we
// already know and any new detail (new car, new number…) is just added
// on top. The visit itself stays separate — rooms/payments/dates fresh. ----
let returningPromptedDigits = null; // asked once per CNIC — don't nag on every blur
let returningPrefillDigits = null;  // accepted → save-time dup dialog is skipped

function offerReturningGuestPrefill(){
  if(editingEntryId) return; // editing an old entry — not a new visit
  const digits = document.getElementById('cnic').value.replace(/[^0-9]/g, '');
  if(digits.length !== 13 || digits === returningPromptedDigits) return;
  const matches = loadAllEntries()
    .filter(e => (e.cnic || '').replace(/[^0-9]/g,'') === digits)
    .sort((a,b)=> (b.savedAt || '').localeCompare(a.savedAt || ''));
  if(matches.length === 0) return;
  returningPromptedDigits = digits;
  const prev = matches[0];
  const prevDate = prev.savedAt ? ' (last visit ' + formatDate(toKarachiDateStr(prev.savedAt)) + ')' : '';
  const ok = confirm(
    'RETURNING GUEST — this CNIC belongs to "' + (prev.guestName || '(no name)') + '"' + prevDate + '.\n\n' +
    'Click OK to load his saved details (name, father name, + details) into this new entry. ' +
    'You can then add any new detail with "+ Detail". Rooms, payments and dates start fresh for this visit.\n\n' +
    'Click Cancel to type everything by hand instead.'
  );
  if(!ok) return;
  returningPrefillDigits = digits;
  document.getElementById('guestName').value = prev.guestName || '';
  document.getElementById('fatherName').value = prev.fatherName || '';
  const contactNoEl = document.getElementById('contactNo');
  if(!contactNoEl.value.trim()) contactNoEl.value = getDetailValue(prev, 'Contact No');
  // Append only details not already typed into the form — never wipe rows
  const have = Array.from(document.querySelectorAll('#extraDetailList .extra-detail-row')).map(row => ({
    kind: row.querySelector('.edKind').value,
    value: row.querySelector('.edValue').value.trim()
  }));
  visibleExtraDetails(prev).forEach(d=>{
    if(!have.some(h => h.kind === d.kind && h.value === d.value)) addExtraDetailRow(d.kind, d.value);
  });
}

// N/A checkbox next to Father Name / CNIC: some guests simply don't have
// one to give, and forcing a fake value in would corrupt search/duplicate
// checks. Checking it fills the field with "N/A" and locks it; unchecking
// clears it back to editable.
function toggleNA(fieldId){
  const input = document.getElementById(fieldId);
  const checkbox = document.getElementById(fieldId + 'NA');
  if(checkbox.checked){
    input.value = 'N/A';
    input.disabled = true;
  }else{
    input.value = '';
    input.disabled = false;
    input.focus();
  }
}

let pendingEntryData = null;

function reviewEntry(){
  // ---- Guardrails: the person doing data entry may be rushed or new to
  // the form, so catch the mistakes that would otherwise sit quietly in
  // the saved data (missing name, a room typed twice, a bank left unset). ----
  const guestNameEl = document.getElementById('guestName');
  const guestName = guestNameEl.value.trim();
  if(!guestName){
    showNotice('Please enter the Guest Name before saving.');
    focusError(guestNameEl);
    return;
  }
  if(!/^[a-zA-Z\s.'-]+$/.test(guestName)){
    showNotice('Guest Name looks wrong — it should contain letters only (no numbers). Please check for a typo.');
    focusError(guestNameEl);
    return;
  }

  const fatherNameEl = document.getElementById('fatherName');
  const fatherNameNA = document.getElementById('fatherNameNA').checked;
  const fatherName = fatherNameNA ? 'N/A' : fatherNameEl.value.trim();
  if(!fatherNameNA){
    if(!fatherName){
      showNotice('Please enter the Father Name before saving.');
      focusError(fatherNameEl);
      return;
    }
    if(!/^[a-zA-Z\s.'-]+$/.test(fatherName)){
      showNotice('Father Name looks wrong — it should contain letters only (no numbers). Please check for a typo.');
      focusError(fatherNameEl);
      return;
    }
  }

  const cnicEl = document.getElementById('cnic');
  const cnicNA = document.getElementById('cnicNA').checked;
  const cnic = cnicNA ? 'N/A' : cnicEl.value.trim();
  let cnicDigits = '';
  if(!cnicNA){
    if(!cnic){
      showNotice('Please enter the CNIC before saving.');
      focusError(cnicEl);
      return;
    }
    cnicDigits = cnic.replace(/[^0-9]/g, '');
    if(cnicDigits.length !== 13){
      showNotice('CNIC looks wrong — it should have exactly 13 digits (e.g. XXXXX-XXXXXXX-X). Please check for a typo.');
      focusError(cnicEl);
      return;
    }
  }

  // duplicate CNIC guard — catches an accidental re-entry of an existing guest.
  // Skipped entirely when CNIC is N/A: many N/A guests would otherwise all
  // falsely flag each other as duplicates.
  const existingEntries = loadAllEntries();
  const dupGuest = !cnicNA && existingEntries.find(e => e.id !== editingEntryId && (e.cnic || '').replace(/[^0-9]/g,'') === cnicDigits);
  if(dupGuest && returningPrefillDigits !== cnicDigits){
    const prevDate = dupGuest.savedAt ? ' (entered ' + formatDate(toKarachiDateStr(dupGuest.savedAt)) + ')' : '';
    const proceed = confirm(
      'This CNIC already belongs to "' + (dupGuest.guestName || '(no name)') + '"' + prevDate + '.\n\n' +
      'RETURNING GUEST? Click OK — every visit is saved as its OWN new entry, with its own rooms, payments and balance. Do NOT edit the old entry to add a new stay.\n\n' +
      'Click Cancel only if this is an accidental duplicate of the same stay.'
    );
    if(!proceed) return;
  }

  // stay dates — reference only, no amount depends on them, but a
  // checkout before the check-in is always a typo
  const checkInEl = document.getElementById('checkInDate');
  const checkOutEl = document.getElementById('checkOutDate');
  if(checkInEl.value && checkOutEl.value && checkOutEl.value < checkInEl.value){
    showNotice('The Check-out date is before the Check-in date. Please fix the dates (they are for reference only).');
    focusError(checkOutEl);
    return;
  }

  const extraDetails = collectExtraDetails();
  if(extraDetails === null) return;
  if(document.body.classList.contains('munshi-mode')){
    extraDetails.push(...collectMnEntryDetails());
  }

  const contactNo = document.getElementById('contactNo').value.trim();
  if(contactNo) extraDetails.unshift({ kind: 'Contact No', value: contactNo });
  const actualCheckout = document.getElementById('actualCheckoutDate').value;
  if(actualCheckout) extraDetails.unshift({ kind: 'Actual Checkout', value: actualCheckout });

  const roomRows = Array.from(document.querySelectorAll('#roomBody tr'));
  const cleanRooms = [];
  for(const tr of roomRows){
    const roomNoInput = tr.querySelector('.roomNo');
    const rentInput = tr.querySelector('.rent');
    const roomNo = roomNoInput.value.trim();
    // The owner's guests stay free — typing "Guest" (any case) in Rent
    // Per Day marks the room as occupied with zero rent, skipping the
    // "must be greater than 0" check that applies to paying guests.
    const isFreeGuest = rentInput.value.trim().toLowerCase() === 'guest';
    const rent = isFreeGuest ? 0 : (parseFloat(rentInput.value) || 0);
    if(!roomNo && !isFreeGuest && rent === 0) continue; // untouched filler row — ignore silently
    if(!roomNo){
      showNotice('A rent amount was entered without a Room No / Apt No. Please pick a room for every row, or clear the rent.');
      focusError(roomNoInput);
      return;
    }
    if(!isFreeGuest && rent <= 0){
      showNotice('Room ' + roomNo + ' has no Rent Per Day entered. Please enter a rent amount greater than 0 (or type "Guest" for a free owner\'s-guest stay).');
      focusError(rentInput);
      return;
    }
    const typeSel = tr.querySelector('.unitType');
    const unitType = typeSel.value;
    if(!unitType){
      showNotice('Please select whether "' + roomNo + '" is a Room or an Apartment in the Type column.');
      focusError(typeSel);
      return;
    }
    const roomObj = {
      roomNo, unitType, rentInput, tr,
      rent: isFreeGuest ? 0 : rentInput.value,
      count: tr.dataset.rooms,
      movedOut: tr.querySelector('.movedOut').value || '',
      total: parseFloat(tr.querySelector('.rowtotal').textContent.replace(/,/g,'')) || 0
    };
    if(tr.dataset.roomId) roomObj.id = tr.dataset.roomId; // keep identity when editing
    cleanRooms.push(roomObj);
  }
  if(cleanRooms.length === 0){
    showNotice('Please add at least one room before saving.');
    return;
  }
  const seenRooms = {};
  for(const r of cleanRooms){
    const key = r.roomNo.toUpperCase();
    if(key === 'N/A') continue; // undecided rooms may repeat
    if(seenRooms[key]){
      showNotice('Room ' + r.roomNo + ' is selected in more than one row. Each room can only be booked once per entry — please fix the duplicate before saving.');
      focusError(r.tr.querySelector('.roomNo'));
      return;
    }
    seenRooms[key] = true;
  }

  const payRows = Array.from(document.querySelectorAll('#payBody tr'));
  const cleanPayments = [];
  for(const tr of payRows){
    const mode = tr.querySelector('.payMode').value;
    const bankSel = tr.querySelector('.payBank');
    const bank = bankSel.value;
    const dateInput = tr.querySelector('.payDate');
    const cashInput = tr.querySelector('.payCash');
    const acctInput = tr.querySelector('.payAccount');
    const cash = parseFloat(cashInput.value) || 0;
    const account = parseFloat(acctInput.value) || 0;
    if(cash === 0 && account === 0) continue; // untouched filler payment row — ignore silently
    if(cash < 0 || account < 0){
      showNotice('Payment amounts cannot be negative. Please fix the payment row before saving.');
      focusError(cash < 0 ? cashInput : acctInput);
      return;
    }
    if(!dateInput.value){
      showNotice('Please pick a Date for the payment row before saving.');
      focusError(dateInput);
      return;
    }
    if((mode === 'Bank Transfer' || mode === 'Card') && !bank){
      showNotice('Please select a bank for the ' + mode + ' payment row before saving.');
      focusError(bankSel);
      return;
    }
    // A pre-existing row (already has a payId) is just being re-saved, not
    // newly added — the lock only blocks genuinely new payments landing on
    // a locked day.
    if(!tr.dataset.payId && isDateLocked(dateInput.value)){
      showNotice(formatDate(dateInput.value) + ' is locked — no new payment can be dated on this day.');
      focusError(dateInput);
      return;
    }
    const payObj = {
      date: dateInput.value,
      type: tr.querySelector('.payType').value,
      mode, bank, cash, account,
      remarks: tr.querySelector('.payRemarks').value.trim(),
      total: parseFloat(tr.querySelector('.payTotal').textContent.replace(/,/g,'')) || 0
    };
    if(tr.dataset.payId) payObj.id = tr.dataset.payId; // keep identity when editing
    cleanPayments.push(payObj);
  }

  const bookingTotalNum = parseFloat(document.getElementById('grandTotal').textContent.replace(/,/g,'')) || 0;
  const paidTotalNum = cleanPayments.reduce((sum, p) => sum + p.total, 0);
  if(paidTotalNum > bookingTotalNum){
    showNotice(
      'The total payment entered (Rs. ' + paidTotalNum.toLocaleString() +
      ') is MORE than the Booking Total (Rs. ' + bookingTotalNum.toLocaleString() +
      '). Payments can never be more than the booking total — please fix the amounts before saving.'
    );
    return;
  }

  const data = {
    guestName,
    fatherName,
    cnic,
    checkIn: checkInEl.value || '',
    checkOut: checkOutEl.value || '',
    extraDetails,
    rooms: cleanRooms.map(r=> ({ id: r.id, roomNo: r.roomNo, unitType: r.unitType, rent: r.rent, count: r.count, movedOut: r.movedOut, total: r.total })),
    payments: cleanPayments
  };
  data.bookingTotal = document.getElementById('sumBookingTotal').textContent;
  data.totalPaid = document.getElementById('sumPaid').textContent;
  data.balanceDue = document.getElementById('sumDue').textContent;
  data.status = document.getElementById('sumStatus').textContent;

  pendingEntryData = data;
  openConfirmModal(data);
}

function openConfirmModal(data){
  const box = document.getElementById('confirmBody');

  const roomRowsHtml = data.rooms.map(r=>`
    <tr><td>${r.roomNo}</td><td>${r.unitType || detectUnitType(r.roomNo) || '-'}</td><td>${Number(r.rent).toLocaleString()}</td><td>${r.count}</td><td>${r.movedOut ? formatDate(r.movedOut) : '-'}</td><td class="rowtotal">${(parseFloat(String(r.total).replace(/,/g,'')) || 0).toLocaleString()}</td></tr>
  `).join('');

  const payRowsHtml = data.payments.length ? data.payments.map(p=>{
    const isCash = p.mode === 'Cash';
    return `
    <tr class="${isCash ? 'mode-cash' : 'mode-bank'}">
      <td>${formatDate(p.date)}</td><td>${p.type}</td><td><span class="mode-badge ${isCash ? 'cash' : 'bank'}">${p.mode}</span></td><td>${p.bank || '-'}</td>
      <td>${p.remarks || '-'}</td>
      <td class="cash-amt">${p.cash ? p.cash.toLocaleString() : '-'}</td><td class="account-amt">${p.account ? p.account.toLocaleString() : '-'}</td>
      <td class="rowtotal ${isCash ? 'cash-amt' : 'account-amt'}">${p.total.toLocaleString()}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="8" class="empty-note">No payments entered yet.</td></tr>';

  box.innerHTML = `
    <div class="grid" style="margin-bottom:14px;">
      <div><div class="confirm-lbl">Guest Name</div><div class="confirm-val">${data.guestName || '-'}</div></div>
      <div><div class="confirm-lbl">Father Name</div><div class="confirm-val">${data.fatherName || '-'}</div></div>
      <div><div class="confirm-lbl">CNIC</div><div class="confirm-val">${data.cnic || '-'}</div></div>
      <div><div class="confirm-lbl">Check-in</div><div class="confirm-val">${data.checkIn ? formatDate(data.checkIn) : '-'}</div></div>
      <div><div class="confirm-lbl">Expected Checkout</div><div class="confirm-val">${data.checkOut ? formatDate(data.checkOut) : '-'}</div></div>
      <div><div class="confirm-lbl">Actual Checkout</div><div class="confirm-val">${getDetailValue(data, 'Actual Checkout') ? formatDate(getDetailValue(data, 'Actual Checkout')) : '-'}</div></div>
      ${visibleExtraDetails(data).map(d=>`<div><div class="confirm-lbl">${d.kind}</div><div class="confirm-val">${formatExtraDetail(d)}</div></div>`).join('')}
    </div>
    <table style="margin-bottom:14px;">
      <thead><tr><th>Room No</th><th>Type</th><th>Rent/Day</th><th>Days</th><th>Moved Out</th><th>Total</th></tr></thead>
      <tbody>${roomRowsHtml}</tbody>
    </table>
    <table style="margin-bottom:14px;">
      <thead><tr><th>Date</th><th>Type</th><th>Mode</th><th>Bank</th><th>Remarks</th><th>Cash</th><th>Account</th><th>Total</th></tr></thead>
      <tbody>${payRowsHtml}</tbody>
    </table>
    <div class="summary" style="margin-top:0; padding-top:0; border-top:none;">
      <div class="box"><div class="lbl">Booking Total</div><div class="val">${data.bookingTotal}</div></div>
      <div class="box"><div class="lbl">Total Paid</div><div class="val">${data.totalPaid}</div></div>
      <div class="box"><div class="lbl">Balance Due</div><div class="val">${data.balanceDue}</div></div>
      <div class="box"><div class="lbl">Status</div><div class="val"><span class="status ${data.status.toLowerCase()}">${data.status}</span></div></div>
    </div>
  `;

  document.getElementById('confirmTypeInput').value = '';
  document.getElementById('confirmTypeInput').classList.remove('duplicate');
  document.getElementById('confirmTotalInput').value = '';
  document.getElementById('confirmTotalInput').classList.remove('duplicate');
  document.getElementById('confirmModalBackdrop').classList.add('active');
  document.getElementById('confirmTotalInput').focus();
}

function closeConfirmModal(){
  document.getElementById('confirmModalBackdrop').classList.remove('active');
  pendingEntryData = null;
}

function confirmSaveEntry(){
  if(!pendingEntryData) return;

  // The enterer must re-type the grand total — catches a wrong rent/days
  // they would otherwise wave through without reading.
  const totalInput = document.getElementById('confirmTotalInput');
  const typedTotal = parseFloat(totalInput.value.replace(/[^0-9.]/g, '')) || 0;
  const actualTotal = parseFloat(String(pendingEntryData.bookingTotal).replace(/,/g, '')) || 0;
  if(typedTotal !== actualTotal){
    totalInput.classList.add('duplicate');
    showNotice('The Grand Total you typed (' + (totalInput.value.trim() || 'nothing') + ') does not match the entry\'s Grand Total (' + actualTotal.toLocaleString() + '). Please check the rooms and rent are correct, then type the total again.');
    totalInput.focus();
    return;
  }

  const typed = document.getElementById('confirmTypeInput').value.trim().toLowerCase();
  if(typed !== 'confirm'){
    document.getElementById('confirmTypeInput').classList.add('duplicate');
    showNotice('Please type "confirm" in the box to save this entry.');
    document.getElementById('confirmTypeInput').focus();
    return;
  }

  const data = pendingEntryData;

  if(editingEntryId){
    if(!isAdmin()){
      // can't normally happen (staff can't enter edit mode at all) — final
      // backstop so an edit save is never applied without the admin role
      showNotice('Editing saved entries is only available to admin accounts.');
      cancelEditMode();
      closeConfirmModal();
      return;
    }
    // Editing an existing entry: replace it in place, keep its identity.
    const all = loadAllEntries();
    const idx = all.findIndex(e=> e.id === editingEntryId);
    if(idx === -1){
      showNotice('Could not find the original entry to update — nothing was changed.');
      closeConfirmModal();
      return;
    }
    const original = all[idx];
    data.id = original.id;
    data.savedAt = original.savedAt;
    data.editedAt = new Date().toISOString();
    data.savedBy = original.savedBy || '';
    data.editedBy = currentUser ? currentUser.username : '';
    // the form doesn't carry who took each payment — restore it from the
    // original by id; genuinely new payment rows belong to this user
    const origPayById = new Map((original.payments || []).map(p=> [p.id, p]));
    data.payments.forEach(p=>{
      const orig = p.id && origPayById.get(p.id);
      p.createdBy = orig ? (orig.createdBy || '') : (currentUser ? currentUser.username : '');
    });
    // rows removed while editing get soft-deleted in the cloud — the data
    // is never gone, an admin can restore it from the SQL Editor. The diff
    // runs against the snapshot from when editing BEGAN, so only rows the
    // editor actually saw and removed get deleted.
    const baseline = (editingBaseline && editingBaseline.id === original.id) ? editingBaseline : original;
    const keptRoomIds = new Set(data.rooms.map(r=> r.id).filter(Boolean));
    (baseline.rooms || []).forEach(r=>{
      if(r.id && !keptRoomIds.has(r.id)) queueSoftDelete('room', r.id);
    });
    const keptPayIds = new Set(data.payments.map(p=> p.id).filter(Boolean));
    (baseline.payments || []).forEach(p=>{
      if(p.id && !keptPayIds.has(p.id)) queueSoftDelete('payment', p.id);
    });
    // rooms/payments that arrived from ANOTHER DEVICE while this edit was
    // open exist in the live entry but were never shown in the form —
    // keep them instead of silently wiping them with the save
    const baselineRoomIds = new Set((baseline.rooms || []).map(r=> r.id));
    const baselinePayIds = new Set((baseline.payments || []).map(p=> p.id));
    let carriedFromElsewhere = 0;
    (original.rooms || []).forEach(r=>{
      if(r.id && !baselineRoomIds.has(r.id) && !keptRoomIds.has(r.id)){ data.rooms.push(r); carriedFromElsewhere++; }
    });
    (original.payments || []).forEach(p=>{
      if(p.id && !baselinePayIds.has(p.id) && !keptPayIds.has(p.id)){ data.payments.push(p); carriedFromElsewhere++; }
    });
    data.rooms.forEach(r=>{ if(!r.id) r.id = uid('r'); });
    data.payments.forEach(p=>{ if(!p.id) p.id = uid('p'); });
    all[idx] = data;
    logGuestAction(data.id, 'edited');
    queueEntryPush(data.id);
    if(carriedFromElsewhere > 0){
      showNotice(carriedFromElsewhere + ' room/payment row(s) added from another device while you were editing were kept in the entry.', 'success');
    }
    editingEntryId = null;
    editingBaseline = null;
    document.getElementById('editModeBar').style.display = 'none';
    document.getElementById('checkoutTodayBtn').style.display = 'none';
    closeConfirmModal();
    resetEntryForm();
    renderTodayEntries();
    showNotice('Entry updated successfully.', 'success');
    return;
  }

  data.savedAt = new Date().toISOString();
  data.id = uid('g');
  data.savedBy = currentUser ? currentUser.username : '';
  data.rooms.forEach(r=>{ if(!r.id) r.id = uid('r'); });
  data.payments.forEach(p=>{
    if(!p.id) p.id = uid('p');
    p.createdBy = currentUser ? currentUser.username : '';
  });

  entries.push(data);
  logGuestAction(data.id, 'created');
  queueEntryPush(data.id);

  closeConfirmModal();
  resetEntryForm();
  renderTodayEntries();
  showNotice('Entry saved — it is listed under Today\'s Entries below. The form is ready for the next guest.', 'success');
}

// Clear the whole entry form for the next guest.
function resetEntryForm(){
  document.body.classList.remove('editing-mode');
  ['guestName','cnic','contactNo','checkOutDate','actualCheckoutDate'].forEach(id=>{
    if(stayDatePickers[id]) setStayDate(id, ''); else document.getElementById(id).value = '';
  });
  document.getElementById('cnic').disabled = false;
  document.getElementById('cnicNA').checked = false;
  // Father Name defaults to N/A — most walk-ins don't give it, so this
  // saves ticking the box every time; untick it to type one in.
  document.getElementById('fatherName').value = 'N/A';
  document.getElementById('fatherName').disabled = true;
  document.getElementById('fatherNameNA').checked = true;
  // Check-in defaults to today (Pakistan time) — nearly every walk-in checks in the day
  // they're entered, so this saves re-picking the date on every single guest.
  setStayDate('checkInDate', todayStr());
  updateDateReadout(document.getElementById('checkInDate'), document.getElementById('checkInDateReadout'));
  checkoutSetByUser = false;
  autoFillExpectedCheckout();
  document.getElementById('actualCheckoutDateReadout').textContent = '';
  document.getElementById('extraDetailList').innerHTML = '';
  clearMnEntryFields();
  document.getElementById('roomBody').innerHTML = '';
  document.getElementById('payBody').innerHTML = '';
  rowCount = 0;
  payCount = 0;
  returningPromptedDigits = null;
  returningPrefillDigits = null;
  addRow();
  addPayRow();
  calcGrandTotal();
}

