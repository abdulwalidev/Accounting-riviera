// ---- Optional extra details (+ Detail button) ----
// A short, fixed list of uncommon one-offs that don't warrant their own
// always-visible field in either skin. Everything from the reference PMS
// that DOES get its own field lives in MN_ENTRY_PANELS below instead
// (Munshi-only) — so nothing appears in both places.
const EXTRA_DETAIL_GROUPS = {
  'General': ['Address', 'Nationality', 'Company Name', 'Profession', 'Emergency No', 'Car No', 'Date of Arrival', 'Date of Departure', 'Extra Remarks']
};
const EXTRA_DETAIL_DATE_KINDS = ['Date of Arrival', 'Date of Departure'];

// ---- Munshi-only dedicated fields (reference PMS's "Add Reservation" panels) ----
// Each field's value round-trips through the SAME entry.extraDetails array
// the + Detail rows use (matched by `kind`) — no schema change, no new
// Supabase column, and an entry saved from Munshi's panels reads back
// correctly even if later opened in Smart mode's + Detail list, or vice
// versa. Room Assignment / Room Rate / Payment-Currency from the reference
// are intentionally left out — they'd just be a second place to enter the
// same number already tracked in the Room / Payment Detail tables below.
const MN_ENTRY_PANELS = [
  { title: 'Guest Details', fields: [
    { id: 'mnGuestName2', kind: 'Guest Name 2', label: 'Guest Name 2', type: 'text' },
    { id: 'mnGuestName3', kind: 'Guest Name 3', label: 'Guest Name 3', type: 'text' },
    { id: 'mnEmail', kind: 'Email', label: 'Email', type: 'text' },
    { id: 'mnNation', kind: 'Nationality', label: 'Nation', type: 'text' },
    { id: 'mnDob', kind: 'Date of Birth', label: 'Date of Birth', type: 'date' },
    { id: 'mnNtn', kind: 'NTN', label: 'NTN', type: 'text' }
  ]},
  { title: 'Address', fields: [
    { id: 'mnAddress', kind: 'Address', label: 'Address', type: 'text' },
    { id: 'mnAddress2', kind: 'Address (cont.)', label: 'Address (cont.)', type: 'text' },
    { id: 'mnCity', kind: 'City', label: 'City', type: 'text' },
    { id: 'mnCountry', kind: 'Country', label: 'Country', type: 'text' }
  ]},
  { title: 'Marketing & Source', fields: [
    { id: 'mnSource', kind: 'Source', label: 'Source', type: 'text' },
    { id: 'mnMarket', kind: 'Market', label: 'Market', type: 'text' },
    { id: 'mnRegion', kind: 'Region', label: 'Region', type: 'text' },
    { id: 'mnIndustry', kind: 'Industry', label: 'Industry', type: 'text' },
    { id: 'mnMeals', kind: 'Meals', label: 'Meals', type: 'text' }
  ]},
  { title: 'Travel Context', fields: [
    { id: 'mnComingFrom', kind: 'Coming From', label: 'Coming From', type: 'text' },
    { id: 'mnNextDestination', kind: 'Next Destination', label: 'Next Destination', type: 'text' },
    { id: 'mnPurpose', kind: 'Purpose', label: 'Purpose', type: 'text' },
    { id: 'mnRefCompany', kind: 'Ref Company', label: 'Ref Company', type: 'text' },
    { id: 'mnMadeBy', kind: 'Reservation Made By', label: 'Reservation Made By', type: 'text' },
    { id: 'mnComplimentary', kind: 'Complimentary', label: 'Complimentary', type: 'text' },
    { id: 'mnNewspaper', kind: 'Newspaper', label: 'Newspaper', type: 'text' }
  ]},
  { title: 'Pick-up', fields: [
    { id: 'mnPickup', kind: 'Pickup', label: 'Pick-up?', type: 'yn' },
    { id: 'mnPickupStation', kind: 'Pick-up Station', label: 'Station', type: 'text' },
    { id: 'mnPickupCarrier', kind: 'Pick-up Carrier', label: 'Carrier', type: 'text' },
    { id: 'mnPickupTime', kind: 'Pick-up Time', label: 'Time', type: 'text' }
  ]},
  { title: 'Drop-off', fields: [
    { id: 'mnDropoff', kind: 'Dropoff', label: 'Drop?', type: 'yn' },
    { id: 'mnDropStation', kind: 'Drop-off Station', label: 'Station', type: 'text' },
    { id: 'mnDropCarrier', kind: 'Drop-off Carrier', label: 'Carrier', type: 'text' },
    { id: 'mnDropTime', kind: 'Drop-off Time', label: 'Time', type: 'text' }
  ]},
  { title: 'Stay Details', fields: [
    { id: 'mnBookingType', kind: 'Booking Type', label: 'Type', type: 'text' },
    { id: 'mnAdults', kind: 'Adults', label: 'Adults', type: 'number' },
    { id: 'mnChildren', kind: 'Children', label: 'Children', type: 'number' },
    { id: 'mnVip', kind: 'VIP', label: 'VIP', type: 'yn' },
    { id: 'mnNoPost', kind: 'No Post', label: 'No Post', type: 'yn' }
  ]},
  { title: 'Bill-to Company (BTC)', fields: [
    { id: 'mnBtcCompany', kind: 'BTC Company', label: 'Company', type: 'text' },
    { id: 'mnBtcId', kind: 'BTC Id', label: 'BTC Id', type: 'text' },
    { id: 'mnBtcComments', kind: 'BTC Comments', label: 'BTC Comments', type: 'textarea' },
    { id: 'mnAdvanceAmount', kind: 'Advance Amount', label: 'Advance Amount', type: 'number' },
    { id: 'mnAdvanceAccount', kind: 'Advance Account', label: 'Advance Account', type: 'text' }
  ]},
  { title: 'Pricing & Rate Plan', fields: [
    { id: 'mnRatePlan', kind: 'Rate Plan', label: 'Rate Plan', type: 'text' },
    { id: 'mnExtraBed', kind: 'Extra Bed', label: 'Extra Bed', type: 'number' },
    { id: 'mnDiscountPct', kind: 'Discount %', label: 'Discount %', type: 'number' },
    { id: 'mnFbCredits', kind: 'F&B Credits', label: 'F&B Credits', type: 'number' },
    { id: 'mnDoNotDisclose', kind: 'Do Not Disclose', label: 'Do Not Disclose', type: 'yn' }
  ]},
  { title: 'Notes', fields: [
    { id: 'mnResvNotes', kind: 'Reservation Notes', label: 'Reservation Notes', type: 'textarea' },
    { id: 'mnCheckinNotes', kind: 'Checkin Notes', label: 'Checkin Notes', type: 'textarea' }
  ]},
  { title: 'Folio Descriptions', fields: [
    { id: 'mnFolio1', kind: 'Folio 1', label: 'Folio 1', type: 'text' },
    { id: 'mnFolio2', kind: 'Folio 2', label: 'Folio 2', type: 'text' },
    { id: 'mnFolio3', kind: 'Folio 3', label: 'Folio 3', type: 'text' }
  ]},
  { title: 'Online & Other', fields: [
    { id: 'mnOnlineId', kind: 'Online ID', label: 'Online ID', type: 'text' },
    { id: 'mnGroupId', kind: 'Group ID', label: 'Group ID', type: 'text' }
  ]}
];

