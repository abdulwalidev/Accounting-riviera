// ---- Payment tracking ----
let payCount = 0;

// All "which day is this" logic runs on Pakistan Standard Time (Asia/Karachi,
// UTC+5, no DST) — not UTC and not the visiting device's local time zone.
// A plain UTC slice rolls the date over at 5:00 AM PKT instead of midnight;
// this keeps every date boundary (today's entries, filters, exports) tied
// to midnight in Pakistan regardless of where the browser is.
function toKarachiDateStr(input){
  const d = input ? new Date(input) : new Date();
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
}

function todayStr(){
  return toKarachiDateStr();
}

// Room numbers are often typed both with and without their dash ("C-12"
// vs "C12") — every search box strips dashes from both sides before
// matching so either spelling finds the same room, the same way amount
// search already ignores commas ("25000" / "25,000").
function stripDashes(s){
  return String(s == null ? '' : s).replace(/-/g, '');
}

// A tab left open across midnight would otherwise keep showing yesterday
// until something forces a re-render. This times a single refresh for the
// exact moment it turns midnight in Pakistan (no polling/interval drift),
// then re-arms itself for the next one. Only date fields still sitting on
// the stale "today" get bumped forward — a deliberately-picked past date
// (e.g. a custom report range) is left alone.
let lastKnownToday = todayStr();

