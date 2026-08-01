// ---- Export current report (respects active filters) ----
function exportReportExcel(){
  const { rows } = getFilteredReportRows();
  if(rows.length === 0){ showNotice('No payments match the current filters.'); return; }

  const data = rows
    .slice()
    .sort((a,b)=> b.date.localeCompare(a.date))
    .map(r=>({
      'Date': formatDate(r.date),
      'Guest': r.guest,
      'Father Name': r.father,
      'CNIC': r.cnic,
      'Room No(s)': r.roomNos,
      'Type': r.type,
      'Mode': r.mode,
      'Bank': r.bank || '-',
      'Remarks': r.remarks || '',
      'Taken By': r.by || '',
      'Cash': r.cash,
      'Account': r.account,
      'Total': r.total
    }));

  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [
    {wch:12},{wch:20},{wch:20},{wch:16},
    {wch:14},{wch:12},{wch:14},{wch:12},{wch:22},{wch:18},{wch:12},{wch:12},{wch:12}
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Payment Report');
  XLSX.writeFile(wb, `payment-report-${todayStr()}.xlsx`);
}

function openExportModal(){
  const { rows } = getFilteredReportRows();
  if(rows.length === 0){ showNotice('No payments match the current filters.'); return; }
  document.getElementById('exportModalBackdrop').classList.add('active');
}

function closeExportModal(){
  document.getElementById('exportModalBackdrop').classList.remove('active');
}

function printReport(){
  const { rows } = getFilteredReportRows();
  if(rows.length === 0){ showNotice('No payments match the current filters.'); return; }
  window.print();
}

