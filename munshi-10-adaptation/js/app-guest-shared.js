// ---- Shared guest data helpers ----
// `entries` (declared in the cloud data layer below) is an in-memory
// mirror of the cloud database — the ONLY source of truth. localStorage
// is never read for data anymore; it only holds a legacy copy that gets
// migrated to the cloud once on first run.
function loadAllEntries(){
  return entries;
}

function computeTotals(entry){
  const bookingTotal = (entry.rooms || []).reduce((s,r)=>{
    const t = parseFloat(String(r.total).replace(/,/g,'')) || 0;
    return s + t;
  }, 0);
  const paid = (entry.payments || []).reduce((s,p)=> s + (parseFloat(p.total) || 0), 0);
  const due = bookingTotal - paid;
  let status = 'Pending';
  if(bookingTotal > 0 && due <= 0) status = 'Paid';
  else if(paid > 0) status = 'Partial';
  return { bookingTotal, paid, due: Math.max(due,0), status };
}

// ---- Reservation status: active (null) / cancelled / no_show. A manual
// front-desk call, not something derivable from dates — a guest whose
// check-in date has passed may still turn up late. ----
const RES_STATUS_LABELS = { cancelled: 'Cancelled', no_show: 'No-show' };

function reservationStatusLabel(entry){
  return RES_STATUS_LABELS[entry.resStatus] || 'Active';
}

function setReservationStatus(id, status){
  const entry = entries.find(e=> e.id === id);
  if(!entry) return;
  entry.resStatus = status || null;
  logGuestAction(id, status ? 'res_' + status : 'res_reactivated');
  queueEntryPush(id);
  rerenderActiveView();
}

// The most recent thing that happened to this entry — created, edited, or
// had a payment added — used to sort "latest activity first" lists so a
// payment added just now on an old entry still floats it to the top.
function getLatestActivity(entry){
  let latest = entry.savedAt || '';
  if(entry.editedAt && entry.editedAt > latest) latest = entry.editedAt;
  (entry.payments || []).forEach(p=>{
    if(p.enteredAt && p.enteredAt > latest) latest = p.enteredAt;
  });
  return latest;
}

