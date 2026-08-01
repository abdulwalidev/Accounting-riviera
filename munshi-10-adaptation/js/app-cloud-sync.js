// ---------- PULL: cloud-first load + background refresh ----------
let pullInFlight = null;
let lastServerHash = '';

function applyServerData(gRows, rRows, pRows){
  const roomsByGuest = {};
  rRows.slice().sort((a,b)=> (a.created_at || '').localeCompare(b.created_at || ''))
    .forEach(r=>{ (roomsByGuest[r.guest_id] = roomsByGuest[r.guest_id] || []).push(r); });
  const paysByGuest = {};
  pRows.slice().sort((a,b)=> (a.created_at || '').localeCompare(b.created_at || ''))
    .forEach(p=>{ (paysByGuest[p.guest_id] = paysByGuest[p.guest_id] || []).push(p); });

  const fromServer = gRows.map(g=> ({
    id: g.id,
    guestName: g.guest_name || '',
    fatherName: g.father_name || '',
    cnic: g.cnic || '',
    extraDetails: Array.isArray(g.extra_details) ? g.extra_details : [],
    savedAt: g.saved_at,
    editedAt: g.edited_at || undefined,
    rooms: (roomsByGuest[g.id] || []).map(r=> ({
      id: r.id, roomNo: r.room_no || '', unitType: r.unit_type || '',
      rent: num(r.rent_per_day), count: parseInt(r.days_count) || 1,
      movedOut: r.moved_out_date || '', total: num(r.total)
    })),
    savedBy: g.saved_by || '',
    editedBy: g.edited_by || '',
    checkIn: g.check_in || '',
    checkOut: g.check_out || '',
    resStatus: g.res_status || null,
    payments: (paysByGuest[g.id] || []).map(p=> ({
      id: p.id, date: p.payment_date, type: p.pay_type || 'Other', mode: p.mode || 'Cash',
      bank: p.bank || '', remarks: p.remarks || '', cash: num(p.cash), account: num(p.account), total: num(p.total),
      createdBy: p.created_by || '', enteredAt: p.created_at || ''
    }))
  }));

  // entries with a push still on the way keep their local version —
  // everything else becomes exactly what the server returned
  const serverIds = new Set(fromServer.map(e=> e.id));
  const next = fromServer.map(srv=>
    pendingPushIds.has(srv.id) ? (entries.find(e=> e.id === srv.id) || srv) : srv
  );
  entries.forEach(local=>{
    if(!serverIds.has(local.id) && pendingPushIds.has(local.id)) next.push(local);
  });
  entries = next;
}

async function pullFreshFromCloud(){
  if(!sb) return;
  if(pullInFlight) return pullInFlight; // already fetching — don't pile up requests
  pullInFlight = (async ()=>{
    const stampAtStart = mutationStamp;
    try{
      const [gRes, rRes, pRes, lRes, lkRes] = await Promise.all([
        sb.from('guests_active').select('*'),
        sb.from('booking_rooms_active').select('*'),
        sb.from('guest_payments_active').select('*'),
        sb.from('guest_edits').select('*'),
        sb.from('locked_days').select('*') // optional table — see catch below, not fatal if the migration hasn't been run yet
      ]);
      if(gRes.error) throw gRes.error;
      if(rRes.error) throw rRes.error;
      if(pRes.error) throw pRes.error;
      if(lRes.error) throw lRes.error;
      // a write finished while this snapshot was on the wire — the snapshot
      // is already stale, so fetch again instead of applying it
      if(mutationStamp !== stampAtStart){ requestBackgroundPull(); return; }

      const firstLoad = !initialLoadDone;
      initialLoadDone = true;
      lastSyncAt = new Date();
      // reads working doesn't mean writes landed — while saves are still
      // queued, the warning stays up until the push itself succeeds
      if(pendingPushIds.size === 0 && pendingSoftDeletes.length === 0 && pendingEditLogs.length === 0) syncProblem = null;

      const hash = JSON.stringify([gRes.data, rRes.data, pRes.data, lRes.data, lkRes.data]);
      const changed = hash !== lastServerHash;
      lastServerHash = hash;
      if(changed || firstLoad){
        applyServerData(gRes.data || [], rRes.data || [], pRes.data || []);
        editLogs = lRes.data || [];
        if(!lkRes.error) lockedDays = lkRes.data || [];
        rerenderActiveView();
      }
      if(firstLoad) setLoadingOverlay(false);
      updateCloudIndicator();
    }catch(e){
      console.error('Cloud pull failed — retrying on the next tick', e);
      setSyncProblem(navigator.onLine === false
        ? 'No internet — reconnecting…'
        : 'Can\'t reach the cloud database — retrying…');
      // before the first successful load there is nothing correct to show —
      // keep the loading screen up (with the reason) rather than painting
      // empty lists that look like real data
      if(!initialLoadDone){
        setLoadingOverlay(true, 'Can\'t reach the cloud database — check the internet connection. Retrying automatically…');
        rerenderActiveView();
      }
    }finally{
      pullInFlight = null;
    }
  })();
  return pullInFlight;
}

