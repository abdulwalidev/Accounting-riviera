// ---- Munshi mode: an alternate full-app skin styled after a conventional
// hotel-PMS front desk. Same views, same data — only the chrome (and the
// Home/Front-Desk pages, which have no Smart equivalent) look different. ----
const MN_TAB_VIEW = {
  home:'dashboard', reservations:'reservations', frontdesk:'frontdesk', analysis:'graphs',
  pos:null, cashier:'addpay', nightaudit:'daylock', housekeeping:null, cityledger:'ledgers', accounts:'report'
};
const VIEW_TO_MNTAB = {
  dashboard:'home', reservations:'reservations', frontdesk:'frontdesk', graphs:'analysis',
  addpay:'cashier', daylock:'nightaudit', ledgers:'cityledger', report:'accounts',
  cico:'frontdesk', roomdetail:'frontdesk', entry:'frontdesk', search:'frontdesk', deleteentity:'accounts',
  newcheckin:'frontdesk', housecount:'frontdesk', audit:'home'
};
const MN_SUBTABS = {
  home: [['Audit','audit'],['Unlock',null],['Users',null],['Departments',null],['Warehouses',null],['Lookups',null],['Tr Types',null],['Chart',null],['Taxes',null],['Templates',null],['Checklist',null],['Change Password',null],['Booking Engine',null],['API Docs',null]],
  frontdesk: [['Guest Entry','entry'],['Check-in / Check-out','cico'],['Room Detail','roomdetail'],['Reservations','reservations'],['Search','search'],['House Count','housecount']],
  reservations: [['Calendar',null],['New','entry'],['Booking.com',null],['Reservations','reservations'],['Forecast',null],['CC Transactions',null],['Cancel',null]],
  analysis: [['Detailed Graphs','graphs'],['Report','report']],
  cashier: [['Add Payment','addpay'],['Search','search']],
  nightaudit: [['Night Audit','daylock']],
  accounts: [['Report','report'],['Ledgers','ledgers'],['Delete Entity','deleteentity']]
};

function mnNotAvailable(msg){
  showNotice(msg || 'This module isn\'t used in this system.');
}

function mnGoTo(tab){
  const view = MN_TAB_VIEW[tab];
  if(!view){
    mnNotAvailable();
    return;
  }
  showView(view);
}

function mnJumpToSearch(){
  const q = document.getElementById('mnSearchInput').value.trim();
  showView('search');
  document.getElementById('gsearchInput').value = q;
  renderSearch();
}

function renderMnSubtabs(tab, view){
  const subEl = document.getElementById('mnSubtabs');
  const items = MN_SUBTABS[tab];
  if(!items || items.length === 0){
    subEl.innerHTML = '';
    subEl.style.display = 'none';
    return;
  }
  subEl.style.display = 'flex';
  subEl.innerHTML = items.map(([label, v])=>
    `<button class="mn-subtab${v && v === view ? ' active' : ''}${v ? '' : ' mn-disabled'}" onclick="${v ? `showView('${v}')` : 'mnNotAvailable()'}">${label}</button>`
  ).join('');
}

function syncMunshiChrome(view){
  const tab = VIEW_TO_MNTAB[view];
  if(!tab) return;
  document.querySelectorAll('.mn-tab').forEach(btn=> btn.classList.remove('active'));
  const btn = document.getElementById('mnTab' + tab.charAt(0).toUpperCase() + tab.slice(1));
  if(btn) btn.classList.add('active');
  renderMnSubtabs(tab, view);
  syncMnChromeHeight();
}

function updateMnDate(){
  const el = document.getElementById('mnDate');
  if(el) el.textContent = formatDate(todayStr());
}

// #munshiChrome is fixed-position, so page content needs a matching
// padding-top or it renders underneath the blue header / tab bars.
// Its actual height varies (header search wraps on narrow widths,
// subtabs show/hide per tab) so it's measured live rather than
// guessed with a fixed px value.
function syncMnChromeHeight(){
  const chrome = document.getElementById('munshiChrome');
  if(!chrome) return;
  const h = document.body.classList.contains('munshi-mode') ? chrome.offsetHeight : 0;
  document.documentElement.style.setProperty('--mn-chrome-h', h + 'px');
}

function setUiMode(isMunshi){
  document.body.classList.toggle('munshi-mode', isMunshi);
  if(isMunshi){
    updateMnDate();
    syncMunshiChrome(currentView);
  }
  syncMnChromeHeight();
}

function toggleUiMode(){
  setUiMode(!document.body.classList.contains('munshi-mode'));
}

function renderFrontDesk(){
  renderRoomDetail('fd');
}

function clearNewCheckinSearch(){
  ['ncSearchName','ncSearchMobile','ncSearchCnic','ncSearchEmail','ncSearchResId'].forEach(id=>{
    document.getElementById(id).value = '';
  });
}

function toggleNcTips(){
  document.getElementById('ncTipsBody').style.display = document.getElementById('ncHideTips').checked ? 'none' : '';
}

function updateFilterDateReadouts(){
  const fromVal = document.getElementById('filterFrom').value;
  const toVal = document.getElementById('filterTo').value;
  document.getElementById('filterFromReadout').textContent = fromVal ? formatDate(fromVal) : '';
  document.getElementById('filterToReadout').textContent = toVal ? formatDate(toVal) : '';
}

function clearFilters(){
  document.getElementById('filterFrom').value = '';
  document.getElementById('filterTo').value = '';
  document.getElementById('filterSearch').value = '';
  document.getElementById('filterCashSearch').value = '';
  updateFilterDateReadouts();
  renderReport();
}

