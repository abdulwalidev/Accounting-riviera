// ---- Check-in / Check-out ----
function setCicoToday(){
  const t = todayStr();
  document.getElementById('cicoFrom').value = t;
  document.getElementById('cicoTo').value = t;
  updateDateReadout(document.getElementById('cicoFrom'), document.getElementById('cicoFromReadout'));
  updateDateReadout(document.getElementById('cicoTo'), document.getElementById('cicoToReadout'));
  renderCico();
}

function renderCico(){
  const fromEl = document.getElementById('cicoFrom');
  const toEl = document.getElementById('cicoTo');
  if(!fromEl.value && !toEl.value){
    fromEl.value = todayStr();
    toEl.value = todayStr();
  }
  const fromDate = fromEl.value || todayStr();
  const toDate = toEl.value || fromDate;
  updateDateReadout(fromEl, document.getElementById('cicoFromReadout'));
  updateDateReadout(toEl, document.getElementById('cicoToReadout'));

  if(!initialLoadDone){
    ['cicoExpectedCheckins','cicoExpectedCheckouts','cicoActualCheckins','cicoActualCheckouts'].forEach(id=>{
      document.getElementById(id).innerHTML = '<div class="empty-note">' + cloudLoadingNote() + '</div>';
    });
    return;
  }

  const move = computeMovement(fromDate, toDate);
  renderMovementList('cicoExpectedCheckins', move.expectedCheckins);
  renderMovementList('cicoExpectedCheckouts', move.expectedCheckouts);
  renderMovementList('cicoActualCheckins', move.actualCheckins);
  renderMovementList('cicoActualCheckouts', move.actualCheckouts);
}