function renderMnEntryPanels(){
  const container = document.getElementById('mnEntryPanels');
  if(!container) return;
  container.innerHTML = MN_ENTRY_PANELS.map(panel=> `
    <div class="panel">
      <h2>${panel.title}</h2>
      <div class="grid">
        ${panel.fields.map(f=>{
          if(f.type === 'textarea') return `<div><label>${f.label}</label><textarea id="${f.id}" rows="2"></textarea></div>`;
          if(f.type === 'yn') return `<div><label>${f.label}</label><select id="${f.id}"><option value="N">N</option><option value="Y">Y</option></select></div>`;
          const inputType = f.type === 'date' ? 'date' : (f.type === 'number' ? 'number' : 'text');
          return `<div><label>${f.label}</label><input type="${inputType}" id="${f.id}" autocomplete="off"></div>`;
        }).join('')}
      </div>
    </div>
  `).join('');
}

function collectMnEntryDetails(){
  const details = [];
  MN_ENTRY_PANELS.forEach(panel=> panel.fields.forEach(f=>{
    const el = document.getElementById(f.id);
    if(!el) return;
    const value = el.value.trim();
    if(!value) return;
    if(f.type === 'yn' && value === 'N') return; // default value — not worth storing
    details.push({ kind: f.kind, value });
  }));
  return details;
}

function fillMnEntryDetails(entry){
  MN_ENTRY_PANELS.forEach(panel=> panel.fields.forEach(f=>{
    const el = document.getElementById(f.id);
    if(!el) return;
    const found = (entry.extraDetails || []).find(d=> d.kind === f.kind);
    el.value = found ? found.value : (f.type === 'yn' ? 'N' : '');
  }));
}

