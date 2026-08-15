/**
 * Qutbi Tours & Holidays — route-aware multi-seat sleeper booking backend.
 *
 * Deploy as Web app: Execute as Me | Who has access: Anyone.
 */

const SHEET_ID       = '177GRK2azTs-HFcYl9KTRVeungGZ3m4DxI8kydGyI2E4';
const ADMIN_PASSWORD = 'qutbi@2026';
const API_SECRET     = 'dfaa8c516f56d869e144d1625eb762745f733a38574ea07a14c0237049fefe49';

const LEGACY_SHEET_NAME = 'Bookings';
const ROUTES = {
  NASHIK_SURAT: { label:'Nashik to Surat', sheet:'Nashik to Surat', code:'NS', from:'Nashik', to:'Surat' },
  INDORE_SURAT: { label:'Indore to Surat', sheet:'Indore to Surat', code:'IS', from:'Indore', to:'Surat' },
  SURAT_NASHIK: { label:'Surat to Nashik', sheet:'Surat to Nashik', code:'SN', from:'Surat', to:'Nashik' },
  SURAT_INDORE: { label:'Surat to Indore', sheet:'Surat to Indore', code:'SI', from:'Surat', to:'Indore' }
};
const INDORE_NAGARS = ['Ammar Nagar','Nurai Nagar','Sefi Nagar'];

const HEADERS = [
  'Timestamp','Booking ID','Passenger Name','Mobile Number','Travel Date',
  'Seat Number','Sleeper Type','Boarding Point','Dropping Point',
  'Total Ticket Amount','Amount Paid','Remaining Amount',
  'Payment Method','Payment Status','Booking Status','Notes','Booked By'
];

function doGet(e)  { return handle_(e); }
function doPost(e) { return handle_(e); }

