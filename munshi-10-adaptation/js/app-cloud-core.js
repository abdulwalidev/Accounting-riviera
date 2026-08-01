// =========================================================
// CLOUD DATA LAYER — Supabase IS the database. `entries` is an in-memory
// mirror of the server, refreshed by pullFreshFromCloud() and pushed by
// pushPendingNow(). Every save goes to the cloud immediately; a save that
// can't reach the server stays queued (red banner + status line) and is
// retried near-instantly until it lands — it is never silently dropped.
// localStorage is never trusted for data.
// =========================================================
const SUPABASE_URL = "https://hlucnaqttbweikceutlt.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_fenOA9Bs7g1T6ADn_FujMw_rZESIU_6";
const sb = (typeof window.supabase !== "undefined" && SUPABASE_URL && SUPABASE_ANON_KEY)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

let entries = [];               // the cloud mirror every page reads from
let lockedDays = [];            // cloud mirror of locked_days — { lock_date, locked_by, locked_at, unlocked_by, unlocked_at }
let initialLoadDone = false;    // nothing renders as "no data" until the first successful pull
let appStarted = false;

// Bumped after every confirmed write. A pull whose snapshot was fetched
// before a write finished is stale by definition — it gets discarded and
// re-run instead of overwriting fresher in-memory state.
let mutationStamp = 0;

function uid(prefix){
  return (prefix || '') + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
}

