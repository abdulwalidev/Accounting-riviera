// ---- Add Payment page ----
function resetPayForm(){
  document.getElementById('dNewDate').value = todayStr();
  document.getElementById('dNewDateReadout').textContent = formatDate(todayStr());
  document.getElementById('dNewCash').value = '';
  document.getElementById('dNewCash').disabled = false;
  document.getElementById('dNewAccount').value = '';
  document.getElementById('dNewAccount').disabled = true;
  document.getElementById('dNewRemarks').value = '';
  document.getElementById('dNewBank').value = '';
  document.getElementById('dNewBank').disabled = true;
  document.getElementById('dNewMode').value = 'Cash';
  document.getElementById('dNewType').value = 'Due Payment';
  updateAddPayPreview();
}

function renderApList(){
  const listEl = document.getElementById('apGuestList');
  if(!initialLoadDone){
    listEl.innerHTML = '<div class="empty-note">' + cloudLoadingNote() + '</div>';
    return;
  }
  const searchVal = document.getElementById('apSearchInput').value.trim().toLowerCase();
  const dueOnly = document.getElementById('apDueOnly').checked;

  let items = loadAllEntries().map(entry=>{
    const t = computeTotals(entry);
    const roomNos = (entry.rooms || []).map(r=>r.roomNo).filter(Boolean).join(', ');
    return { entry, t, roomNos };
  });

  if(searchVal){
    const searchValNoDash = stripDashes(searchVal);
    items = items.filter(({entry, roomNos})=>{
      const haystack = [
        entry.guestName, entry.fatherName, entry.cnic, roomNos
      ].join(' ').toLowerCase();
      return haystack.includes(searchVal) || stripDashes(haystack).includes(searchValNoDash);
    });
  }
  if(dueOnly){
    items = items.filter(({t})=> t.due > 0);
  }
  items.sort((a,b)=> b.t.due - a.t.due);

  if(items.length === 0){
    listEl.innerHTML = '<div class="empty-note">' + (dueOnly ? 'No guests with a balance due. Untick the box to see everyone.' : 'No guests match.') + '</div>';
    return;
  }

  listEl.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Guest</th>
          <th style="width:120px;">Room</th>
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
          return `<tr style="cursor:pointer;" onclick="selectApGuest('${entry.id}')" title="Add a payment for this guest">
            <td>${entry.guestName || '(no name)'}${entry.fatherName && entry.fatherName !== 'N/A' ? ' <span style=\"color:var(--muted); font-weight:400;\">s/o ' + entry.fatherName + '</span>' : ''}</td>
            <td>${roomNos || '-'}</td>
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

function selectApGuest(id){
  currentDetailId = id;
  const entry = getCurrentEntry();
  if(!entry) return;
  renderApGuestStrip();
  document.getElementById('apPaySection').style.display = 'block';
  resetPayForm();
  document.getElementById('apPaySection').scrollIntoView({ behavior:'smooth', block:'start' });
  document.getElementById('dNewCash').focus();
}

function renderApGuestStrip(){
  const entry = getCurrentEntry();
  if(!entry) return;
  const t = computeTotals(entry);
  const roomNos = (entry.rooms || []).map(r=>r.roomNo).filter(Boolean).join(', ');
  document.getElementById('apGuestStrip').innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
      <div>
        <div style="font-family:'Inter',sans-serif; font-weight:700; font-size:17px; color:var(--ink);">${entry.guestName || '(no name)'}</div>
        <div style="color:var(--muted); font-family:'Inter',sans-serif; font-size:12px; margin-top:2px;">${entry.fatherName && entry.fatherName !== 'N/A' ? 's/o ' + entry.fatherName + ' &middot; ' : ''}${roomNos ? 'Room ' + roomNos : ''}</div>
      </div>
      <div class="gnums">
        <div class="box"><div class="lbl">Booking Total</div><div class="val">${t.bookingTotal.toLocaleString()}</div></div>
        <div class="box"><div class="lbl">Paid</div><div class="val cash-amt">${t.paid.toLocaleString()}</div></div>
        <div class="box"><div class="lbl">Balance Due</div><div class="val" style="color:${t.due>0?'var(--danger)':'var(--cash)'};">${t.due.toLocaleString()}</div></div>
        <div class="box"><div class="lbl">Status</div><div class="val"><span class="status ${t.status.toLowerCase()}">${t.status}</span></div></div>
      </div>
    </div>`;
}

function toggleDetailMode(){
  const mode = document.getElementById('dNewMode').value;
  const cash = document.getElementById('dNewCash');
  const acct = document.getElementById('dNewAccount');
  const bank = document.getElementById('dNewBank');
  if(mode === 'Cash'){
    cash.disabled = false; acct.disabled = true; acct.value = '';
    bank.disabled = true; bank.value = '';
  } else {
    // Bank Transfer or Card
    acct.disabled = false; cash.disabled = true; cash.value = '';
    bank.disabled = false;
  }
  updateAddPayPreview();
}

