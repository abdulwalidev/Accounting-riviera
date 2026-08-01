// =========================================================
// NIGHT AUDIT — admin-only. Closing a business day means: look at what
// actually happened that night (room-nights sold, revenue, payments taken,
// arrivals/departures, guests who never showed), then post it — which
// locks the date via the same `locked_days` mechanism Day Lock always
// used, so no new payment can be backdated onto it afterward. Everything
// in the summary is computed from real data already trusted elsewhere in
// this app (Ledgers' room-night expansion, the Dashboard/CICO movement
// calc, the Reservations no-show flag) — nothing here is invented.
// `lockedDays` is the cloud mirror kept fresh by pullFreshFromCloud(); a
// date counts as locked while it has a row with no unlocked_at.
// =========================================================
function isDateLocked(dateStr){
  if(!dateStr) return false;
  return lockedDays.some(l=> l.lock_date === dateStr && !l.unlocked_at);
}

function findLockRow(dateStr){
  return lockedDays.find(l=> l.lock_date === dateStr && !l.unlocked_at) || null;
}

// ---- The audit summary itself: everything real that happened on a date ----
function buildNightAuditSummary(dateStr){
  const rooms = computeRoomStatuses(dateStr);
  const occupiedCount = rooms.filter(r=> r.occupied).length;

  const roomNights = buildLedgersRecords().filter(r=> r.date === dateStr);
  const revenue = roomNights.reduce((s,r)=> s + r.rent, 0);
  const receivedAgainstNight = roomNights.reduce((s,r)=> s + r.received, 0);

  let cashTotal = 0, accountTotal = 0, paymentsCount = 0;
  loadAllEntries().forEach(entry=>{
    (entry.payments || []).forEach(p=>{
      if(p.date !== dateStr) return;
      cashTotal += num(p.cash);
      accountTotal += num(p.account);
      paymentsCount++;
    });
  });

  const move = computeMovement(dateStr, dateStr);
  const noShows = move.expectedCheckins.filter(({entry})=> !entry.resStatus);

  return {
    date: dateStr,
    totalRooms: rooms.length,
    occupiedCount,
    vacantCount: rooms.length - occupiedCount,
    roomNightsSold: roomNights.length,
    revenue,
    receivedAgainstNight,
    cashTotal, accountTotal,
    paymentsTotal: cashTotal + accountTotal,
    paymentsCount,
    arrivals: move.expectedCheckins.length + move.actualCheckins.length,
    departures: move.expectedCheckouts.length,
    noShowIds: noShows.map(({entry})=> entry.id)
  };
}

function renderNightAuditSummary(dateStr){
  const el = document.getElementById('naSummary');
  const noShowEl = document.getElementById('naNoShows');
  if(!el) return;
  if(!initialLoadDone){
    el.innerHTML = '<div class="empty-note">' + cloudLoadingNote() + '</div>';
    if(noShowEl) noShowEl.innerHTML = '';
    return;
  }
  const s = buildNightAuditSummary(dateStr);
  const tiles = [
    ['Occupied Rooms', s.occupiedCount + ' / ' + s.totalRooms],
    ['Room-nights Sold', s.roomNightsSold],
    ['Room Revenue', 'Rs. ' + s.revenue.toLocaleString()],
    ['Payments Received', 'Rs. ' + s.paymentsTotal.toLocaleString() + ' (' + s.paymentsCount + ')'],
    ['Cash / Bank', s.cashTotal.toLocaleString() + ' / ' + s.accountTotal.toLocaleString()],
    ['Arrivals', s.arrivals],
    ['Departures', s.departures],
    ['Possible No-shows', s.noShowIds.length]
  ];
  el.innerHTML = `<div class="dash-tiles">` + tiles.map(([label, val])=>
    `<div class="dash-tile" style="cursor:default;"><div class="dash-tile-val" style="font-size:19px;">${val}</div><div class="dash-tile-lbl">${label}</div></div>`
  ).join('') + `</div>`;

  if(noShowEl){
    if(s.noShowIds.length === 0){
      noShowEl.innerHTML = '<div class="empty-note">No candidates — everyone expected to arrive on this date is already checked in or already flagged.</div>';
    } else {
      const all = loadAllEntries();
      noShowEl.innerHTML = `
        <table>
          <thead><tr><th>Guest</th><th style="width:120px;">Room</th><th style="width:100px;">Check-in</th><th style="width:140px;"></th></tr></thead>
          <tbody>${s.noShowIds.map(id=>{
            const entry = all.find(e=> e.id === id);
            if(!entry) return '';
            const roomNos = (entry.rooms || []).map(r=> r.roomNo).filter(Boolean).join(', ') || '-';
            return `<tr>
              <td>${entry.guestName || '(no name)'}</td>
              <td>${roomNos}</td>
              <td>${formatDate(entry.checkIn)}</td>
              <td><button class="btn secondary" style="min-height:28px; padding:3px 10px;" onclick="markNoShowFromAudit('${entry.id}')">Mark No-show</button></td>
            </tr>`;
          }).join('')}</tbody>
        </table>`;
    }
  }
}

function markNoShowFromAudit(id){
  setReservationStatus(id, 'no_show');
  renderNightAuditSummary(document.getElementById('dlDate').value || todayStr());
}

// Locking or unlocking a day both go through this same typed-word
// confirmation modal — LOCK to lock, UNLOCK to unlock — so a stray click
// can never close or reopen a night by accident.
let pendingDayLockAction = null;

