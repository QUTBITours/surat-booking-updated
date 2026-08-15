# Qutbi Tours & Holidays — Sleeper Bus Booking System

A complete, mobile-friendly sleeper bus booking website with Google Sheets as the database.

## Contents

- `index.html` — Booking flow (Trip details → Multi-seat select → Passenger names → Review → Confirm)
- `admin.html` — Password-protected admin dashboard
- `assets/css/styles.css` — Shared styles (dark blue / white / gold theme)
- `assets/js/config.js` — Backend URL configuration (edit this)
- `assets/js/common.js` — Shared helpers (API, validation, formatting)
- `assets/js/booking.js` — Booking flow logic
- `assets/js/admin.js` — Admin dashboard logic
- `apps-script/Code.gs` — Google Apps Script backend (paste into Apps Script editor)
- `apps-script/appsscript.json` — Apps Script manifest

## Bus layout

- 36 sleeper berths total
- **Lower deck:** L1–L18 (6 rows × 2+1 configuration)
- **Upper deck:** U1–U18 (6 rows × 2+1 configuration)

A seat is booked for a specific **route + travel date**. One booking may contain multiple seats, with one passenger name assigned to each seat.

Routes:
- **Nashik to Surat**
- **Indore to Surat** — boarding Nagar must be Ammar Nagar, Nurai Nagar, or Saify Nagar.
- **Surat to Nashik**
- **Surat to Indore**

---

## 1) Google Sheet setup

The configured spreadsheet is already used by this project. The backend automatically creates four route tabs:

- **Nashik to Surat**
- **Indore to Surat**
- **Surat to Nashik**
- **Surat to Indore**

Run `setupSheets()` once from Apps Script if you want to create all four tabs immediately. Otherwise each tab is created automatically when that route is first used.

Each route tab uses these headers in row 1 (columns A–Q):

| A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P | Q |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Timestamp | Booking ID | Passenger Name | Mobile Number | Travel Date | Seat Number | Sleeper Type | Boarding Point | Dropping Point | Total Ticket Amount | Amount Paid | Remaining Amount | Payment Method | Payment Status | Booking Status | Notes | Booked By |

The old **Bookings** tab is kept as legacy data and is treated as Nashik to Surat so existing bookings are not lost.

---

## 2) Deploy the Apps Script backend

1. Open the sheet, then **Extensions → Apps Script**.
2. Delete the default `Code.gs` content and paste the contents of `apps-script/Code.gs`.
3. At the top of the file, set:
   - `SHEET_ID` — the ID you copied above
   - `ADMIN_PASSWORD` — your admin password (default:)
   - `API_SECRET` — a long random string (used to sign requests)
4. Save. For an existing deployment, click **Deploy → Manage deployments → Edit → New version → Deploy**. For a brand-new deployment use **Deploy → New deployment**:
   - Type: **Web app**
   - Description: `Qutbi Bookings API v1`
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the **Web app URL** (ends in `/exec`).

To change the admin password later: edit `ADMIN_PASSWORD` in the script and **Deploy → Manage deployments → Edit → New version → Deploy**.

---

## 3) Connect the website

Open `assets/js/config.js` and set:

```js
const CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/XXXXXXXX/exec",
  API_SECRET: "same-secret-you-set-in-Code.gs"
};
```

The API secret is sent from the browser to Apps Script to reject stranger requests. It is not a substitute for the admin password — it just blocks casual abuse of the endpoint.

---

## 4) Host the website

Any static host works:

- **GitHub Pages:** create a repo, push the `output/` contents, enable Pages on `main`.
- **Netlify / Vercel / Cloudflare Pages:** drag-and-drop the folder.
- **Your own server:** upload the files to any web server (Apache/Nginx). No backend needed on your server — the backend lives in Apps Script.

Open `index.html` for the booking flow and `admin.html` for the dashboard.

---

## 5) Admin login

- URL: `admin.html`
- Default password: **`qutbi@2026`** (change in `apps-script/Code.gs` → `ADMIN_PASSWORD`).
- The password is verified server-side by Apps Script; on success the browser stores a session token in `sessionStorage` (cleared on tab close).

---

## 6) Testing checklist

**Route and multi-seat tests (critical):**
1. Choose Nashik to Surat, select L5 + L6 + U2, enter three different passenger names, and confirm. Three rows should appear in the **Nashik to Surat** tab.
2. Try one of those seats again for the same route/date. It must show booked and the backend must reject a forced duplicate with `SEAT_TAKEN`.
3. Choose Indore to Surat. The form must require exactly one of Ammar Nagar, Nurai Nagar, or Sefi Nagar.
4. Confirm an Indore booking. Its rows must appear only in the **Indore to Surat** tab.
5. The same seat/date may be independently available on the other route.

**Other tests:**
- Mobile validation: `98765` → rejected; `9876543210` → accepted; `1234567890` → rejected (must start 6–9).
- Remaining amount auto-updates when Amount Paid changes.
- Payment status flips Unpaid → Partially Paid → Fully Paid based on amounts.
- Cancel a booking in admin → the seat becomes available again for that date.
- Restore cancelled booking → seat marked booked again (fails if someone else took it).
- Print Ticket produces a clean printout.
- WhatsApp share opens `wa.me` with a pre-filled message.
- Export CSV downloads all bookings.

---

## 7) File structure

```
output/
├── index.html
├── admin.html
├── README.md
├── apps-script/
│   ├── Code.gs
│   └── appsscript.json
└── assets/
    ├── css/styles.css
    └── js/
        ├── config.js
        ├── common.js
        ├── booking.js
        └── admin.js
```
