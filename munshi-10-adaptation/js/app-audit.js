// =========================================================
// AUDIT — admin-only. One combined, paginated timeline for a single date:
// every row from the guest_edits log (created/edited/payment_added/
// reservation status changes/deletions — see LOG_ACTION_LABELS in
// app-guest-detail-page.js) plus Night Audit posts/reopens from
// `lockedDays`. Nothing new is tracked here; this just merges logs that
// already exist elsewhere in the app into one newest-first view.
// =========================================================
let auditPage = 1;

const AUDIT_ACTION_LABELS = Object.assign({
  night_posted: 'Night Audit posted',
  night_reopened: 'Night reopened'
}, typeof LOG_ACTION_LABELS !== 'undefined' ? LOG_ACTION_LABELS : {});

function buildAuditRows(dateStr){
  const byId = new Map(loadAllEntries().map(e=> [e.id, e]));

  const guestRows = editLogs.concat(pendingEditLogs)
    .filter(l=> l.at && toKarachiDateStr(l.at) === dateStr)
    .map(l=>{
      const entry = byId.get(l.guest_id);
      return {
        at: l.at,
        action: l.action,
        username: l.username,
        role: l.role,
        guestName: entry ? (entry.guestName || '(no name)') : '(deleted entry)',
        roomNos: entry ? (entry.rooms || []).map(r=> r.roomNo).filter(Boolean).join(', ') : '-',
        guestId: entry ? l.guest_id : null
      };
    });

  const nightRows = [];
  lockedDays.forEach(l=>{
    if(l.locked_at && toKarachiDateStr(l.locked_at) === dateStr){
      nightRows.push({ at: l.locked_at, action: 'night_posted', username: l.locked_by, role: '', guestName: 'Night Audit — ' + formatDate(l.lock_date), roomNos: '-', guestId: null });
    }
    if(l.unlocked_at && toKarachiDateStr(l.unlocked_at) === dateStr){
      nightRows.push({ at: l.unlocked_at, action: 'night_reopened', username: l.unlocked_by, role: '', guestName: 'Night reopened — ' + formatDate(l.lock_date), roomNos: '-', guestId: null });
    }
  });

  return guestRows.concat(nightRows).sort((a,b)=> (b.at || '').localeCompare(a.at || ''));
}

function goAuditPage(p){
  auditPage = p;
  renderAuditLog();
}

function renderAuditLog(){
  const bodyEl = document.getElementById('auditLogBody');
  const pagerEl = document.getElementById('auditPager');
  if(!bodyEl) return;
  if(!initialLoadDone){
    bodyEl.innerHTML = '<div class="empty-note">' + cloudLoadingNote() + '</div>';
    if(pagerEl) pagerEl.innerHTML = '';
    return;
  }

  const dateStr = document.getElementById('auditDate').value || todayStr();
  const rows = buildAuditRows(dateStr);

  if(rows.length === 0){
    bodyEl.innerHTML = '<div class="empty-note">Nothing recorded for ' + formatDate(dateStr) + '.</div>';
    if(pagerEl) pagerEl.innerHTML = '';
    return;
  }

  const sizeVal = document.getElementById('auditPageSize').value;
  const pageSize = sizeVal === 'all' ? rows.length : (parseInt(sizeVal) || 25);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  if(auditPage > totalPages) auditPage = totalPages;
  if(auditPage < 1) auditPage = 1;
  const start = (auditPage - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  bodyEl.innerHTML = `
    <table>
      <thead>
        <tr>
          <th style="width:80px;">Time</th>
          <th>Guest / Event</th>
          <th style="width:100px;">Room</th>
          <th style="width:170px;">Action</th>
          <th style="width:130px;">By</th>
          <th style="width:80px;">Role</th>
        </tr>
      </thead>
      <tbody>
        ${pageRows.map(r=>{
          const time = r.at ? new Date(r.at).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', timeZone:'Asia/Karachi' }) : '-';
          const clickable = r.guestId ? ` style="cursor:pointer;" onclick="openDetail('${r.guestId}')" title="Open this guest"` : '';
          return `<tr${clickable}>
            <td>${time}</td>
            <td>${r.guestName}</td>
            <td>${r.roomNos || '-'}</td>
            <td>${AUDIT_ACTION_LABELS[r.action] || r.action}</td>
            <td>${r.username || '-'}</td>
            <td>${r.role || '-'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;

  if(pagerEl){
    pagerEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <span class="sub" style="margin:0;">Showing ${start + 1}-${Math.min(start + pageSize, rows.length)} of ${rows.length}</span>
        <div style="display:flex; align-items:center; gap:10px;">
          <button class="btn secondary" style="min-height:28px; padding:3px 10px;" ${auditPage <= 1 ? 'disabled' : ''} onclick="goAuditPage(${auditPage - 1})">‹ Prev</button>
          <span class="sub" style="margin:0;">Page ${auditPage} of ${totalPages}</span>
          <button class="btn secondary" style="min-height:28px; padding:3px 10px;" ${auditPage >= totalPages ? 'disabled' : ''} onclick="goAuditPage(${auditPage + 1})">Next ›</button>
        </div>
      </div>`;
  }
}
