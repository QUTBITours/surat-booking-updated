/* Qutbi — route-aware multi-seat booking flow */
(function(){
  const $ = (id) => document.getElementById(id);
  const state = {
    step: 1,
    deck: null,
    seats: [],
    passengerNames: {},
    availability: null,
    submitted: false,
    lastBooking: null
  };

  document.addEventListener('DOMContentLoaded', init);

  function init(){
    $('year').textContent = new Date().getFullYear();
    $('travelDate').value = QT.todayISO();
    $('travelDate').min = QT.todayISO();

    $('route').addEventListener('change', onRouteChange);
    ['totalAmount','amountPaid'].forEach(id => $(id).addEventListener('input', updateMoney));
    $('mobile').addEventListener('input', e => {
      e.target.value = e.target.value.replace(/\D/g,'').slice(0,10);
    });

    $('btn-to-step-2').addEventListener('click', goToStep2);
    $('btn-back-1').addEventListener('click', () => showStep(1));
    $('btn-lower').addEventListener('click', () => selectDeck('Lower'));
    $('btn-upper').addEventListener('click', () => selectDeck('Upper'));
    $('btn-to-step-3').addEventListener('click', goToStep3);
    $('btn-edit').addEventListener('click', () => showStep(1));
    $('btn-confirm').addEventListener('click', confirmBooking);
    $('btn-print').addEventListener('click', () => state.lastBooking && QT.printTicket(state.lastBooking));
    $('btn-download').addEventListener('click', () => state.lastBooking && QT.downloadTicket(state.lastBooking));
    $('btn-new').addEventListener('click', () => { resetForm(); showStep(1); });

    onRouteChange();
    updateMoney();
  }

  function onRouteChange(){
    const indore = $('route').value === 'INDORE_SURAT';
    $('f-nagar').style.display = indore ? '' : 'none';
    if (!indore) {
      $('boardingNagar').value = '';
      $('f-nagar').classList.remove('invalid');
    }
    clearSeatSelection();
  }

  function routeLabel(route){
    const labels = {
      NASHIK_SURAT: 'Nashik to Surat',
      INDORE_SURAT: 'Indore to Surat',
      SURAT_NASHIK: 'Surat to Nashik',
      SURAT_INDORE: 'Surat to Indore'
    };
    return labels[route] || '';
  }

  function routePoints(route){
    if (route === 'INDORE_SURAT') return { boarding: $('boardingNagar').value, dropping: 'Surat' };
    if (route === 'SURAT_NASHIK') return { boarding: 'Surat', dropping: 'Nashik' };
    if (route === 'SURAT_INDORE') return { boarding: 'Surat', dropping: 'Indore' };
    return { boarding: 'Nashik', dropping: 'Surat' };
  }

  function updateMoney(){
    const total = Number($('totalAmount').value || 0);
    const paid = Number($('amountPaid').value || 0);
    $('remainingAmount').value = QT.fmtMoney(Math.max(0, total - paid));
    $('paymentStatus').value = QT.paymentStatusFor(total, paid);
    $('f-paid').classList.toggle('invalid', paid > total && total > 0);
  }

  function validateStep1(){
    let ok = true;
    const setInvalid = (id, cond) => {
      $(id).classList.toggle('invalid', !cond);
      if (!cond) ok = false;
    };
    const route = $('route').value;
    setInvalid('f-route', ['NASHIK_SURAT','INDORE_SURAT','SURAT_NASHIK','SURAT_INDORE'].includes(route));
    if (route === 'INDORE_SURAT') {
      setInvalid('f-nagar', ['Ammar Nagar','Nurai Nagar','Sefi Nagar'].includes($('boardingNagar').value));
    }
    setInvalid('f-mobile', QT.validMobile($('mobile').value));
    setInvalid('f-vehicle', $('vehicleType').value !== '');
    setInvalid('f-date', QT.isFutureOrToday($('travelDate').value));
    const total = Number($('totalAmount').value);
    const paid = Number($('amountPaid').value);
    setInvalid('f-total', total >= 0 && $('totalAmount').value !== '');
    setInvalid('f-paid', paid >= 0 && paid <= total && $('amountPaid').value !== '');
    setInvalid('f-method', $('paymentMethod').value !== '');
    return ok;
  }

  async function goToStep2(){
    if (!validateStep1()) return QT.toast('Please fix the highlighted fields.', 'err');
    $('seatDateLabel').textContent = routeLabel($('route').value) + ' on ' + QT.fmtDate($('travelDate').value);
    showStep(2);
    await loadAvailability();
    if (state.deck) renderDeck(state.deck);
  }

  async function loadAvailability(){
    QT.overlay(true, 'Checking seat availability…');
    try {
      const res = await QT.api('seatStatus', {
        route: $('route').value,
        travelDate: $('travelDate').value
      });
      if (!res.ok) throw new Error(QT.friendlyError(res.error));
      state.availability = res;
      const booked = res.booked || {};
      state.seats = state.seats.filter(s => !booked[s.id]);
      renderSelectedSeats();
    } catch(err) {
      QT.toast(err.message || 'Failed to load seats', 'err');
      state.availability = { booked: {} };
    } finally {
      QT.overlay(false);
    }
  }

  function selectDeck(deck){
    state.deck = deck;
    $('btn-lower').classList.toggle('btn-primary', deck === 'Lower');
    $('btn-lower').classList.toggle('btn-outline', deck !== 'Lower');
    $('btn-upper').classList.toggle('btn-primary', deck === 'Upper');
    $('btn-upper').classList.toggle('btn-outline', deck !== 'Upper');
    renderDeck(deck);
  }

  function renderDeck(deck){
    const grid = $('busGrid');
    grid.innerHTML = '';
    const booked = (state.availability && state.availability.booked) || {};
    QT.generateSeats(deck).forEach(s => {
      const el = document.createElement('div');
      el.className = 'seat';
      const b = booked[s.id];
      const selected = state.seats.some(x => x.id === s.id);
      if (b) {
        el.classList.add('booked');
        el.innerHTML = `<div class="no">${s.id}</div><div class="who">${escapeHTML(b.passengerName || 'Booked')}</div>`;
      } else if (selected) {
        el.classList.add('selected');
        el.innerHTML = `<div class="no">${s.id}</div><div class="who">Selected</div>`;
        el.addEventListener('click', () => toggleSeat(s));
      } else {
        el.classList.add('avail');
        el.innerHTML = `<div class="no">${s.id}</div><div class="who">Available</div>`;
        el.addEventListener('click', () => toggleSeat(s));
      }
      grid.appendChild(el);
    });
  }

  function toggleSeat(s){
    const idx = state.seats.findIndex(x => x.id === s.id);
    if (idx >= 0) {
      state.seats.splice(idx, 1);
      delete state.passengerNames[s.id];
    } else {
      state.seats.push({ id: s.id, deck: s.deck });
    }
    state.seats.sort((a,b) => a.id.localeCompare(b.id, undefined, { numeric:true }));
    renderDeck(state.deck);
    renderSelectedSeats();
  }

  function renderSelectedSeats(){
    const hasSeats = state.seats.length > 0;
    $('seatSummary').style.display = hasSeats ? '' : 'none';
    $('passengerNamesCard').style.display = hasSeats ? '' : 'none';
    $('btn-to-step-3').disabled = !hasSeats;
    if (!hasSeats) {
      $('passengerNameFields').innerHTML = '';
      return;
    }

    $('ss-seat').textContent = state.seats.map(s => s.id).join(', ');
    $('ss-count').textContent = String(state.seats.length);
    $('ss-date').textContent = QT.fmtDate($('travelDate').value);

    const wrap = $('passengerNameFields');
    wrap.innerHTML = state.seats.map(s => `
      <div class="passenger-seat-field" data-seat="${s.id}">
        <span class="seat-tag">${s.id}</span>
        <input type="text" data-passenger-seat="${s.id}" placeholder="Passenger full name" value="${escapeAttr(state.passengerNames[s.id] || '')}">
      </div>
    `).join('');
    wrap.querySelectorAll('input[data-passenger-seat]').forEach(input => {
      input.addEventListener('input', e => {
        state.passengerNames[e.target.dataset.passengerSeat] = e.target.value;
        e.target.parentElement.classList.remove('invalid');
      });
    });
  }

  function validatePassengerNames(){
    let ok = true;
    state.seats.forEach(s => {
      const name = String(state.passengerNames[s.id] || '').trim();
      const field = document.querySelector(`.passenger-seat-field[data-seat="${s.id}"]`);
      const valid = QT.validName(name);
      if (field) field.classList.toggle('invalid', !valid);
      if (!valid) ok = false;
    });
    return ok;
  }

  function collectBooking(){
    const total = Number($('totalAmount').value || 0);
    const paid = Number($('amountPaid').value || 0);
    const route = $('route').value;
    const points = routePoints(route);
    const passengers = state.seats.map(s => ({
      passengerName: String(state.passengerNames[s.id] || '').trim(),
      seatNumber: s.id,
      sleeperType: s.deck
    }));
    return {
      route: route,
      routeLabel: routeLabel(route),
      mobile: $('mobile').value.trim(),
      vehicleType: $('vehicleType').value,
      travelDate: $('travelDate').value,
      boardingPoint: points.boarding,
      droppingPoint: points.dropping,
      totalAmount: total,
      amountPaid: paid,
      remainingAmount: Math.max(0, total - paid),
      paymentMethod: $('paymentMethod').value,
      paymentStatus: QT.paymentStatusFor(total, paid),
      notes: $('notes').value.trim(),
      passengers: passengers,
      bookedBy: 'Staff'
    };
  }

  function goToStep3(){
    if (!state.seats.length) return QT.toast('Select at least one seat.', 'err');
    if (!validatePassengerNames()) return QT.toast('Enter a passenger name for every selected seat.', 'err');
    const b = collectBooking();
    $('reviewPanel').innerHTML = summaryRows(b);
    showStep(3);
  }

  function summaryRows(b){
    const passengerHtml = b.passengers.map(p => `${escapeHTML(p.seatNumber)} — ${escapeHTML(p.passengerName)} (${escapeHTML(p.sleeperType)})`).join('<br>');
    const rows = [
      ['Route', escapeHTML(b.routeLabel)],
      ['Boarding point', escapeHTML(b.boardingPoint)],
      ['Dropping point', escapeHTML(b.droppingPoint)],
      ['Mobile number', escapeHTML(b.mobile)],
      ['Vehicle / transport', escapeHTML(b.vehicleType)],
      ['Travel date', QT.fmtDate(b.travelDate)],
      ['Passengers / seats', passengerHtml],
      ['Total ticket amount', QT.fmtMoney(b.totalAmount)],
      ['Amount paid', QT.fmtMoney(b.amountPaid)],
      ['Remaining amount', QT.fmtMoney(b.remainingAmount)],
      ['Payment method', escapeHTML(b.paymentMethod)],
      ['Payment status', QT.statusPill(b.paymentStatus)]
    ];
    return rows.map(([k,v]) => `<div class="row"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('');
  }

  async function confirmBooking(){
    if (state.submitted) return;
    if (!validatePassengerNames()) return QT.toast('Enter every passenger name.', 'err');
    state.submitted = true;
    const btn = $('btn-confirm');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Saving…';
    QT.overlay(true, 'Confirming group booking…');
    const b = collectBooking();

    try {
      const avail = await QT.api('seatStatus', { route:b.route, travelDate:b.travelDate });
      if (!avail.ok) throw new Error(avail.error || 'Failed to check seats');
      const taken = b.passengers.filter(p => avail.booked && avail.booked[p.seatNumber]).map(p => p.seatNumber);
      if (taken.length) throw new Error('SEAT_TAKEN');

      const res = await QT.api('createBooking', { booking:b });
      if (!res.ok) throw new Error(res.error || 'Failed to save');
      b.bookingId = res.groupBookingId;
      b.bookingIds = res.bookingIds || [];
      b.passengerName = b.passengers.map(p => p.passengerName).join(', ');
      b.seatNumber = b.passengers.map(p => p.seatNumber).join(', ');
      b.sleeperType = 'Multiple';
      b.paymentStatus = res.paymentStatus;
      b.remainingAmount = res.remaining;
      state.lastBooking = b;
      renderSuccess(b);
      showStep(4);
      QT.toast('All selected seats saved to Google Sheets', 'ok');
    } catch(err) {
      QT.toast(QT.friendlyError(err.message), 'err');
      state.submitted = false;
      btn.disabled = false;
      btn.textContent = 'Confirm booking ✓';
      if (err.message === 'SEAT_TAKEN') {
        await loadAvailability();
        if (state.deck) renderDeck(state.deck);
        showStep(2);
      }
    } finally {
      QT.overlay(false);
    }
  }

  function renderSuccess(b){
    const passengerHtml = b.passengers.map(p => `${escapeHTML(p.seatNumber)} — ${escapeHTML(p.passengerName)}`).join('<br>');
    const rows = [
      ['Group booking ID', `<b>${escapeHTML(b.bookingId)}</b>`],
      ['Route', escapeHTML(b.routeLabel)],
      ['Boarding', escapeHTML(b.boardingPoint)],
      ['Vehicle / transport', escapeHTML(b.vehicleType)],
      ['Passengers / seats', passengerHtml],
      ['Travel date', QT.fmtDate(b.travelDate)],
      ['Total ticket amount', QT.fmtMoney(b.totalAmount)],
      ['Amount paid', QT.fmtMoney(b.amountPaid)],
      ['Remaining amount', QT.fmtMoney(b.remainingAmount)],
      ['Payment status', QT.statusPill(b.paymentStatus)]
    ];
    $('confirmPanel').innerHTML = '<div class="summary">' + rows.map(([k,v]) => `<div class="row"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('') + '</div><div style="margin-top:16px">' + QT.ticketHTML(b) + '</div>';
    $('btn-whatsapp').href = QT.whatsappLink(b.mobile, QT.bookingWhatsappMessage(b));
  }

  function showStep(n){
    state.step = n;
    for (let i=1; i<=4; i++) {
      const el = $('section-' + i);
      if (el) el.style.display = i === n ? '' : 'none';
    }
    document.querySelectorAll('.stepper .step').forEach(s => {
      const num = Number(s.dataset.step);
      s.classList.toggle('active', num === n);
      s.classList.toggle('done', num < n);
    });
    window.scrollTo({ top:0, behavior:'smooth' });
  }

  function clearSeatSelection(){
    state.seats = [];
    state.passengerNames = {};
    state.availability = null;
    renderSelectedSeats();
    if (state.deck) renderDeck(state.deck);
  }

  function resetForm(){
    ['mobile','totalAmount','amountPaid','notes'].forEach(id => $(id).value = '');
    $('route').value = '';
    $('boardingNagar').value = '';
    $('paymentMethod').value = '';
    $('vehicleType').value = '';
    $('travelDate').value = QT.todayISO();
    state.deck = null;
    state.submitted = false;
    state.lastBooking = null;
    clearSeatSelection();
    $('busGrid').innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#6b7280;padding:20px">Choose <b>Lower Sleeper</b> or <b>Upper Sleeper</b> to view seats.</div>';
    $('btn-lower').className = 'btn btn-outline';
    $('btn-upper').className = 'btn btn-outline';
    $('btn-confirm').textContent = 'Confirm booking ✓';
    document.querySelectorAll('.field.invalid').forEach(f => f.classList.remove('invalid'));
    onRouteChange();
    updateMoney();
  }

  function escapeHTML(s){
    return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function escapeAttr(s){ return escapeHTML(s).replace(/`/g,'&#96;'); }
})();