function msUntilNextKarachiMidnight(){
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 19, 0, 0, 0));
  if(next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

function scheduleKarachiMidnightRollover(){
  setTimeout(()=>{
    handleKarachiMidnightRollover();
    scheduleKarachiMidnightRollover();
  }, msUntilNextKarachiMidnight() + 1000);
}

function handleKarachiMidnightRollover(){
  const newToday = todayStr();
  if(newToday === lastKnownToday) return;
  ['filterFrom','filterTo','lgFrom','lgTo','gsearchDate','dNewDate','checkInDate','rdDate','fdDate','dlDate','auditDate'].forEach(id=>{
    const el = document.getElementById(id);
    if(el && el.value === lastKnownToday) el.value = newToday;
  });
  lastKnownToday = newToday;
  updateFilterDateReadouts();
  updateLedgersDateReadouts();
  const gsearchDateEl = document.getElementById('gsearchDate');
  if(gsearchDateEl) updateDateReadout(gsearchDateEl, document.getElementById('gsearchDateReadout'));
  const dNewDateEl = document.getElementById('dNewDate');
  if(dNewDateEl) updateDateReadout(dNewDateEl, document.getElementById('dNewDateReadout'));
  const checkInDateEl = document.getElementById('checkInDate');
  if(checkInDateEl) updateDateReadout(checkInDateEl, document.getElementById('checkInDateReadout'));
  const rdDateEl = document.getElementById('rdDate');
  if(rdDateEl) updateDateReadout(rdDateEl, document.getElementById('rdDateReadout'));
  const fdDateEl = document.getElementById('fdDate');
  if(fdDateEl) updateDateReadout(fdDateEl, document.getElementById('fdDateReadout'));
  const dlDateEl = document.getElementById('dlDate');
  if(dlDateEl) updateDateReadout(dlDateEl, document.getElementById('dlDateReadout'));
  const auditDateEl = document.getElementById('auditDate');
  if(auditDateEl) updateDateReadout(auditDateEl, document.getElementById('auditDateReadout'));
  const cicoFromEl = document.getElementById('cicoFrom');
  if(cicoFromEl) updateDateReadout(cicoFromEl, document.getElementById('cicoFromReadout'));
  const cicoToEl = document.getElementById('cicoTo');
  if(cicoToEl) updateDateReadout(cicoToEl, document.getElementById('cicoToReadout'));
  if(currentView === 'entry') renderTodayEntries();
  if(currentView === 'reservations') renderReservations();
  if(currentView === 'report') renderReport();
  if(currentView === 'graphs') renderGraphs();
  if(currentView === 'search') renderSearch();
  if(currentView === 'ledgers') renderLedgers();
  if(currentView === 'daylock') renderDayLock();
  if(currentView === 'audit') renderAuditLog();
  if(currentView === 'roomdetail') renderRoomDetail('rd');
  if(currentView === 'dashboard') renderDashboard();
  if(currentView === 'cico') renderCico();
  if(currentView === 'frontdesk') renderFrontDesk();
}

function addPayRow(){
  payCount++;
  const tbody = document.getElementById('payBody');
  const tr = document.createElement('tr');
  tr.classList.add('mode-cash');
  tr.innerHTML = `
    <td class="rmno">${payCount}</td>
    <td><input type="date" class="payDate" value="${todayStr()}"><div class="date-readout payDateReadout">${formatDate(todayStr())}</div></td>
    <td>
      <select class="payType">
        <option value="Reservation">Reservation</option>
        <option value="Check-in">Check-in</option>
        <option value="Due Payment" style="color:var(--muted);">Due Payment</option>
      </select>
    </td>
    <td>
      <select class="payMode" onchange="toggleMode(this)">
        <option value="Cash">Cash</option>
        <option value="Bank Transfer">Bank Transfer</option>
        <option value="Card">Card</option>
      </select>
    </td>
    <td>
      <select class="payBank" disabled>
        <option value="">-</option>
        <option value="Alfalah">Alfalah</option>
        <option value="MCB">MCB</option>
      </select>
    </td>
    <td><input type="text" class="payRemarks" placeholder="Optional note" autocomplete="off"></td>
    <td><input type="number" placeholder="0" class="payCash" min="0" oninput="calcPayRow(this)"></td>
    <td><input type="number" placeholder="0" class="payAccount" min="0" oninput="calcPayRow(this)" disabled></td>
    <td class="rowtotal payTotal cash-amt">0</td>
    <td class="del"><button class="btn danger" onclick="requestDeleteRow(this,'payment')">✕</button></td>
  `;
  tbody.appendChild(tr);
}

function toggleMode(sel){
  const tr = sel.closest('tr');
  const cash = tr.querySelector('.payCash');
  const acct = tr.querySelector('.payAccount');
  const bank = tr.querySelector('.payBank');
  const total = tr.querySelector('.payTotal');
  const mode = sel.value;
  if(mode === 'Cash'){
    cash.disabled = false; acct.disabled = true; acct.value = '';
    bank.disabled = true; bank.value = '';
    tr.classList.remove('mode-bank'); tr.classList.add('mode-cash');
    total.classList.remove('account-amt'); total.classList.add('cash-amt');
  } else {
    // Bank Transfer or Card
    acct.disabled = false; cash.disabled = true; cash.value = '';
    bank.disabled = false;
    tr.classList.remove('mode-cash'); tr.classList.add('mode-bank');
    total.classList.remove('cash-amt'); total.classList.add('account-amt');
  }
  calcPayRow(cash);
}

function calcPayRow(input){
  const tr = input.closest('tr');
  const cash = parseFloat(tr.querySelector('.payCash').value) || 0;
  const acct = parseFloat(tr.querySelector('.payAccount').value) || 0;
  const total = cash + acct;
  tr.querySelector('.payTotal').textContent = total.toLocaleString();
  calcSummary();
}

function deletePayRow(btn){
  btn.closest('tr').remove();
  renumberPay();
  calcSummary();
}

function renumberPay(){
  document.querySelectorAll('#payBody tr').forEach((tr,i)=>{
    tr.querySelector('.rmno').textContent = i+1;
  });
  payCount = document.querySelectorAll('#payBody tr').length;
}

function calcSummary(){
  const bookingTotal = parseFloat(document.getElementById('grandTotal').textContent.replace(/,/g,'')) || 0;
  let paid = 0;
  document.querySelectorAll('#payBody .payTotal').forEach(td=>{
    paid += parseFloat(td.textContent.replace(/,/g,'')) || 0;
  });
  const due = bookingTotal - paid;

  document.getElementById('sumBookingTotal').textContent = bookingTotal.toLocaleString();
  document.getElementById('sumPaid').textContent = paid.toLocaleString();
  document.getElementById('sumDue').textContent = Math.max(due,0).toLocaleString();

  const statusEl = document.getElementById('sumStatus');
  statusEl.classList.remove('paid','pending','partial');
  if(bookingTotal > 0 && due <= 0){
    statusEl.textContent = 'Paid';
    statusEl.classList.add('paid');
  } else if(paid > 0){
    statusEl.textContent = 'Partial';
    statusEl.classList.add('partial');
  } else {
    statusEl.textContent = 'Pending';
    statusEl.classList.add('pending');
  }
}

