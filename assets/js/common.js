/* Qutbi — shared helpers */

(function(){
  const C = window.CONFIG || {};

  // ---- API ----
  async function api(action, payload){
    const url = C.APPS_SCRIPT_URL;
    if (!url || url.indexOf('REPLACE_ME') >= 0) {
      throw new Error('Apps Script URL is not configured. Edit assets/js/config.js.');
    }
    const body = Object.assign({ action: action, secret: C.API_SECRET }, payload || {});
    // Use text/plain to avoid CORS preflight against Apps Script
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow'
    });
    if (!res.ok) throw new Error('Network error: HTTP ' + res.status);
    let data;
    try { data = await res.json(); }
    catch(e){ throw new Error('Bad response from server'); }
    return data;
  }

  // ---- Bus layout ----
  // 36 seats: L1..L18 lower, U1..U18 upper. 6 rows × 3 berths per row per deck.
  function generateSeats(deck){
    const prefix = deck === 'Upper' ? 'U' : 'L';
    const count = deck === 'Upper' ? (C.BUS && C.BUS.upperCount || 18) : (C.BUS && C.BUS.lowerCount || 18);
    const list = [];
    for (let i=1; i<=count; i++){
      list.push({ id: prefix + i, num: i, deck: deck });
    }
    return list;
  }

  // ---- Validation ----
  function validMobile(m){ return /^[6-9]\d{9}$/.test(String(m||'').trim()); }
  function validName(n){ return String(n||'').trim().length >= 2; }
  function isFutureOrToday(dateStr){
    if (!dateStr) return false;
    const d = new Date(dateStr+'T00:00:00');
    if (isNaN(d.getTime())) return false;
    const today = new Date(); today.setHours(0,0,0,0);
    return d.getTime() >= today.getTime();
  }

  // ---- Formatting ----
  function fmtMoney(n){
    const v = Number(n||0);
    return '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }
  function fmtDate(s){
    if (!s) return '';
    const d = new Date(s.length===10 ? s+'T00:00:00' : s);
    if (isNaN(d.getTime())) return String(s);
    return d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
  }
  function todayISO(){
    const d = new Date();
    return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);
  }
  function paymentStatusFor(total, paid){
    total = Number(total||0); paid = Number(paid||0);
    if (paid <= 0) return 'Unpaid';
    if (paid >= total) return 'Fully Paid';
    return 'Partially Paid';
  }
  function statusPill(status){
    const map = {
      'Fully Paid':'ok','Partially Paid':'warn','Unpaid':'err',
      'Confirmed':'ok','Cancelled':'err','Pending':'warn'
    };
    return '<span class="pill '+(map[status]||'mut')+'">'+status+'</span>';
  }

  // ---- UI helpers ----
  function toast(msg, kind){
    let wrap = document.querySelector('.toast-wrap');
    if (!wrap){ wrap = document.createElement('div'); wrap.className='toast-wrap'; document.body.appendChild(wrap); }
    const t = document.createElement('div');
    t.className = 'toast ' + (kind||'');
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(()=>{ t.style.opacity='0'; t.style.transition='opacity .3s'; setTimeout(()=>t.remove(),300); }, 3200);
  }
  function overlay(show, text){
    let o = document.getElementById('qutbi-overlay');
    if (!o){
      o = document.createElement('div'); o.id='qutbi-overlay'; o.className='overlay';
      o.innerHTML = '<div class="box"><div class="spinner" style="border-color:rgba(11,37,69,.2);border-top-color:var(--navy)"></div><span id="qutbi-overlay-text">Please wait...</span></div>';
      document.body.appendChild(o);
    }
    if (show){ o.classList.add('show'); document.getElementById('qutbi-overlay-text').textContent = text || 'Please wait...'; }
    else o.classList.remove('show');
  }

  function friendlyError(code){
    const map = {
      'BAD_SECRET':'Backend rejected the request (bad API secret).',
      'BAD_PASSWORD':'Wrong password.',
      'AUTH_REQUIRED':'Session expired. Please log in again.',
      'SEAT_TAKEN':'This seat was just taken by someone else. Please pick another.',
      'BAD_ROUTE':'Choose a valid route.',
      'BAD_ROUTE_POINTS':'The boarding or dropping point does not match the selected route.',
      'BAD_BOARDING':'Choose Ammar Nagar, Nurai Nagar, or Sefi Nagar.',
      'DUPLICATE_SEAT':'The same seat was selected more than once.',
      'BAD_MOBILE':'Enter a valid 10-digit Indian mobile number.',
      'BAD_DATE':'Choose a valid travel date.',
      'BAD_NAME':'Passenger name is required.',
      'BAD_SEAT':'Please select a seat.',
      'BAD_TYPE':'Please pick sleeper type.',
      'BAD_TOTAL':'Total amount is invalid.',
      'BAD_PAID':'Amount paid is invalid.',
      'PAID_EXCEEDS_TOTAL':'Amount paid cannot be more than total.',
      'BAD_METHOD':'Choose a valid payment method.',
      'NOT_FOUND':'Booking not found.',
      'MISSING_ID':'Missing booking ID.',
      'MISSING_DATE':'Missing travel date.',
      'UNKNOWN_ACTION':'Unknown API action.'
    };
    return map[code] || code || 'Something went wrong.';
  }

  // ---- WhatsApp / Print ----
  function whatsappLink(mobile, message){
    const cc = (C.BRAND && C.BRAND.whatsappCountryCode) || '91';
    const clean = String(mobile||'').replace(/\D/g,'');
    return 'https://wa.me/'+cc+clean+'?text='+encodeURIComponent(message||'');
  }
  function bookingWhatsappMessage(b){
    const passengerLines = Array.isArray(b.passengers)
      ? b.passengers.map(p => p.seatNumber + ' — ' + p.passengerName).join('\n')
      : ('Passenger: ' + b.passengerName + '\nSeat: ' + b.seatNumber + ' (' + b.sleeperType + ' Sleeper)');
    return [
      'Qutbi Tours & Holidays — Booking Confirmed',
      'Booking ID: ' + b.bookingId,
      (b.routeLabel ? ('Route: ' + b.routeLabel) : ''),
      'Travel Date: ' + fmtDate(b.travelDate),
      'Passengers / Seats:\n' + passengerLines,
      (b.boardingPoint ? ('Boarding: ' + b.boardingPoint) : ''),
      (b.droppingPoint ? ('Dropping: ' + b.droppingPoint) : ''),
      'Total: ' + fmtMoney(b.totalAmount),
      'Paid: ' + fmtMoney(b.amountPaid),
      'Balance: ' + fmtMoney(b.remainingAmount),
      'Status: ' + (b.paymentStatus || paymentStatusFor(b.totalAmount, b.amountPaid))
    ].filter(Boolean).join('\n');
  }

  function ticketHTML(b){
    const passengerHTML = Array.isArray(b.passengers)
      ? b.passengers.map(p => '<div>' + safe_(p.seatNumber) + ' — ' + safe_(p.passengerName) + ' (' + safe_(p.sleeperType) + ')</div>').join('')
      : safe_(b.passengerName || '') + ' — ' + safe_(b.seatNumber || '');
    return `
      <div class="ticket">
        <div class="ticket-header">
          <h3>Qutbi Tours &amp; Holidays</h3>
          <div class="id">${b.bookingId||''}</div>
        </div>
        <div class="ticket-grid">
          ${b.routeLabel ? `<div><div class="k">Route</div><div class="v">${safe_(b.routeLabel)}</div></div>` : ''}
          <div><div class="k">Mobile</div><div class="v">${b.mobile||''}</div></div>
          <div><div class="k">Travel Date</div><div class="v">${fmtDate(b.travelDate)}</div></div>
          <div style="grid-column:1/-1"><div class="k">Passengers / Seats</div><div class="v">${passengerHTML}</div></div>
          <div><div class="k">Boarding</div><div class="v">${b.boardingPoint||'—'}</div></div>
          <div><div class="k">Dropping</div><div class="v">${b.droppingPoint||'—'}</div></div>
          <div><div class="k">Total</div><div class="v">${fmtMoney(b.totalAmount)}</div></div>
          <div><div class="k">Paid</div><div class="v">${fmtMoney(b.amountPaid)}</div></div>
          <div><div class="k">Balance</div><div class="v">${fmtMoney(b.remainingAmount)}</div></div>
          <div><div class="k">Payment</div><div class="v">${b.paymentMethod||''} — ${b.paymentStatus||paymentStatusFor(b.totalAmount,b.amountPaid)}</div></div>
        </div>
        <p style="margin-top:14px;font-size:12px;color:#6b7280;text-align:center">
          Please carry a valid ID. Report at boarding point 15 minutes early. Safe travels!
        </p>
      </div>`;
  }

  function printTicket(b){
    const w = window.open('', '_blank', 'width=720,height=800');
    if (!w){ toast('Popup blocked. Allow popups to print.', 'err'); return; }
    w.document.write(`<!doctype html><html><head><title>Ticket ${b.bookingId}</title>
      <link rel="stylesheet" href="${location.origin}${location.pathname.replace(/[^/]*$/,'')}assets/css/styles.css">
      </head><body><div class="container">${ticketHTML(b)}
      <p style="text-align:center;margin-top:20px"><button onclick="window.print()" class="btn btn-primary">Print</button></p>
      </div></body></html>`);
    w.document.close();
  }

  function downloadTicket(b){
    const passengerHTML = Array.isArray(b.passengers)
      ? b.passengers.map(p => '<div>' + safe_(p.seatNumber) + ' — ' + safe_(p.passengerName) + ' (' + safe_(p.sleeperType) + ')</div>').join('')
      : safe_(b.passengerName || '') + ' — ' + safe_(b.seatNumber || '');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Ticket ${b.bookingId}</title>
      <style>
      body{font-family:Arial,sans-serif;padding:20px;color:#1a2233}
      .ticket{border:2px solid #0B2545;border-radius:14px;padding:18px;max-width:600px;margin:auto}
      .hd{display:flex;justify-content:space-between;border-bottom:2px dashed #0B2545;padding-bottom:8px;margin-bottom:10px}
      .hd h3{margin:0;color:#0B2545}
      .id{background:#0B2545;color:#fff;padding:4px 10px;border-radius:6px;font-size:12px}
      .g{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .k{color:#6b7280;font-size:12px}
      .v{font-weight:600;margin-bottom:6px}
      </style></head><body>
      <div class="ticket">
        <div class="hd"><h3>Qutbi Tours & Holidays</h3><div class="id">${b.bookingId}</div></div>
        <div class="g">
          ${b.routeLabel ? `<div><div class="k">Route</div><div class="v">${safe_(b.routeLabel)}</div></div>` : ''}
          <div><div class="k">Mobile</div><div class="v">${b.mobile||''}</div></div>
          <div><div class="k">Travel Date</div><div class="v">${fmtDate(b.travelDate)}</div></div>
          <div style="grid-column:1/-1"><div class="k">Passengers / Seats</div><div class="v">${passengerHTML}</div></div>
          <div><div class="k">Boarding</div><div class="v">${b.boardingPoint||'-'}</div></div>
          <div><div class="k">Dropping</div><div class="v">${b.droppingPoint||'-'}</div></div>
          <div><div class="k">Total</div><div class="v">₹${Number(b.totalAmount||0).toLocaleString('en-IN')}</div></div>
          <div><div class="k">Paid</div><div class="v">₹${Number(b.amountPaid||0).toLocaleString('en-IN')}</div></div>
          <div><div class="k">Balance</div><div class="v">₹${Number(b.remainingAmount||0).toLocaleString('en-IN')}</div></div>
          <div><div class="k">Status</div><div class="v">${b.paymentStatus||''}</div></div>
        </div>
      </div></body></html>`;
    const blob = new Blob([html], { type:'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'ticket-'+b.bookingId+'.html';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
  }

  function safe_(s){
    return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // Expose
  window.QT = {
    api, generateSeats,
    validMobile, validName, isFutureOrToday,
    fmtMoney, fmtDate, todayISO, paymentStatusFor, statusPill,
    toast, overlay, friendlyError,
    whatsappLink, bookingWhatsappMessage,
    printTicket, downloadTicket, ticketHTML
  };
})();
