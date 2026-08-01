// ---- Delete confirmation: every ✕ shows what is being removed and
// requires typing "delete", so a mis-click can't wipe entered data. ----
let pendingDelete = null; // { tr, kind: 'room' | 'payment' }

function requestDeleteRow(btn, kind){
  // Every ✕ in the app goes through this modal — no exceptions.
  const tr = btn.closest(kind === 'detail' ? '.extra-detail-row' : 'tr');
  pendingDelete = { tr, kind };
  const body = document.getElementById('deleteBody');

  if(kind === 'detail'){
    body.innerHTML = `
      <div class="grid" style="margin-bottom:14px;">
        <div><div class="confirm-lbl">Detail Type</div><div class="confirm-val">${tr.querySelector('.edKind').value || '(not selected)'}</div></div>
        <div><div class="confirm-lbl">Value</div><div class="confirm-val">${tr.querySelector('.edValue').value.trim() || '(empty)'}</div></div>
      </div>`;
  } else if(kind === 'room'){
    body.innerHTML = `
      <div class="grid" style="margin-bottom:14px;">
        <div><div class="confirm-lbl">Room No / Apt No</div><div class="confirm-val">${tr.querySelector('.roomNo').value.trim() || '-'}</div></div>
        <div><div class="confirm-lbl">Type</div><div class="confirm-val">${tr.querySelector('.unitType').value || '-'}</div></div>
        <div><div class="confirm-lbl">Rent Per Day</div><div class="confirm-val">${(parseFloat(tr.querySelector('.rent').value) || 0).toLocaleString()}</div></div>
        <div><div class="confirm-lbl">No of Days</div><div class="confirm-val">${tr.dataset.rooms || 1}</div></div>
        <div><div class="confirm-lbl">Moved Out</div><div class="confirm-val">${tr.querySelector('.movedOut').value ? formatDate(tr.querySelector('.movedOut').value) : '-'}</div></div>
        <div><div class="confirm-lbl">Total</div><div class="confirm-val">${tr.querySelector('.rowtotal').textContent || 0}</div></div>
      </div>`;
  } else {
    const dateVal = tr.querySelector('.payDate').value;
    body.innerHTML = `
      <div class="grid" style="margin-bottom:14px;">
        <div><div class="confirm-lbl">Date</div><div class="confirm-val">${dateVal ? formatDate(dateVal) : '-'}</div></div>
        <div><div class="confirm-lbl">Type</div><div class="confirm-val">${tr.querySelector('.payType').value}</div></div>
        <div><div class="confirm-lbl">Mode</div><div class="confirm-val">${tr.querySelector('.payMode').value}</div></div>
        <div><div class="confirm-lbl">Bank</div><div class="confirm-val">${tr.querySelector('.payBank').value || '-'}</div></div>
        <div><div class="confirm-lbl">Remarks</div><div class="confirm-val">${tr.querySelector('.payRemarks').value.trim() || '-'}</div></div>
        <div><div class="confirm-lbl">Cash Amount</div><div class="confirm-val">${(parseFloat(tr.querySelector('.payCash').value) || 0).toLocaleString()}</div></div>
        <div><div class="confirm-lbl">Account Amount</div><div class="confirm-val">${(parseFloat(tr.querySelector('.payAccount').value) || 0).toLocaleString()}</div></div>
        <div><div class="confirm-lbl">Row Total</div><div class="confirm-val">${tr.querySelector('.payTotal').textContent || 0}</div></div>
      </div>`;
  }

  const input = document.getElementById('deleteTypeInput');
  input.value = '';
  input.classList.remove('duplicate');
  document.getElementById('deleteModalBackdrop').classList.add('active');
  input.focus();
}

function closeDeleteModal(){
  document.getElementById('deleteModalBackdrop').classList.remove('active');
  pendingDelete = null;
}

function confirmDeleteRow(){
  const input = document.getElementById('deleteTypeInput');
  if(input.value.trim().toLowerCase() !== 'delete'){
    input.classList.add('duplicate');
    showNotice('Please type "delete" in the box to remove this row.');
    input.focus();
    return;
  }
  if(!pendingDelete) return;
  const { tr, kind } = pendingDelete;
  if(kind === 'room'){
    deleteRow(tr); // closest('tr') on a tr returns itself
  } else if(kind === 'payment'){
    deletePayRow(tr);
  } else {
    tr.remove(); // extra-detail row — nothing to renumber or recalc
  }
  closeDeleteModal();
}

function renumber(){
  document.querySelectorAll('#roomBody tr').forEach((tr,i)=>{
    tr.querySelector('.rmno').textContent = i+1;
  });
  rowCount = document.querySelectorAll('#roomBody tr').length;
}

function calcGrandTotal(){
  let sum = 0;
  document.querySelectorAll('#roomBody .rowtotal').forEach(td=>{
    sum += parseFloat(td.textContent.replace(/,/g,'')) || 0;
  });
  document.getElementById('grandTotal').textContent = sum.toLocaleString();
  calcSummary();
}