function addDetailPayment(){
  const date = document.getElementById('dNewDate').value;
  if(!date){ showNotice('Please pick a date.'); return; }
  if(isDateLocked(date)){
    showNotice(formatDate(date) + ' is locked — no new payment can be dated on this day.');
    return;
  }
  const type = document.getElementById('dNewType').value;
  const mode = document.getElementById('dNewMode').value;
  const bank = document.getElementById('dNewBank').value;
  const remarks = document.getElementById('dNewRemarks').value.trim();
  const cashInput = document.getElementById('dNewCash');
  const acctInput = document.getElementById('dNewAccount');
  const cash = parseFloat(cashInput.value) || 0;
  const account = parseFloat(acctInput.value) || 0;
  const total = cash + account;
  if(cash < 0 || account < 0){
    showNotice('Payment amounts cannot be negative.');
    focusError(cash < 0 ? cashInput : acctInput);
    return;
  }
  if(total <= 0){ showNotice('Enter a cash or account amount.'); return; }
  if((mode === 'Bank Transfer' || mode === 'Card') && !bank){ showNotice('Please select a bank.'); return; }

  const entry = getCurrentEntry();
  if(!entry) return;

  const t = computeTotals(entry);
  if(t.due === 0){
    showNotice('This booking is already fully paid — no more payments can be added.');
    return;
  }
  if(total > t.due){
    showNotice('This payment (Rs. ' + total.toLocaleString() + ') is MORE than the remaining Balance Due (Rs. ' + t.due.toLocaleString() + '). A payment can never be more than the due amount — please fix the figure.');
    focusError(mode === 'Cash' ? cashInput : acctInput);
    return;
  }
  const after = t.due - total;

  pendingDetailPayment = { date, type, mode, bank, cash, account, remarks, total };

  document.getElementById('addPayModalBody').innerHTML = `
    <div class="grid" style="margin-bottom:14px;">
      <div><div class="confirm-lbl">Guest</div><div class="confirm-val">${entry.guestName || '(no name)'}</div></div>
      <div><div class="confirm-lbl">Date</div><div class="confirm-val">${formatDate(date)}</div></div>
      <div><div class="confirm-lbl">Type</div><div class="confirm-val">${type}</div></div>
      <div><div class="confirm-lbl">Mode</div><div class="confirm-val">${mode}${bank ? ' — ' + bank : ''}</div></div>
      <div><div class="confirm-lbl">Remarks</div><div class="confirm-val">${remarks || '-'}</div></div>
    </div>
    <div class="summary" style="margin-top:0; padding-top:0; border-top:none;">
      <div class="box"><div class="lbl">This Payment</div><div class="val">${total.toLocaleString()}</div><div class="date-readout">= ${amountInWords(total)}</div></div>
      <div class="box"><div class="lbl">Balance Due Now</div><div class="val">${t.due.toLocaleString()}</div></div>
      <div class="box"><div class="lbl">Due After</div><div class="val" style="color:${after > 0 ? 'var(--danger)' : 'var(--cash)'};">${after.toLocaleString()}</div></div>
    </div>
  `;

  const input = document.getElementById('addPayTypeInput');
  input.value = '';
  input.classList.remove('duplicate');
  document.getElementById('addPayModalBackdrop').classList.add('active');
  input.focus();
}

let pendingDetailPayment = null;

function closeAddPayModal(){
  document.getElementById('addPayModalBackdrop').classList.remove('active');
  pendingDetailPayment = null;
}

function confirmAddPayment(){
  const input = document.getElementById('addPayTypeInput');
  if(input.value.trim().toLowerCase() !== 'confirm'){
    input.classList.add('duplicate');
    showNotice('Please type "confirm" in the box to add this payment.');
    input.focus();
    return;
  }
  if(!pendingDetailPayment) return;

  const all = loadAllEntries();
  const entry = all.find(e=> e.id === currentDetailId);
  if(!entry){ closeAddPayModal(); return; }

  if(!entry.payments) entry.payments = [];
  const payId = uid('p');
  entry.payments.push(Object.assign({ id: payId, createdBy: currentUser ? currentUser.username : '' }, pendingDetailPayment));
  newPaymentIds.add(payId);
  logGuestAction(entry.id, 'payment_added');
  queueEntryPush(entry.id);
  const savedTotal = pendingDetailPayment.total;
  closeAddPayModal();
  renderDetail();
  renderApGuestStrip();
  renderApList();
  resetPayForm();
  showNotice('Payment of Rs. ' + savedTotal.toLocaleString() + ' added.', 'success');
}