function num(v){
  const n = parseFloat(String(v === undefined || v === null ? '' : v).replace(/,/g,''));
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

// ---------- sync status line + warning banner ----------
let lastSyncAt = null;
let syncProblem = null;

function updateCloudIndicator(){
  const el = document.getElementById('cloudStatus');
  if(el){
    const pending = pendingPushIds.size + pendingSoftDeletes.length + pendingEditLogs.length;
    if(!sb){
      el.textContent = '⚠ Cloud database not configured';
      el.style.color = 'var(--danger)';
    } else if(syncProblem){
      el.textContent = '☁ ' + syncProblem + (pending ? ' (' + pending + ' unsaved)' : '');
      el.style.color = 'var(--danger)';
    } else if(pending){
      el.textContent = '☁ Saving…';
      el.style.color = 'var(--gold-deep)';
    } else if(lastSyncAt){
      el.textContent = '☁ Live — synced ' + lastSyncAt.toLocaleTimeString();
      el.style.color = 'var(--cash)';
    } else {
      el.textContent = '☁ Connecting…';
      el.style.color = 'var(--muted)';
    }
  }
  const banner = document.getElementById('cloudBanner');
  if(banner) banner.classList.toggle('show', !sb || !!syncProblem);
}

function setSyncProblem(msg){ syncProblem = msg; updateCloudIndicator(); }

function cloudLoadingNote(){
  return syncProblem
    ? 'Couldn\'t load from the cloud database — check the internet connection; retrying…'
    : 'Loading from the cloud database…';
}

// Full-screen cover shown after login until the first successful pull —
// the app never paints empty lists that could be mistaken for real data.
function setLoadingOverlay(show, msg){
  const el = document.getElementById('loadingOverlay');
  if(!el) return;
  el.classList.toggle('hidden', !show);
  if(msg){
    const text = document.getElementById('loadingOverlayText');
    if(text) text.textContent = msg;
  }
}

// ---------- cloud payloads (app shape -> table rows) ----------
function guestPayload(e){
  return {
    id: e.id,
    guest_name: e.guestName || '',
    father_name: e.fatherName || '',
    cnic: e.cnic || '',
    extra_details: e.extraDetails || [],
    saved_at: e.savedAt || new Date().toISOString(),
    edited_at: e.editedAt || null,
    saved_by: e.savedBy || '',
    edited_by: e.editedBy || '',
    check_in: e.checkIn || null,
    check_out: e.checkOut || null,
    res_status: e.resStatus || null
  };
}
function roomPayload(e, r){
  return {
    id: r.id,
    guest_id: e.id,
    room_no: r.roomNo || '',
    unit_type: r.unitType || '',
    rent_per_day: num(r.rent),
    days_count: parseInt(r.count) || 1,
    moved_out_date: r.movedOut || null,
    total: num(r.total)
  };
}
function paymentPayload(e, p){
  return {
    id: p.id,
    guest_id: e.id,
    payment_date: p.date,
    pay_type: p.type || 'Other',
    mode: p.mode || 'Cash',
    bank: p.bank || '',
    remarks: p.remarks || '',
    cash: num(p.cash),
    account: num(p.account),
    total: num(p.total),
    created_by: p.createdBy || ''
  };
}

// ---------- PUSH: per-save with fast retry ----------
// Entry ids with changes the server hasn't confirmed yet, plus room/payment
// rows removed during an edit that still need their soft-delete stamped.
const pendingPushIds = new Set();
const pendingSoftDeletes = []; // { kind: 'room' | 'payment', id }
const pendingEditLogs = [];    // append-only audit rows not yet on the server
let editLogs = [];             // server mirror of the guest_edits log
let pushInFlight = false;
let pushRetryTimer = null;

// Records who did what for the change history. Queued alongside the save
// itself and pushed with it.
function logGuestAction(guestId, action){
  pendingEditLogs.push({
    id: uid('l'),
    guest_id: guestId,
    username: currentUser ? currentUser.username : '',
    role: currentUser ? currentUser.role : '',
    action,
    at: new Date().toISOString()
  });
}

function getLogsFor(guestId){
  const seen = new Set();
  return editLogs.concat(pendingEditLogs)
    .filter(l=>{
      if(l.guest_id !== guestId || seen.has(l.id)) return false;
      seen.add(l.id);
      return true;
    })
    .sort((a,b)=> (b.at || '').localeCompare(a.at || ''));
}

function queueSoftDelete(kind, id){
  pendingSoftDeletes.push({ kind, id });
}

function queueEntryPush(entryId){
  pendingPushIds.add(entryId);
  updateCloudIndicator();
  pushPendingNow();
}

async function pushPendingNow(){
  if(!sb || pushInFlight) return;
  if(pendingPushIds.size === 0 && pendingSoftDeletes.length === 0 && pendingEditLogs.length === 0) return;
  pushInFlight = true;
  try{
    // soft-deletes first, so an edit that removed a payment can never leave
    // the removed row alive while the rest of the edit already landed
    while(pendingSoftDeletes.length > 0){
      const d = pendingSoftDeletes[0];
      const { error } = d.kind === 'room'
        ? await sb.rpc('soft_delete_booking_room', { p_room_id: d.id, p_reason: 'removed while editing entry' })
        : await sb.rpc('soft_delete_guest_payment', { p_payment_id: d.id, p_reason: 'removed while editing entry' });
      if(error) throw error;
      mutationStamp++;
      pendingSoftDeletes.shift();
    }
    for(const id of Array.from(pendingPushIds)){
      const entry = entries.find(e=> e.id === id);
      if(!entry){ pendingPushIds.delete(id); continue; }
      // the guest row goes first (rooms/payments reference it), and the
      // upsert hands the stored row back — if it carries deleted_at, this
      // entry was deleted from another device and the delete wins: never
      // resurrect it, never pretend the save counted
      const { data: savedRows, error } = await sb.from('guests').upsert(guestPayload(entry), { onConflict: 'id' }).select();
      if(error) throw error;
      const saved = savedRows && savedRows[0];
      if(saved && saved.deleted_at){
        pendingPushIds.delete(id);
        entries = entries.filter(e=> e.id !== id);
        showNotice('The entry for "' + (entry.guestName || 'no name') + '" was deleted from another device, so these changes can\'t be saved. It will now disappear here too.');
        rerenderActiveView();
        continue;
      }
      if(entry.rooms && entry.rooms.length){
        const { error: rErr } = await sb.from('booking_rooms').upsert(entry.rooms.map(r=> roomPayload(entry, r)), { onConflict: 'id' });
        if(rErr) throw rErr;
      }
      if(entry.payments && entry.payments.length){
        const { error: pErr } = await sb.from('guest_payments').upsert(entry.payments.map(p=> paymentPayload(entry, p)), { onConflict: 'id' });
        if(pErr) throw pErr;
      }
      mutationStamp++;
      pendingPushIds.delete(id);
    }
    if(pendingEditLogs.length > 0){
      const { error: lErr } = await sb.from('guest_edits').upsert(pendingEditLogs.slice(), { onConflict: 'id' });
      if(lErr) throw lErr;
      mutationStamp++;
      editLogs = editLogs.concat(pendingEditLogs.splice(0));
    }
    if(syncProblem) syncProblem = null;
    requestBackgroundPull();
  }catch(e){
    console.error('Cloud push failed — will keep retrying automatically', e);
    setSyncProblem(navigator.onLine === false
      ? 'No internet — the save is queued and pushes the moment the connection is back.'
      : 'Couldn\'t save to the cloud database — retrying automatically…');
    clearTimeout(pushRetryTimer);
    pushRetryTimer = setTimeout(pushPendingNow, 1500); // near-instant retry, not just the 5s tick
  }finally{
    pushInFlight = false;
    updateCloudIndicator();
  }
}

