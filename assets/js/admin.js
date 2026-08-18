/* Qutbi — admin dashboard logic */
(function(){
  const $ = (id)=>document.getElementById(id);
  const TOKEN_KEY = 'qutbi.adminToken';
  const state = { rows: [], filtered: [], token: null };

  document.addEventListener('DOMContentLoaded', init);

  function init(){
    state.token = sessionStorage.getItem(TOKEN_KEY);
    if (state.token) showDashboard();

    $('btnLogin').addEventListener('click', doLogin);
    $('password').addEventListener('keydown', e => { if (e.key==='Enter') doLogin(); });
    $('logoutLink').addEventListener('click', (e)=>{ e.preventDefault(); doLogout(); });

    $('btnRefresh').addEventListener('click', loadRows);
    $('btnClear').addEventListener('click', clearFilters);
    $('btnExport').addEventListener('click', exportCSV);
    $('btnPrintVisible').addEventListener('click', printVisibleTickets);
    document.querySelectorAll('#routeTabs button[data-route]').forEach(btn=>btn.addEventListener('click', ()=>{
      $('fRoute').value = btn.dataset.route;
      document.querySelectorAll('#routeTabs button[data-route]').forEach(tab=>{
        const active = tab === btn;
        tab.classList.toggle('btn-primary', active);
        tab.classList.toggle('btn-outline', !active);
      });
      applyFilters();
    }));
    ['fName','fMobile','fId','fDate','fRoute','fSeat','fSleeper','fPay','fStatus'].forEach(id=>{
      $(id).addEventListener('input', applyFilters);
      $(id).addEventListener('change', applyFilters);
    });

    $('editClose').addEventListener('click', ()=>$('editModal').classList.remove('show'));
    $('editModal').addEventListener('click', (e)=>{ if (e.target.id==='editModal') $('editModal').classList.remove('show'); });
  }

  async function doLogin(){
    const pwd = $('password').value;
    if (!pwd){ QT.toast('Enter password','err'); return; }
    QT.overlay(true, 'Signing in…');
    try {
      const res = await QT.api('login', { password: pwd });
      if (!res.ok) throw new Error(res.error||'Login failed');
      state.token = res.token;
      sessionStorage.setItem(TOKEN_KEY, res.token);
      $('loginErr').style.display = 'none';
      $('password').value = '';
      showDashboard();
    } catch(err){
      $('loginErr').style.display = 'block';
      QT.toast(QT.friendlyError(err.message), 'err');
    } finally { QT.overlay(false); }
  }

  function doLogout(){
    sessionStorage.removeItem(TOKEN_KEY);
    state.token = null;
    $('dashboard').style.display = 'none';
    $('loginGate').style.display = '';
    $('logoutLink').style.display = 'none';
  }

  function showDashboard(){
    $('loginGate').style.display = 'none';
    $('dashboard').style.display = '';
    $('logoutLink').style.display = '';
    loadRows();
  }

  async function loadRows(){
    QT.overlay(true, 'Loading bookings…');
    try {
      const res = await QT.api('listBookings', { token: state.token });
      if (!res.ok){
        if (res.error === 'AUTH_REQUIRED'){ doLogout(); throw new Error('Session expired'); }
        throw new Error(QT.friendlyError(res.error));
      }
      state.rows = res.rows || [];
      applyFilters();
      updateStats();
    } catch(err){
      QT.toast(err.message||'Failed to load', 'err');
    } finally { QT.overlay(false); }
  }

  function clearFilters(){
    ['fName','fMobile','fId','fDate','fRoute','fSeat','fSleeper','fPay','fStatus'].forEach(id=>$(id).value='');
    applyFilters();
  }

  function applyFilters(){
    const name  = $('fName').value.trim().toLowerCase();
    const mob   = $('fMobile').value.trim();
    const id    = $('fId').value.trim().toLowerCase();
    const date  = $('fDate').value;
    const route = $('fRoute').value;
    const seat  = $('fSeat').value.trim().toLowerCase();
    const sleep = $('fSleeper').value;
    const pay   = $('fPay').value;
    const stat  = $('fStatus').value;
    document.querySelectorAll('#routeTabs button[data-route]').forEach(tab=>{
      const active = tab.dataset.route === route;
      tab.classList.toggle('btn-primary', active);
      tab.classList.toggle('btn-outline', !active);
    });

    state.filtered = state.rows.filter(r=>{
      if (name  && !(r.passengerName||'').toLowerCase().includes(name)) return false;
      if (mob   && !(r.mobile||'').includes(mob)) return false;
      if (id    && !(r.bookingId||'').toLowerCase().includes(id)) return false;
      if (date  && r.travelDate !== date) return false;
      if (route && r.route !== route) return false;
      if (seat  && !(r.seatNumber||'').toLowerCase().includes(seat)) return false;
      if (sleep && r.sleeperType !== sleep) return false;
      if (pay   && r.paymentStatus !== pay) return false;
      if (stat  && r.bookingStatus !== stat) return false;
      return true;
    });
    renderTable();
  }

  function renderTable(){
    const tbody = $('tbody');
    if (state.filtered.length === 0){
      tbody.innerHTML = '<tr><td colspan="14" style="text-align:center;color:#6b7280;padding:26px">No bookings found.</td></tr>';
      $('rowCount').textContent = '0 rows';
      return;
    }
    tbody.innerHTML = state.filtered.map(r=>{
      const cancelled = r.bookingStatus === 'Cancelled';
      const cls = cancelled ? 'row-cancelled' : '';
      const waMsg = QT.bookingWhatsappMessage(Object.assign({paymentStatus:r.paymentStatus}, r));
      const wa = QT.whatsappLink(r.mobile, waMsg);
      const actions = `
        <button class="btn btn-ghost" data-act="view" data-id="${r.bookingId}" style="padding:6px 10px;font-size:12px">View/Edit</button>
        <a class="btn btn-outline" href="${wa}" target="_blank" rel="noopener" style="padding:6px 10px;font-size:12px">WhatsApp</a>
        ${cancelled
          ? `<button class="btn btn-outline" data-act="restore" data-id="${r.bookingId}" style="padding:6px 10px;font-size:12px">Restore</button>`
          : `<button class="btn btn-danger" data-act="cancel" data-id="${r.bookingId}" style="padding:6px 10px;font-size:12px">Cancel</button>`
        }
      `;
      return `<tr class="${cls}">
        <td style="font-family:'JetBrains Mono',monospace;font-size:12px">${escapeHTML(r.bookingId)}</td>
        <td>${escapeHTML(r.passengerName)}</td>
        <td>${escapeHTML(r.mobile)}</td>
        <td>${escapeHTML(r.routeLabel||'Nashik to Surat')}</td>
        <td>${QT.fmtDate(r.travelDate)}</td>
        <td>${escapeHTML(r.seatNumber)}</td>
        <td>${escapeHTML(r.sleeperType)}</td>
        <td>${escapeHTML(r.vehicleType||'—')}</td>
        <td>${QT.fmtMoney(r.totalAmount)}</td>
        <td>${QT.fmtMoney(r.amountPaid)}</td>
        <td>${QT.fmtMoney(r.remainingAmount)}</td>
        <td>${QT.statusPill(r.paymentStatus)}</td>
        <td>${QT.statusPill(r.bookingStatus)}</td>
        <td>${actions}</td>
      </tr>`;
    }).join('');
    $('rowCount').textContent = state.filtered.length + ' row(s)';

    tbody.querySelectorAll('button[data-act]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const id = btn.dataset.id;
        const act = btn.dataset.act;
        const row = state.rows.find(r=>r.bookingId===id);
        if (!row) return;
        if (act==='view') openEditModal(row);
        else if (act==='cancel') cancelRow(row);
        else if (act==='restore') restoreRow(row);
      });
    });
  }

  function updateStats(){
    const rows = state.rows;
    const today = QT.todayISO();
    const confirmed = rows.filter(r=>r.bookingStatus !== 'Cancelled');
    const cancelled = rows.filter(r=>r.bookingStatus === 'Cancelled');

    $('s-total').textContent = rows.length;
    $('s-total-sub').textContent = confirmed.length + ' confirmed · ' + cancelled.length + ' cancelled';
    $('s-cancelled').textContent = cancelled.length;

    const todayBookings = confirmed.filter(r=>{
      const ts = String(r.timestamp||'').slice(0,10);
      return ts === today;
    });
    $('s-today').textContent = todayBookings.length;

    const upcoming = confirmed.filter(r=>r.travelDate && r.travelDate >= today);
    $('s-upcoming').textContent = upcoming.length;

    // For seat stats we take upcoming trips (bus has 36 seats per date)
    const totalSeats = 36;
    const nextTrips = uniqueTrips(upcoming);
    const bookedForNext = upcoming.length;
    const availableForNext = Math.max(0, totalSeats * nextTrips.length - bookedForNext);
    $('s-booked-seats').textContent = bookedForNext;
    $('s-avail-seats').textContent  = 'Available across ' + nextTrips.length + ' trip(s): ' + availableForNext;

    const total = confirmed.reduce((s,r)=>s+Number(r.totalAmount||0),0);
    const paid  = confirmed.reduce((s,r)=>s+Number(r.amountPaid||0),0);
    const rem   = confirmed.reduce((s,r)=>s+Number(r.remainingAmount||0),0);
    $('s-amount').textContent = QT.fmtMoney(total);
    $('s-received').textContent = QT.fmtMoney(paid);
    $('s-remaining').textContent = QT.fmtMoney(rem);
  }

  function uniqueTrips(rows){
    const set = new Set();
    rows.forEach(r=>{ if (r.travelDate) set.add((r.route||'NASHIK_SURAT')+'|'+r.travelDate); });
    return Array.from(set);
  }

  function openEditModal(r){
    $('editTitle').textContent = 'Booking ' + r.bookingId;
    $('editBody').innerHTML = `
      <div class="form-grid" style="margin-top:10px">
        <div class="field"><label>Passenger name</label><input id="e-name" value="${escapeAttr(r.passengerName)}"></div>
        <div class="field"><label>Mobile</label><input id="e-mobile" maxlength="10" value="${escapeAttr(r.mobile)}"></div>
        <div class="field"><label>Route</label><input value="${escapeAttr(r.routeLabel||'Nashik to Surat')}" readonly></div>
        <div class="field"><label>Travel date</label><input type="date" id="e-date" value="${r.travelDate||''}"></div>
        <div class="field"><label>Seat number</label><input id="e-seat" value="${escapeAttr(r.seatNumber)}"></div>
        <div class="field"><label>Sleeper type</label>
          <select id="e-type"><option${r.sleeperType==='Lower'?' selected':''}>Lower</option><option${r.sleeperType==='Upper'?' selected':''}>Upper</option></select>
        </div>
        <div class="field"><label>Vehicle / transport</label>
          <select id="e-vehicle">
            ${['4-seater Car','6-seater Car','7-seater Car','10-seater Bus','15-seater Bus','20-seater Bus','25-seater Bus','30-seater Bus','35-seater Bus','40-seater Bus','45-seater Bus','36 Sleeper Bus'].map(v=>`<option${r.vehicleType===v?' selected':''}>${v}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Boarding</label><input id="e-board" value="${escapeAttr(r.boardingPoint)}"></div>
        <div class="field"><label>Dropping</label><input id="e-drop" value="${escapeAttr(r.droppingPoint)}"></div>
        <div class="field"><label>Total amount</label><input type="number" id="e-total" value="${r.totalAmount}"></div>
        <div class="field"><label>Amount paid</label><input type="number" id="e-paid" value="${r.amountPaid}"></div>
        <div class="field"><label>Payment method</label>
          <select id="e-method">
            ${['Cash','UPI','Bank Transfer','Other'].map(m=>`<option${r.paymentMethod===m?' selected':''}>${m}</option>`).join('')}
          </select>
        </div>
        <div class="field" style="grid-column:1/-1"><label>Notes</label><textarea id="e-notes" rows="2">${escapeHTML(r.notes||'')}</textarea></div>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" id="btnSave">Save changes</button>
        <button class="btn btn-gold" id="btnMarkPaid">Mark fully paid</button>
        <button class="btn btn-outline" id="btnPrint">🖨️ Print ticket</button>
        <button class="btn btn-outline" id="btnDownload">⬇️ Download</button>
        ${r.bookingStatus==='Cancelled'
          ? '<button class="btn btn-outline" id="btnRestore">Restore</button>'
          : '<button class="btn btn-danger" id="btnCancel">Cancel booking</button>'}
      </div>
    `;
    $('editModal').classList.add('show');

    $('e-mobile').addEventListener('input', e=>{ e.target.value = e.target.value.replace(/\D/g,'').slice(0,10); });

    $('btnSave').addEventListener('click', ()=>saveEdits(r));
    $('btnMarkPaid').addEventListener('click', ()=>{
      $('e-paid').value = $('e-total').value;
      saveEdits(r);
    });
    $('btnPrint').addEventListener('click', ()=>QT.printTicket(r));
    $('btnDownload').addEventListener('click', ()=>QT.downloadTicket(r));
    if ($('btnCancel'))  $('btnCancel').addEventListener('click', ()=>cancelRow(r));
    if ($('btnRestore')) $('btnRestore').addEventListener('click', ()=>restoreRow(r));
  }

  function printVisibleTickets(){
    if (!state.filtered.length) return QT.toast('No tickets to print for this route.','err');
    const routeName = $('fRoute').selectedOptions[0].textContent;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return QT.toast('Please allow the print window.','err');
    const tickets = state.filtered.map(r => {
      const ticket = Object.assign({}, r, {
        passengers:[{ passengerName:r.passengerName, seatNumber:r.seatNumber, seatLabel:r.seatNumber }]
      });
      return '<section class="ticket-page">' + QT.ticketHTML(ticket) + '</section>';
    }).join('');
    win.document.write('<!doctype html><html><head><title>'+escapeHTML(routeName)+' tickets</title><style>body{font-family:Arial,sans-serif;margin:20px}.ticket-page{break-after:page;margin-bottom:28px}.ticket-page:last-child{break-after:auto}@media print{body{margin:0}}</style></head><body>'+tickets+'<script>window.onload=function(){window.print()}<\/script></body></html>');
    win.document.close();
  }

  async function saveEdits(r){
    const patch = {
      passengerName: $('e-name').value.trim(),
      mobile:        $('e-mobile').value.trim(),
      travelDate:    $('e-date').value,
      seatNumber:    $('e-seat').value.trim(),
      sleeperType:   $('e-type').value,
      vehicleType:   $('e-vehicle').value,
      boardingPoint: $('e-board').value.trim(),
      droppingPoint: $('e-drop').value.trim(),
      totalAmount:   Number($('e-total').value||0),
      amountPaid:    Number($('e-paid').value||0),
      paymentMethod: $('e-method').value,
      notes:         $('e-notes').value.trim()
    };
    // Client validation
    if (!QT.validName(patch.passengerName)) return QT.toast('Enter passenger name','err');
    if (!QT.validMobile(patch.mobile)) return QT.toast('Enter valid 10-digit mobile','err');
    if (!patch.travelDate) return QT.toast('Choose travel date','err');
    if (!patch.seatNumber) return QT.toast('Enter seat','err');
    if (patch.amountPaid > patch.totalAmount) return QT.toast('Paid cannot exceed total','err');

    QT.overlay(true, 'Saving…');
    try {
      const res = await QT.api('updateBooking', { token: state.token, bookingId: r.bookingId, patch: patch });
      if (!res.ok) throw new Error(QT.friendlyError(res.error));
      QT.toast('Saved', 'ok');
      $('editModal').classList.remove('show');
      await loadRows();
    } catch(err){
      QT.toast(err.message||'Save failed', 'err');
    } finally { QT.overlay(false); }
  }

  async function cancelRow(r){
    if (!confirm('Cancel booking '+r.bookingId+'? The seat will be released for '+r.travelDate+'.')) return;
    QT.overlay(true, 'Cancelling…');
    try {
      const res = await QT.api('cancelBooking', { token: state.token, bookingId: r.bookingId });
      if (!res.ok) throw new Error(QT.friendlyError(res.error));
      QT.toast('Booking cancelled', 'ok');
      $('editModal').classList.remove('show');
      await loadRows();
    } catch(err){ QT.toast(err.message,'err'); }
    finally { QT.overlay(false); }
  }

  async function restoreRow(r){
    QT.overlay(true, 'Restoring…');
    try {
      const res = await QT.api('restoreBooking', { token: state.token, bookingId: r.bookingId });
      if (!res.ok) throw new Error(QT.friendlyError(res.error));
      QT.toast('Booking restored', 'ok');
      $('editModal').classList.remove('show');
      await loadRows();
    } catch(err){ QT.toast(err.message,'err'); }
    finally { QT.overlay(false); }
  }

  function exportCSV(){
    if (!state.filtered.length){ QT.toast('Nothing to export','warn'); return; }
    const headers = ['Timestamp','Booking ID','Passenger Name','Mobile','Route','Travel Date','Seat','Sleeper Type',
      'Boarding','Dropping','Vehicle Type','Total','Paid','Remaining','Payment Method','Payment Status','Booking Status','Notes','Booked By'];
    const csv = [headers.join(',')];
    state.filtered.forEach(r=>{
      csv.push([
        r.timestamp, r.bookingId, r.passengerName, r.mobile, r.routeLabel, r.travelDate, r.seatNumber, r.sleeperType,
        r.boardingPoint, r.droppingPoint, r.vehicleType, r.totalAmount, r.amountPaid, r.remainingAmount,
        r.paymentMethod, r.paymentStatus, r.bookingStatus, r.notes, r.bookedBy
      ].map(csvCell).join(','));
    });
    const blob = new Blob([csv.join('\n')], { type:'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'qutbi-bookings-'+QT.todayISO()+'.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
  }
  function csvCell(v){
    const s = String(v==null?'':v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
    return s;
  }

  function escapeHTML(s){ return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function escapeAttr(s){ return escapeHTML(s).replace(/`/g,'&#96;'); }
})();
