// ---- Live calculation preview under the Add Payment form ----
function amountInWords(n){
  const fmt = x => (Math.round(x * 100) / 100).toLocaleString();
  if(n >= 10000000) return fmt(n / 10000000) + ' crore';
  if(n >= 100000) return fmt(n / 100000) + ' lakh';
  if(n >= 1000) return fmt(n / 1000) + ' thousand';
  return fmt(n);
}

function updateAddPayPreview(){
  const box = document.getElementById('addPayPreview');
  const entry = getCurrentEntry();
  if(!entry){ box.style.display = 'none'; return; }
  box.style.display = 'grid';
  const t = computeTotals(entry);
  const cash = parseFloat(document.getElementById('dNewCash').value) || 0;
  const acct = parseFloat(document.getElementById('dNewAccount').value) || 0;
  const amount = cash + acct;
  const after = t.due - amount;

  document.getElementById('prevAmount').textContent = amount.toLocaleString();
  document.getElementById('prevAmountWords').textContent = amount > 0 ? '= ' + amountInWords(amount) : '';
  document.getElementById('prevDueNow').textContent = t.due.toLocaleString();

  const afterEl = document.getElementById('prevDueAfter');
  const statusEl = document.getElementById('prevStatus');
  statusEl.className = 'status';
  if(amount === 0){
    afterEl.textContent = t.due.toLocaleString();
    afterEl.style.color = 'inherit';
    statusEl.classList.add('pending');
    statusEl.textContent = '—';
  } else if(after > 0){
    afterEl.textContent = after.toLocaleString();
    afterEl.style.color = 'var(--danger)';
    statusEl.classList.add('partial');
    statusEl.textContent = 'Still due';
  } else if(after === 0){
    afterEl.textContent = '0';
    afterEl.style.color = 'var(--cash)';
    statusEl.classList.add('paid');
    statusEl.textContent = 'Fully paid ✓';
  } else {
    afterEl.textContent = '0';
    afterEl.style.color = 'var(--gold-deep)';
    statusEl.classList.add('pending');
    statusEl.textContent = 'Over by ' + Math.abs(after).toLocaleString() + '!';
  }
}