function clearMnEntryFields(){
  MN_ENTRY_PANELS.forEach(panel=> panel.fields.forEach(f=>{
    const el = document.getElementById(f.id);
    if(!el) return;
    el.value = f.type === 'yn' ? 'N' : '';
  }));
}

function addExtraDetailRow(kind, value){
  const row = document.createElement('div');
  row.className = 'extra-detail-row';
  row.innerHTML = `
    <select class="edKind" onchange="onExtraKindChange(this)">
      <option value="">— Select detail —</option>
      ${EXTRA_DETAIL_GROUPS.General.map(k=>`<option value="${k}">${k}</option>`).join('')}
    </select>
    <div class="edValue-wrap">
      <input type="text" class="edValue" placeholder="Enter detail" autocomplete="off">
      <div class="date-readout edValueReadout"></div>
    </div>
    <button class="btn danger" onclick="requestDeleteRow(this,'detail')">✕</button>
  `;
  document.getElementById('extraDetailList').appendChild(row);
  if(kind){
    row.querySelector('.edKind').value = kind;
    onExtraKindChange(row.querySelector('.edKind'));
  }
  if(value) row.querySelector('.edValue').value = value;
  updateDateReadout(row.querySelector('.edValue'), row.querySelector('.edValueReadout'));
  if(!kind) row.querySelector('.edKind').focus();
}

// Date-type details get a date picker instead of a text box
function onExtraKindChange(sel){
  const row = sel.closest('.extra-detail-row');
  const input = row.querySelector('.edValue');
  const isDate = EXTRA_DETAIL_DATE_KINDS.includes(sel.value);
  const wasDate = input.type === 'date';
  if(isDate !== wasDate) input.value = '';
  input.type = isDate ? 'date' : 'text';
  updateDateReadout(input, row.querySelector('.edValueReadout'));
}

// Shows "18 Jul 2026" under a date selector (cleared for non-dates/empty)
function updateDateReadout(input, readoutEl){
  if(!readoutEl) return;
  readoutEl.textContent = (input.type === 'date' && input.value) ? formatDate(input.value) : '';
}

function collectExtraDetails(){
  const rows = document.querySelectorAll('#extraDetailList .extra-detail-row');
  const details = [];
  for(const row of rows){
    const kindSel = row.querySelector('.edKind');
    const valueInput = row.querySelector('.edValue');
    const kind = kindSel.value;
    const value = valueInput.value.trim();
    if(!kind && !value) continue; // untouched row — ignore
    if(!kind){
      showNotice('Please select what kind of detail "' + value + '" is, or remove that detail row.');
      focusError(kindSel);
      return null;
    }
    if(!value){
      showNotice('Please enter the ' + kind + ', or remove that detail row.');
      focusError(valueInput);
      return null;
    }
    details.push({ kind, value });
  }
  return details;
}

function formatExtraDetail(d){
  const isDate = d.kind === 'Date of Arrival' || d.kind === 'Date of Departure';
  return isDate && d.value ? formatDate(d.value) : d.value;
}

// Contact No and Actual Checkout each have their own fixed field on the
// form (not "+ Detail" options) but are still stored inside extraDetails —
// the cloud table already has a JSON column for that array, so this needs
// no schema change. These helpers move them between the fixed fields and
// that array, and keep them out of the generic "+ Detail" list/dropdown.
// Also hide every Munshi-panel kind from Smart's + Detail list — Smart
// mode has no dropdown option for them (its list is General-only), so
// showing them there would render an unselectable row and block Save.
const HIDDEN_DETAIL_KINDS = ['Contact No', 'Actual Checkout', ...MN_ENTRY_PANELS.flatMap(p=> p.fields.map(f=> f.kind))];
function getDetailValue(entry, kind){
  const d = (entry.extraDetails || []).find(d=> d.kind === kind);
  return d ? d.value : '';
}
function visibleExtraDetails(entry){
  return (entry.extraDetails || []).filter(d=> !HIDDEN_DETAIL_KINDS.includes(d.kind));
}

// Auto-inserts dashes as digits are typed (XXXXX-XXXXXXX-X). Strips any
// characters the user typed (dashes in the wrong place included) and
// rebuilds from digits only, so misplaced dashes are simply dropped.
function formatCNIC(el){
  const digits = el.value.replace(/[^0-9]/g, '').slice(0, 13);
  let formatted = digits;
  if(digits.length > 5) formatted = digits.slice(0, 5) + '-' + digits.slice(5);
  if(digits.length > 12) formatted = digits.slice(0, 5) + '-' + digits.slice(5, 12) + '-' + digits.slice(12);
  el.value = formatted;
}

