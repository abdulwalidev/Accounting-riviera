// Bright in-page notice instead of the browser's plain alert() popup.
// Click to dismiss; errors stay a little longer than success messages.
function showNotice(message, kind){
  const wrap = document.getElementById('noticeWrap');
  if([...wrap.children].some(n=> n.dataset.msg === message)) return;
  const n = document.createElement('div');
  n.className = 'notice' + (kind === 'success' ? ' success' : '');
  n.dataset.msg = message;
  const icon = document.createElement('span');
  icon.className = 'notice-icon';
  icon.textContent = kind === 'success' ? '✓' : '⚠';
  const text = document.createElement('span');
  text.textContent = message;
  n.appendChild(icon);
  n.appendChild(text);
  n.onclick = ()=> n.remove();
  wrap.appendChild(n);
  setTimeout(()=>{ n.remove(); }, kind === 'success' ? 4000 : 6500);
}

// A red ✕ appears inside any .search-input-wrap input once it has text,
// so an active search filter is never silently invisible. Delegated once
// at the document level so it covers every search box, present or future,
// without wiring each one individually.
document.addEventListener('input', e=>{
  if(!e.target.matches('.search-input-wrap input')) return;
  e.target.closest('.search-input-wrap').classList.toggle('has-value', !!e.target.value);
});
document.addEventListener('click', e=>{
  const btn = e.target.closest('.search-clear-btn');
  if(!btn) return;
  const wrap = btn.closest('.search-input-wrap');
  const input = wrap.querySelector('input');
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles:true }));
  wrap.classList.remove('has-value');
  input.focus();
});

// Focus a field that failed validation with a red highlight (instead of the
// normal blue focus ring); the red clears as soon as the user edits the field.
function focusError(el){
  el.classList.add('field-error');
  const clear = ()=> el.classList.remove('field-error');
  el.addEventListener('input', clear, { once:true });
  el.addEventListener('change', clear, { once:true });
  el.focus();
}

function toggleSidebar(){
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarBackdrop').classList.toggle('show');
}

let currentView = 'entry';

function showView(view){
  if(view === 'daylock' && !isAdmin()){
    showNotice('Night Audit is only available to admin accounts.');
    return;
  }
  if(view === 'deleteentity' && !isAdmin()){
    showNotice('Delete Entity is only available to admin accounts.');
    return;
  }
  if(view === 'audit' && !isAdmin()){
    showNotice('Audit is only available to admin accounts.');
    return;
  }
  currentView = view;
  ['dashboard','cico','entry','reservations','addpay','search','report','graphs','frontdesk','detail','ledgers','daylock','deleteentity','roomdetail','newcheckin','housecount','audit'].forEach(v=>{
    const el = document.getElementById('view-' + v);
    if(el) el.classList.toggle('active', v === view);
  });
  document.getElementById('navDashboard').classList.toggle('active', view === 'dashboard');
  document.getElementById('navCico').classList.toggle('active', view === 'cico');
  document.getElementById('navRoomDetail').classList.toggle('active', view === 'roomdetail');
  document.getElementById('navEntry').classList.toggle('active', view === 'entry');
  document.getElementById('navReservations').classList.toggle('active', view === 'reservations');
  document.getElementById('navAddPay').classList.toggle('active', view === 'addpay');
  document.getElementById('navSearch').classList.toggle('active', view === 'search' || view === 'detail');
  document.getElementById('navReport').classList.toggle('active', view === 'report' || view === 'graphs');
  document.getElementById('navLedgers').classList.toggle('active', view === 'ledgers');
  document.getElementById('navDayLock').classList.toggle('active', view === 'daylock');
  document.getElementById('navAudit').classList.toggle('active', view === 'audit');
  document.getElementById('navDeleteEntity').classList.toggle('active', view === 'deleteentity');
  document.getElementById('topNavEntry').classList.toggle('active', view === 'entry');
  document.getElementById('topNavAddPay').classList.toggle('active', view === 'addpay');
  document.getElementById('topNavSearch').classList.toggle('active', view === 'search' || view === 'detail');
  document.getElementById('topNavReport').classList.toggle('active', view === 'report' || view === 'graphs');
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarBackdrop').classList.remove('show');
  if(view === 'report') renderReport();
  if(view === 'graphs') renderGraphs();
  if(view === 'reservations') renderReservations();
  if(view === 'search') renderSearch();
  if(view === 'entry') renderTodayEntries();
  if(view === 'addpay') renderApList();
  if(view === 'ledgers') renderLedgers();
  if(view === 'daylock') renderDayLock();
  if(view === 'audit') renderAuditLog();
  if(view === 'deleteentity') renderDeleteEntityList();
  if(view === 'roomdetail') renderRoomDetail('rd');
  if(view === 'dashboard') renderDashboard();
  if(view === 'cico') renderCico();
  if(view === 'frontdesk') renderFrontDesk();
  if(view === 'housecount') renderHouseCount();
  syncMunshiChrome(view);
}

// ---- Stay & Status date pickers (Check-in / Expected Checkout / Actual
// Checkout): flatpickr with an altInput, so the field the user sees and
// clicks shows a friendly "28 Jul 2026" with a calendar popup, while the
// underlying element (same id, same .value every existing call site reads)
// keeps the plain Y-m-d string those call sites already expect. Setting
// .value directly (as plenty of code still does) doesn't tell flatpickr
// anything changed, so every write goes through setStayDate() instead,
// which updates both.
const STAY_DATE_IDS = ['checkInDate', 'checkOutDate', 'actualCheckoutDate'];
const stayDatePickers = {};
function initStayDatePickers(){
  if(typeof flatpickr === 'undefined') return;
  STAY_DATE_IDS.forEach(id=>{
    const el = document.getElementById(id);
    if(!el || stayDatePickers[id]) return;
    stayDatePickers[id] = flatpickr(el, {
      dateFormat: 'Y-m-d',
      altInput: true,
      altFormat: 'd M Y',
      allowInput: true,
      disableMobile: true
    });
  });
}
function setStayDate(id, isoValue){
  const el = document.getElementById(id);
  if(!el) return;
  el.value = isoValue || '';
  const fp = stayDatePickers[id];
  if(fp) fp.setDate(isoValue || null, false);
}