function setFiltersToday(){
  const t = todayStr();
  document.getElementById('filterFrom').value = t;
  document.getElementById('filterTo').value = t;
  updateFilterDateReadouts();
  renderReport();
}


document.addEventListener('DOMContentLoaded', ()=>{
  setUiMode(true);
  initStayDatePickers();
  renderMnEntryPanels();
  showView('frontdesk');
  const mnChromeEl = document.getElementById('munshiChrome');
  if(mnChromeEl && window.ResizeObserver){
    new ResizeObserver(syncMnChromeHeight).observe(mnChromeEl);
  } else {
    window.addEventListener('resize', syncMnChromeHeight);
  }
  setFiltersToday();
  setStayDate('checkInDate', todayStr());
  updateDateReadout(document.getElementById('checkInDate'), document.getElementById('checkInDateReadout'));
  autoFillExpectedCheckout();
  ['filterFrom','filterTo'].forEach(id=>{
    document.getElementById(id).addEventListener('input', updateFilterDateReadouts);
  });
  ['filterFrom','filterTo','filterSearch','filterCashSearch'].forEach(id=>{
    document.getElementById(id).addEventListener('input', renderReport);
  });
  document.getElementById('gsearchInput').addEventListener('input', renderSearch);
  document.getElementById('resvSearchInput').addEventListener('input', renderReservations);
  document.getElementById('gsearchDueOnly').addEventListener('change', renderSearch);
  document.getElementById('gsearchHideCheckedOut').addEventListener('change', renderSearch);
  document.getElementById('gsearchShowZero').addEventListener('change', renderSearch);
  document.getElementById('gsearchDate').addEventListener('input', renderSearch);
  ['dNewCash','dNewAccount'].forEach(id=>{
    document.getElementById(id).addEventListener('input', updateAddPayPreview);
  });
  document.getElementById('apSearchInput').addEventListener('input', renderApList);
  document.getElementById('apDueOnly').addEventListener('change', renderApList);
  document.getElementById('rdSearchInput').addEventListener('input', ()=> renderRoomDetail('rd'));
  document.getElementById('rdOccupiedOnly').addEventListener('change', ()=> renderRoomDetail('rd'));
  document.getElementById('rdDate').addEventListener('input', ()=> renderRoomDetail('rd'));
  document.getElementById('rdDate').value = todayStr();
  document.getElementById('fdSearchInput').addEventListener('input', ()=> renderRoomDetail('fd'));
  document.getElementById('fdOccupiedOnly').addEventListener('change', ()=> renderRoomDetail('fd'));
  document.getElementById('fdDate').addEventListener('input', ()=> renderRoomDetail('fd'));
  document.getElementById('fdDate').value = todayStr();
  document.getElementById('cicoFrom').addEventListener('input', renderCico);
  document.getElementById('cicoTo').addEventListener('input', renderCico);
  document.getElementById('cicoFrom').value = todayStr();
  document.getElementById('cicoTo').value = todayStr();
  ['lgFrom','lgTo'].forEach(id=>{
    document.getElementById(id).addEventListener('input', updateLedgersDateReadouts);
  });
  ['lgFrom','lgTo'].forEach(id=>{
    document.getElementById(id).addEventListener('input', renderLedgers);
  });
  document.getElementById('lgFrom').value = todayStr();
  document.getElementById('lgTo').value = todayStr();
  updateLedgersDateReadouts();
  document.getElementById('dlDate').value = todayStr();
  updateDateReadout(document.getElementById('dlDate'), document.getElementById('dlDateReadout'));
  document.getElementById('dlDate').addEventListener('input', e=>{
    updateDateReadout(e.target, document.getElementById('dlDateReadout'));
    renderDayLock();
  });
  document.getElementById('delSearchInput').addEventListener('input', renderDeleteEntityList);
  document.getElementById('auditDate').value = todayStr();
  updateDateReadout(document.getElementById('auditDate'), document.getElementById('auditDateReadout'));
  document.getElementById('auditDate').addEventListener('input', e=>{
    updateDateReadout(e.target, document.getElementById('auditDateReadout'));
    auditPage = 1;
    renderAuditLog();
  });
  document.getElementById('auditPageSize').addEventListener('change', ()=>{
    auditPage = 1;
    renderAuditLog();
  });
  ['input','change'].forEach(evt=>{
    document.getElementById('dNewDate').addEventListener(evt, e=>{
      updateDateReadout(e.target, document.getElementById('dNewDateReadout'));
    });
    document.getElementById('checkInDate').addEventListener(evt, e=>{
      updateDateReadout(e.target, document.getElementById('checkInDateReadout'));
      autoFillExpectedCheckout();
    });
    document.getElementById('checkOutDate').addEventListener(evt, e=>{
      updateDateReadout(e.target, document.getElementById('checkOutDateReadout'));
      checkoutSetByUser = true;
    });
    document.getElementById('actualCheckoutDate').addEventListener(evt, e=>{
      updateDateReadout(e.target, document.getElementById('actualCheckoutDateReadout'));
    });
  });
  renderTodayEntries();
  scheduleKarachiMidnightRollover();
});

let rowCount = 0;

// Expected Checkout defaults to one night after Check-in, but only while
// the guest hasn't actually chosen a checkout date themselves — once they
// type/pick one (or it's loaded from a saved entry that already had one),
// this stops overwriting it even if Check-in changes afterward.
let checkoutSetByUser = false;
function autoFillExpectedCheckout(){
  if(checkoutSetByUser) return;
  const ci = document.getElementById('checkInDate').value;
  if(!ci) return;
  setStayDate('checkOutDate', addDaysToDateStr(ci, 1));
  updateDateReadout(document.getElementById('checkOutDate'), document.getElementById('checkOutDateReadout'));
}

