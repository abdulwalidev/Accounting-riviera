// ---- Check Availability: month selector -> day grid -> Room Detail ----
const AVAIL_MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
let availYear = new Date().getFullYear();

function openAvailModal(){
  availYear = new Date().getFullYear();
  renderAvailMonths();
  document.getElementById('availModalBackdrop').classList.add('active');
}

function closeAvailModal(){
  document.getElementById('availModalBackdrop').classList.remove('active');
}

function renderAvailMonths(){
  document.getElementById('availModalTitle').textContent = 'Check Availability';
  document.getElementById('availModalSub').textContent = 'Pick a month, then a day, to see that day\'s room detail.';
  const months = AVAIL_MONTH_NAMES.map((name, i)=>
    `<div class="avail-month-btn" onclick="renderAvailDays(${availYear}, ${i})">${name}</div>`
  ).join('');
  document.getElementById('availModalBody').innerHTML = `
    <div class="avail-year-nav">
      <button type="button" onclick="availYear--; renderAvailMonths();">&lsaquo;</button>
      <span>${availYear}</span>
      <button type="button" onclick="availYear++; renderAvailMonths();">&rsaquo;</button>
    </div>
    <div class="avail-months">${months}</div>`;
}

function renderAvailDays(year, month){
  document.getElementById('availModalTitle').textContent = AVAIL_MONTH_NAMES[month] + ' ' + year;
  document.getElementById('availModalSub').textContent = 'Click a day to see that day\'s room detail.';
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayIso = todayStr();
  const emptyBoxes = Array.from({length: firstDow}, ()=> '<div class="avail-day-box avail-day-empty"></div>').join('');
  const dayBoxes = Array.from({length: daysInMonth}, (_, i)=>{
    const day = i + 1;
    const iso = year + '-' + String(month + 1).padStart(2,'0') + '-' + String(day).padStart(2,'0');
    return `<div class="avail-day-box${iso === todayIso ? ' is-today' : ''}" onclick="selectAvailDay('${iso}')">${day}</div>`;
  }).join('');
  document.getElementById('availModalBody').innerHTML = `
    <button type="button" class="avail-back" onclick="renderAvailMonths()">&larr; Back to months</button>
    <div class="avail-dow"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div>
    <div class="avail-days">${emptyBoxes}${dayBoxes}</div>`;
}

function selectAvailDay(iso){
  closeAvailModal();
  document.getElementById('rdDate').value = iso;
  showView('roomdetail');
}