function openDayLockModal(mode, dateStr){
  if(!dateStr){ showNotice('Please pick a date first.'); return; }
  pendingDayLockAction = { mode, dateStr };
  const word = mode === 'lock' ? 'LOCK' : 'UNLOCK';
  document.getElementById('dayLockModalTitle').textContent = mode === 'lock' ? 'Confirm Night Audit' : 'Confirm Reopen';
  document.getElementById('dayLockModalSub').textContent = mode === 'lock'
    ? 'This posts the night audit for ' + formatDate(dateStr) + ' and locks it — no new payment will be allowed on this date afterward.'
    : 'Payments will be allowed on ' + formatDate(dateStr) + ' again once reopened.';
  document.getElementById('dayLockModalLabel').textContent = 'Type ' + word + ' to ' + (mode === 'lock' ? 'post' : 'reopen') + ' this night';
  const input = document.getElementById('dayLockTypeInput');
  input.value = '';
  input.placeholder = mode;
  input.classList.remove('duplicate');
  const btn = document.getElementById('dayLockModalConfirmBtn');
  btn.textContent = mode === 'lock' ? 'Post Night Audit' : 'Reopen This Night';
  btn.className = mode === 'lock' ? 'btn' : 'btn secondary';
  document.getElementById('dayLockModalBackdrop').classList.add('active');
  input.focus();
}

function closeDayLockModal(){
  document.getElementById('dayLockModalBackdrop').classList.remove('active');
  pendingDayLockAction = null;
}

async function confirmDayLockAction(){
  if(!pendingDayLockAction) return;
  const { mode, dateStr } = pendingDayLockAction;
  const input = document.getElementById('dayLockTypeInput');
  if(input.value.trim().toLowerCase() !== mode){
    input.classList.add('duplicate');
    showNotice('Please type "' + mode.toUpperCase() + '" in the box to continue.');
    input.focus();
    return;
  }
  const btn = document.getElementById('dayLockModalConfirmBtn');
  btn.disabled = true;
  closeDayLockModal();
  if(mode === 'lock') await lockDay(dateStr); else await unlockDay(dateStr);
  btn.disabled = false;
}

async function lockDay(dateStr){
  if(!sb){ showNotice('Not connected to the cloud database — try again once it reconnects.'); return; }
  if(!dateStr){ showNotice('Please pick a date to post.'); return; }
  if(isDateLocked(dateStr)){ showNotice(formatDate(dateStr) + ' has already been posted.'); return; }
  try{
    const { error } = await sb.from('locked_days').upsert({
      lock_date: dateStr,
      locked_by: currentUser ? currentUser.username : '',
      locked_at: new Date().toISOString(),
      unlocked_by: null,
      unlocked_at: null,
      audit_summary: buildNightAuditSummary(dateStr)
    }, { onConflict: 'lock_date' });
    if(error) throw error;
    await pullFreshFromCloud();
    renderDayLock();
  }catch(e){
    console.error('Posting the night audit failed', e);
    showNotice(e && e.message && e.message.includes('locked_days')
      ? 'The Night Audit table doesn\'t exist yet — run migration/lock_days.sql and migration/night_audit_summary.sql in the Supabase SQL Editor first.'
      : 'Couldn\'t post this night — check the internet connection and try again.');
  }
}

async function unlockDay(dateStr){
  if(!sb){ showNotice('Not connected to the cloud database — try again once it reconnects.'); return; }
  try{
    const { error } = await sb.from('locked_days').update({
      unlocked_by: currentUser ? currentUser.username : '',
      unlocked_at: new Date().toISOString()
    }).eq('lock_date', dateStr);
    if(error) throw error;
    await pullFreshFromCloud();
    renderDayLock();
  }catch(e){
    console.error('Reopening the night failed', e);
    showNotice('Couldn\'t reopen this night — check the internet connection and try again.');
  }
}

function renderDayLock(){
  const listEl = document.getElementById('dayLockList');
  const dateEl = document.getElementById('dlDate');
  const actionBtn = document.getElementById('dlActionBtn');
  if(!listEl || !dateEl || !actionBtn) return;

  if(!initialLoadDone){
    listEl.innerHTML = '<div class="empty-note">' + cloudLoadingNote() + '</div>';
    return;
  }

  const pickedDate = dateEl.value || todayStr();
  renderNightAuditSummary(pickedDate);

  const lockRow = findLockRow(pickedDate);
  if(lockRow){
    actionBtn.textContent = 'Reopen This Night';
    actionBtn.className = 'btn secondary';
    actionBtn.onclick = ()=> openDayLockModal('unlock', pickedDate);
  } else {
    actionBtn.textContent = 'Post Night Audit';
    actionBtn.className = 'btn';
    actionBtn.onclick = ()=> openDayLockModal('lock', pickedDate);
  }

  const recent = lockedDays.slice().sort((a,b)=> b.lock_date.localeCompare(a.lock_date)).slice(0, 30);
  if(recent.length === 0){
    listEl.innerHTML = '<div class="empty-note">No nights have been posted yet.</div>';
    return;
  }
  listEl.innerHTML = `
    <table>
      <thead><tr><th style="width:110px;">Date</th><th style="width:90px;">Status</th><th>Posted By</th><th style="width:160px;">Posted At</th><th style="width:110px;"></th></tr></thead>
      <tbody>${recent.map(l=>{
        const active = !l.unlocked_at;
        return `
        <tr>
          <td>${formatDate(l.lock_date)}</td>
          <td><span class="mode-badge ${active ? 'bank' : 'cash'}">${active ? 'Posted' : 'Reopened'}</span></td>
          <td>${l.locked_by || '-'}</td>
          <td>${l.locked_at ? new Date(l.locked_at).toLocaleString() : '-'}</td>
          <td>${active ? `<button class="btn secondary" style="min-height:28px; padding:3px 10px;" onclick="openDayLockModal('unlock', '${l.lock_date}')">Reopen</button>` : ''}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
}