function handle_(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    let payload = {};
    if (e && e.postData && e.postData.contents) {
      try { payload = JSON.parse(e.postData.contents); } catch (_) { payload = {}; }
    }
    const action = payload.action || params.action || 'ping';
    const secret = payload.secret || params.secret || '';
    if (secret !== API_SECRET) return json_({ ok:false, error:'BAD_SECRET' });

    switch (action) {
      case 'ping':           return json_({ ok:true, pong:true });
      case 'login':          return json_(login_(payload));
      case 'listBookings':   return json_(listBookings_(payload));
      case 'seatStatus':     return json_(seatStatus_(payload));
      case 'createBooking':  return json_(createBooking_(payload));
      case 'updateBooking':  return json_(updateBooking_(payload));
      case 'cancelBooking':  return json_(cancelBooking_(payload));
      case 'restoreBooking': return json_(restoreBooking_(payload));
      default:               return json_({ ok:false, error:'UNKNOWN_ACTION' });
    }
  } catch (err) {
    return json_({ ok:false, error:String(err && err.message || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- Sheets ----------

function spreadsheet_() { return SpreadsheetApp.openById(SHEET_ID); }

function ensureHeaders_(sh) {
  if (sh.getLastRow() === 0) {
    sh.getRange(1,1,1,HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function sheetForRoute_(route) {
  const cfg = ROUTES[route];
  if (!cfg) throw new Error('BAD_ROUTE');
  const ss = spreadsheet_();
  let sh = ss.getSheetByName(cfg.sheet);
  if (!sh) sh = ss.insertSheet(cfg.sheet);
  return ensureHeaders_(sh);
}

function routeFromSheet_(sheetName) {
  const route = Object.keys(ROUTES).find(key => ROUTES[key].sheet === sheetName);
  if (route) return route;
  return 'NASHIK_SURAT';
}

function readSheet_(sh, route) {
  if (!sh || sh.getLastRow() < 2) return [];
  const last = sh.getLastRow();
  const values = sh.getRange(2,1,last-1,HEADERS.length).getValues();
  return values.map((row, idx) => rowToObj_(row, idx+2, sh.getName(), route));
}

function readAll_(route) {
  const ss = spreadsheet_();
  if (route) {
    if (!ROUTES[route]) return [];
    const rows = readSheet_(sheetForRoute_(route), route);
    // Existing bookings from the old system are treated as Nashik → Surat.
    if (route === 'NASHIK_SURAT') {
      const legacy = ss.getSheetByName(LEGACY_SHEET_NAME);
      if (legacy && legacy.getName() !== ROUTES.NASHIK_SURAT.sheet) {
        return rows.concat(readSheet_(legacy, 'NASHIK_SURAT'));
      }
    }
    return rows;
  }

  let rows = [];
  Object.keys(ROUTES).forEach(key => {
    const sh = ss.getSheetByName(ROUTES[key].sheet);
    if (sh) rows = rows.concat(readSheet_(sh, key));
  });
  const legacy = ss.getSheetByName(LEGACY_SHEET_NAME);
  if (legacy) rows = rows.concat(readSheet_(legacy, 'NASHIK_SURAT'));
  return rows;
}

function rowToObj_(row, rowNumber, sheetName, route) {
  route = route || routeFromSheet_(sheetName);
  return {
    _row: rowNumber,
    _sheetName: sheetName,
    route: route,
    routeLabel: ROUTES[route] ? ROUTES[route].label : '',
    timestamp:       row[0] instanceof Date ? row[0].toISOString() : String(row[0] || ''),
    bookingId:       String(row[1] || ''),
    passengerName:   String(row[2] || ''),
    mobile:          String(row[3] || ''),
    travelDate:      normalizeDate_(row[4]),
    seatNumber:      String(row[5] || ''),
    sleeperType:     String(row[6] || ''),
    boardingPoint:   String(row[7] || ''),
    droppingPoint:   String(row[8] || ''),
    totalAmount:     Number(row[9] || 0),
    amountPaid:      Number(row[10] || 0),
    remainingAmount: Number(row[11] || 0),
    paymentMethod:   String(row[12] || ''),
    paymentStatus:   String(row[13] || ''),
    bookingStatus:   String(row[14] || ''),
    notes:           String(row[15] || ''),
    bookedBy:        String(row[16] || '')
  };
}

function normalizeDate_(v) {
  if (!v) return '';
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = ('0' + (v.getMonth()+1)).slice(-2);
    const d = ('0' + v.getDate()).slice(-2);
    return y + '-' + m + '-' + d;
  }
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : normalizeDate_(d);
}

// ---------- Actions ----------

function login_(p) {
  if (String(p.password || '') !== ADMIN_PASSWORD) return { ok:false, error:'BAD_PASSWORD' };
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put('token:' + token, '1', 60*60*8);
  return { ok:true, token:token };
}

function checkToken_(token) {
  return !!token && CacheService.getScriptCache().get('token:' + token) === '1';
}

function listBookings_(p) {
  if (!checkToken_(p.token)) return { ok:false, error:'AUTH_REQUIRED' };
  return { ok:true, rows:readAll_() };
}

function seatStatus_(p) {
  const route = String(p.route || '');
  const travelDate = normalizeDate_(p.travelDate);
  if (!ROUTES[route]) return { ok:false, error:'BAD_ROUTE' };
  if (!travelDate) return { ok:false, error:'MISSING_DATE' };
  const rows = readAll_(route).filter(r => r.travelDate === travelDate && r.bookingStatus !== 'Cancelled');
  const map = {};
  rows.forEach(r => {
    map[r.seatNumber] = { passengerName:r.passengerName, bookingId:r.bookingId, sleeperType:r.sleeperType };
  });
  return { ok:true, route:route, travelDate:travelDate, booked:map };
}

function createBooking_(p) {
  const b = p.booking || {};
  const err = validateGroupBooking_(b);
  if (err) return { ok:false, error:err };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const route = String(b.route);
    const travelDate = normalizeDate_(b.travelDate);
    const existing = readAll_(route).filter(r => r.travelDate === travelDate && r.bookingStatus !== 'Cancelled');
    const taken = b.passengers.filter(pax => existing.some(r => r.seatNumber === pax.seatNumber)).map(pax => pax.seatNumber);
    if (taken.length) return { ok:false, error:'SEAT_TAKEN', takenSeats:taken };

    const groupBookingId = generateGroupBookingId_(route, travelDate, existing);
    const count = b.passengers.length;
    const totalParts = splitAmount_(Number(b.totalAmount), count);
    const paidParts = splitAmount_(Number(b.amountPaid), count);
    const commonPaymentStatus = derivePaymentStatus_(Number(b.totalAmount), Number(b.amountPaid));
    const bookingIds = [];
    const rows = b.passengers.map((pax, idx) => {
      const bookingId = groupBookingId + '-' + ('0' + (idx+1)).slice(-2);
      bookingIds.push(bookingId);
      const total = totalParts[idx];
      const paid = paidParts[idx];
      const remaining = Math.max(0, roundMoney_(total - paid));
      return [
        new Date(), bookingId, String(pax.passengerName).trim(), String(b.mobile), travelDate,
        pax.seatNumber, pax.sleeperType,
        b.boardingPoint, b.droppingPoint,
        total, paid, remaining, b.paymentMethod, derivePaymentStatus_(total, paid),
        'Confirmed', b.notes || '', b.bookedBy || 'Staff'
      ];
    });

    const sh = sheetForRoute_(route);
    sh.getRange(sh.getLastRow()+1, 1, rows.length, HEADERS.length).setValues(rows);
    return {
      ok:true,
      groupBookingId:groupBookingId,
      bookingIds:bookingIds,
      paymentStatus:commonPaymentStatus,
      remaining:Math.max(0, Number(b.totalAmount)-Number(b.amountPaid))
    };
  } finally {
    lock.releaseLock();
  }
}

function updateBooking_(p) {
  if (!checkToken_(p.token)) return { ok:false, error:'AUTH_REQUIRED' };
  const bookingId = String(p.bookingId || '');
  const patch = p.patch || {};
  if (!bookingId) return { ok:false, error:'MISSING_ID' };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const allRows = readAll_();
    const target = allRows.find(r => r.bookingId === bookingId);
    if (!target) return { ok:false, error:'NOT_FOUND' };
    const merged = Object.assign({}, target, patch);
    merged.travelDate = normalizeDate_(merged.travelDate);

    const routeRows = readAll_(target.route);
    const clash = routeRows.find(r =>
      r.bookingId !== bookingId &&
      r.travelDate === merged.travelDate &&
      r.seatNumber === merged.seatNumber &&
      r.bookingStatus !== 'Cancelled'
    );
    if (clash) return { ok:false, error:'SEAT_TAKEN' };

    const total = Number(merged.totalAmount || 0);
    const paid = Number(merged.amountPaid || 0);
    if (paid > total) return { ok:false, error:'PAID_EXCEEDS_TOTAL' };
    const remain = Math.max(0, total-paid);
    const payStat = derivePaymentStatus_(total, paid);
    const sh = spreadsheet_().getSheetByName(target._sheetName);
    if (!sh) return { ok:false, error:'NOT_FOUND' };
    sh.getRange(target._row,1,1,HEADERS.length).setValues([[
      new Date(target.timestamp || Date.now()), merged.bookingId, merged.passengerName, String(merged.mobile),
      merged.travelDate, merged.seatNumber, merged.sleeperType, merged.boardingPoint || '', merged.droppingPoint || '',
      total, paid, remain, merged.paymentMethod, payStat, merged.bookingStatus || 'Confirmed', merged.notes || '', merged.bookedBy || ''
    ]]);
    return { ok:true };
  } finally {
    lock.releaseLock();
  }
}

function cancelBooking_(p) {
  if (!checkToken_(p.token)) return { ok:false, error:'AUTH_REQUIRED' };
  const target = readAll_().find(r => r.bookingId === String(p.bookingId || ''));
  if (!target) return { ok:false, error:'NOT_FOUND' };
  const sh = spreadsheet_().getSheetByName(target._sheetName);
  sh.getRange(target._row,15).setValue('Cancelled');
  return { ok:true };
}

function restoreBooking_(p) {
  if (!checkToken_(p.token)) return { ok:false, error:'AUTH_REQUIRED' };
  const bookingId = String(p.bookingId || '');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const target = readAll_().find(r => r.bookingId === bookingId);
    if (!target) return { ok:false, error:'NOT_FOUND' };
    const clash = readAll_(target.route).find(r =>
      r.bookingId !== bookingId && r.travelDate === target.travelDate &&
      r.seatNumber === target.seatNumber && r.bookingStatus !== 'Cancelled'
    );
    if (clash) return { ok:false, error:'SEAT_TAKEN' };
    const sh = spreadsheet_().getSheetByName(target._sheetName);
    sh.getRange(target._row,15).setValue('Confirmed');
    return { ok:true };
  } finally {
    lock.releaseLock();
  }
}

// ---------- Validation / helpers ----------

function validateGroupBooking_(b) {
  if (!b) return 'EMPTY';
  if (!ROUTES[String(b.route || '')]) return 'BAD_ROUTE';
  if (!/^[6-9]\d{9}$/.test(String(b.mobile || ''))) return 'BAD_MOBILE';
  if (!b.travelDate) return 'BAD_DATE';
  if (!Array.isArray(b.passengers) || b.passengers.length < 1) return 'BAD_SEAT';
  const cfg = ROUTES[String(b.route)];
  if (String(b.route) === 'INDORE_SURAT') {
    if (INDORE_NAGARS.indexOf(String(b.boardingPoint || '')) < 0) return 'BAD_BOARDING';
    if (String(b.droppingPoint || '') !== cfg.to) return 'BAD_ROUTE_POINTS';
  } else if (String(b.boardingPoint || '') !== cfg.from || String(b.droppingPoint || '') !== cfg.to) {
    return 'BAD_ROUTE_POINTS';
  }
  const seatSet = {};
  for (let i=0; i<b.passengers.length; i++) {
    const pax = b.passengers[i] || {};
    if (!pax.passengerName || String(pax.passengerName).trim().length < 2) return 'BAD_NAME';
    if (!/^[LU](?:[1-9]|1[0-8])$/.test(String(pax.seatNumber || ''))) return 'BAD_SEAT';
    if (pax.sleeperType !== 'Lower' && pax.sleeperType !== 'Upper') return 'BAD_TYPE';
    if ((pax.seatNumber.charAt(0) === 'L' && pax.sleeperType !== 'Lower') || (pax.seatNumber.charAt(0) === 'U' && pax.sleeperType !== 'Upper')) return 'BAD_TYPE';
    if (seatSet[pax.seatNumber]) return 'DUPLICATE_SEAT';
    seatSet[pax.seatNumber] = true;
  }
  if (!(Number(b.totalAmount) >= 0)) return 'BAD_TOTAL';
  if (!(Number(b.amountPaid) >= 0)) return 'BAD_PAID';
  if (Number(b.amountPaid) > Number(b.totalAmount)) return 'PAID_EXCEEDS_TOTAL';
  if (['Cash','UPI','Bank Transfer','Other'].indexOf(String(b.paymentMethod)) < 0) return 'BAD_METHOD';
  return null;
}

function derivePaymentStatus_(total, paid) {
  if (paid <= 0) return 'Unpaid';
  if (paid >= total) return 'Fully Paid';
  return 'Partially Paid';
}

function roundMoney_(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

function splitAmount_(amount, count) {
  amount = roundMoney_(amount);
  const each = Math.floor((amount / count) * 100) / 100;
  const parts = [];
  let used = 0;
  for (let i=0; i<count; i++) {
    const part = i === count-1 ? roundMoney_(amount-used) : each;
    parts.push(part);
    used = roundMoney_(used+part);
  }
  return parts;
}

function generateGroupBookingId_(route, travelDate, existingRows) {
  const cfg = ROUTES[route];
  const ymd = String(travelDate).replace(/-/g,'');
  const prefix = 'QTH-' + cfg.code + '-' + ymd + '-';
  let maxN = 0;
  (existingRows || []).forEach(r => {
    if (r.bookingId && r.bookingId.indexOf(prefix) === 0) {
      const tail = r.bookingId.slice(prefix.length);
      const n = parseInt(tail, 10);
      if (!isNaN(n) && n > maxN) maxN = n;
    }
  });
  return prefix + ('00' + (maxN+1)).slice(-3);
}

// Run once after updating the script if you want both route tabs created immediately.
function setupSheets() {
  Object.keys(ROUTES).forEach(sheetForRoute_);
}
