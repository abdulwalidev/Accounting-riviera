// =========================================================
// DELETE ENTITY — admin-only. Soft-deletes a whole guest entry (rooms and
// payments go with it, since they're nested under the guest client-side and
// disappear once the guest itself drops out of guests_active). Nothing is
// hard-deleted server-side — recovery is a manual SQL Editor operation, the
// same "no DELETE grant" posture as the rest of this schema.
// =========================================================
let pendingDeleteEntityId = null;

// An entry with a payment dated on a posted (locked) night can't be deleted —
// deleting the whole entry would silently take that payment down with it,
// which is exactly what Night Audit posting exists to prevent.
function entryHasLockedPayment(entry){
  return (entry.payments || []).some(p=> isDateLocked(p.date));
}

function renderDeleteEntityList(){
  const listEl = document.getElementById('delGuestList');
  if(!initialLoadDone){
    listEl.innerHTML = '<div class="empty-note">' + cloudLoadingNote() + '</div>';
    return;
  }
  const searchVal = document.getElementById('delSearchInput').value.trim().toLowerCase();
  if(!searchVal){
    listEl.innerHTML = '<div class="empty-note">Type a name, CNIC, or room number to find the entry to delete.</div>';
    return;
  }

  let items = loadAllEntries().map(entry=>{
    const t = computeTotals(entry);
    const roomNos = (entry.rooms || []).map(r=>r.roomNo).filter(Boolean).join(', ');
    return { entry, t, roomNos };
  });
  const searchValNoDash = stripDashes(searchVal);
  items = items.filter(({entry, roomNos})=>{
    const haystack = [entry.guestName, entry.fatherName, entry.cnic, roomNos].join(' ').toLowerCase();
    return haystack.includes(searchVal) || stripDashes(haystack).includes(searchValNoDash);
  });

  if(items.length === 0){
    listEl.innerHTML = '<div class="empty-note">No guests match.</div>';
    return;
  }
  items.sort((a,b)=> (b.entry.savedAt || '').localeCompare(a.entry.savedAt || ''));

  listEl.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Guest</th><th style="width:120px;">Room</th><th style="width:100px;">Entered</th>
          <th style="width:110px;">Total</th><th style="width:100px;">Paid</th><th style="width:100px;">Due</th><th style="width:110px;"></th>
        </tr>
      </thead>
      <tbody>
        ${items.map(({entry, t, roomNos})=>{
          const locked = entryHasLockedPayment(entry);
          return `
          <tr>
            <td>${entry.guestName || '(no name)'}${entry.fatherName && entry.fatherName !== 'N/A' ? ' <span style="color:var(--muted); font-weight:400;">s/o ' + entry.fatherName + '</span>' : ''}</td>
            <td>${roomNos || '-'}</td>
            <td>${entry.savedAt ? formatDate(toKarachiDateStr(entry.savedAt)) : '-'}</td>
            <td>${t.bookingTotal.toLocaleString()}</td>
            <td class="cash-amt">${t.paid.toLocaleString()}</td>
            <td style="font-weight:700; color:${t.due > 0 ? 'var(--danger)' : 'inherit'};">${t.due.toLocaleString()}</td>
            <td>${locked
              ? `<button class="btn danger-solid" style="min-height:28px; padding:3px 10px;" disabled title="This entry has a payment on a locked day — it can't be deleted.">🔒 Locked</button>`
              : `<button class="btn danger-solid" style="min-height:28px; padding:3px 10px;" onclick="openDeleteEntityModal('${entry.id}')">Delete</button>`}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

function openDeleteEntityModal(id){
  if(!isAdmin()){ showNotice('Delete Entity is only available to admin accounts.'); return; }
  const entry = loadAllEntries().find(e=> e.id === id);
  if(!entry) return;
  if(entryHasLockedPayment(entry)){
    showNotice('This entry has a payment dated on a locked day and can\'t be deleted. Unlock that day first if this really needs to be removed.');
    return;
  }
  pendingDeleteEntityId = id;
  const t = computeTotals(entry);
  const roomNos = (entry.rooms || []).map(r=>r.roomNo).filter(Boolean).join(', ');
  document.getElementById('deleteEntityBody').innerHTML = `
    <div class="grid" style="margin-bottom:14px;">
      <div><div class="confirm-lbl">Guest</div><div class="confirm-val">${entry.guestName || '(no name)'}</div></div>
      <div><div class="confirm-lbl">Father Name</div><div class="confirm-val">${entry.fatherName || '-'}</div></div>
      <div><div class="confirm-lbl">CNIC</div><div class="confirm-val">${entry.cnic || '-'}</div></div>
      <div><div class="confirm-lbl">Room(s)</div><div class="confirm-val">${roomNos || '-'}</div></div>
      <div><div class="confirm-lbl">Total</div><div class="confirm-val">${t.bookingTotal.toLocaleString()}</div></div>
      <div><div class="confirm-lbl">Paid</div><div class="confirm-val">${t.paid.toLocaleString()}</div></div>
    </div>`;
  document.getElementById('deleteEntityReason').value = '';
  const input = document.getElementById('deleteEntityTypeInput');
  input.value = '';
  input.classList.remove('duplicate');
  document.getElementById('deleteEntityModalBackdrop').classList.add('active');
  input.focus();
}

function closeDeleteEntityModal(){
  document.getElementById('deleteEntityModalBackdrop').classList.remove('active');
  pendingDeleteEntityId = null;
}

async function deleteGuestEntity(id, reason){
  if(!sb) return { ok:false, msg: 'Not connected to the cloud database — try again once it reconnects.' };
  try{
    const { error } = await sb.rpc('soft_delete_guest', { p_guest_id: id, p_reason: reason || null });
    if(error) throw error;
    logGuestAction(id, 'deleted');
    pushPendingNow(); // fire-and-forget — the guest row is already gone, only the log entry still needs to land
    entries = entries.filter(e=> e.id !== id);
    mutationStamp++;
    await pullFreshFromCloud();
    return { ok:true };
  }catch(e){
    console.error('Deleting the entry failed', e);
    return { ok:false, msg: (e && e.message && e.message.includes('soft_delete_guest'))
      ? 'The delete function doesn\'t exist yet — run migration/soft_delete_guest.sql in the Supabase SQL Editor first.'
      : 'Couldn\'t delete this entry — check the internet connection and try again.' };
  }
}

async function confirmDeleteEntity(){
  const input = document.getElementById('deleteEntityTypeInput');
  if(input.value.trim().toLowerCase() !== 'delete'){
    input.classList.add('duplicate');
    showNotice('Please type "delete" in the box to remove this entry.');
    input.focus();
    return;
  }
  if(!pendingDeleteEntityId) return;
  const id = pendingDeleteEntityId;
  const entry = loadAllEntries().find(e=> e.id === id);
  if(entry && entryHasLockedPayment(entry)){
    showNotice('This entry has a payment dated on a locked day and can\'t be deleted. Unlock that day first if this really needs to be removed.');
    closeDeleteEntityModal();
    renderDeleteEntityList();
    return;
  }
  const reason = document.getElementById('deleteEntityReason').value.trim();
  const btn = document.querySelector('#deleteEntityModalBackdrop .btn.danger-solid');
  if(btn){ btn.disabled = true; btn.textContent = 'Deleting…'; }
  const result = await deleteGuestEntity(id, reason);
  if(btn){ btn.disabled = false; btn.textContent = 'Delete Entry'; }
  if(!result.ok){ showNotice(result.msg); return; }
  closeDeleteEntityModal();
  renderDeleteEntityList();
  showNotice('Entry deleted.', 'success');
}