// Fire a pull shortly after any save — collapses a burst of saves into a
// single pull and never blocks the save itself since it's not awaited.
let pullDebounceTimer = null;
function requestBackgroundPull(){
  clearTimeout(pullDebounceTimer);
  pullDebounceTimer = setTimeout(()=> pullFreshFromCloud(), 500);
}

// Repaint whatever page is on screen from the fresh snapshot. The entry
// form itself is never data-bound, so a pull can never wipe mid-typing
// input — only the display lists rebuild.
function rerenderActiveView(){
  if(currentView === 'entry'){ renderTodayEntries(); }
  else if(currentView === 'reservations'){ renderReservations(); }
  else if(currentView === 'search'){ renderSearch(); }
  else if(currentView === 'report'){ renderReport(); }
  else if(currentView === 'graphs'){ renderGraphs(); }
  else if(currentView === 'detail'){ renderDetail(); }
  else if(currentView === 'addpay'){
    renderApList();
    if(currentDetailId && document.getElementById('apPaySection').style.display !== 'none'){
      renderApGuestStrip();
      updateAddPayPreview();
    }
  }
  else if(currentView === 'roomdetail'){ renderRoomDetail('rd'); }
  else if(currentView === 'frontdesk'){ renderFrontDesk(); }
  else if(currentView === 'housecount'){ renderHouseCount(); }
  else if(currentView === 'ledgers'){ renderLedgers(); }
  else if(currentView === 'daylock'){ renderDayLock(); }
  else if(currentView === 'audit'){ renderAuditLog(); }
  else if(currentView === 'deleteentity'){ renderDeleteEntityList(); }
  else if(currentView === 'dashboard'){ renderDashboard(); }
  else if(currentView === 'cico'){ renderCico(); }
}

window.addEventListener('online', ()=>{ syncProblem = null; updateCloudIndicator(); pushPendingNow(); pullFreshFromCloud(); });
document.addEventListener('visibilitychange', ()=>{ if(!document.hidden && appStarted){ pushPendingNow(); pullFreshFromCloud(); } });
setInterval(()=>{ if(appStarted){ pushPendingNow(); pullFreshFromCloud(); } }, 5000);

// Realtime (instant cross-device updates): if Realtime is enabled for these
// tables (migration/new_system_schema.sql does it), any change made on
// another device triggers an immediate pull here. If it isn't enabled this
// simply never fires — the 5-second poll above remains the guarantee.
if(sb && typeof sb.channel === 'function'){
  try{
    sb.channel('guest-system-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guests' }, ()=> requestBackgroundPull())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_rooms' }, ()=> requestBackgroundPull())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guest_payments' }, ()=> requestBackgroundPull())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guest_edits' }, ()=> requestBackgroundPull())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'locked_days' }, ()=> requestBackgroundPull())
      .subscribe();
  }catch(e){ console.error('Realtime unavailable — the 5s poll covers it', e); }
}

// Nobody leaves with unsaved work silently: anything still queued gets
// flushed to the server with keepalive requests (the browser lets them
// finish even after the page is gone), AND the "leave site?" prompt is
// shown, because the server hasn't confirmed those rows yet.
function flushPendingKeepalive(){
  if(!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  if(pendingPushIds.size === 0 && pendingEditLogs.length === 0) return;
  const guests = [], rooms = [], pays = [];
  pendingPushIds.forEach(id=>{
    const e = entries.find(x=> x.id === id);
    if(!e) return;
    guests.push(guestPayload(e));
    (e.rooms || []).forEach(r=> rooms.push(roomPayload(e, r)));
    (e.payments || []).forEach(p=> pays.push(paymentPayload(e, p)));
  });
  const send = (table, body)=>{
    if(!body.length) return;
    try{
      fetch(SUPABASE_URL + '/rest/v1/' + table + '?on_conflict=id', {
        method: 'POST',
        keepalive: true,
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify(body)
      });
    }catch(e){ /* best effort — the leave prompt below still warns */ }
  };
  send('guests', guests);
  send('booking_rooms', rooms);
  send('guest_payments', pays);
  send('guest_edits', pendingEditLogs.slice());
}
window.addEventListener('pagehide', flushPendingKeepalive);
window.addEventListener('beforeunload', ev=>{
  if(pendingPushIds.size === 0 && pendingSoftDeletes.length === 0 && pendingEditLogs.length === 0) return;
  flushPendingKeepalive();
  ev.preventDefault();
  ev.returnValue = '';
});

