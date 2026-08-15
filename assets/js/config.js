// Qutbi Tours & Holidays — frontend config
// Edit these two values after deploying the Apps Script Web App.
window.CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbxEHpfsH0CqETZVJ9y4RPaXusoQ4xtgw4dcLLjEAFmzXfJl5dvSv_sSqlBWsFicJSdF/exec",
  API_SECRET: "dfaa8c516f56d869e144d1625eb762745f733a38574ea07a14c0237049fefe49",
  BRAND: {
    name: "Qutbi Tours & Holidays",
    tagline: "Sleeper Bus Booking",
    whatsappCountryCode: "91"
  },
  BUS: {
    lowerCount: 18,
    upperCount: 18,
    // 2+1 configuration → 6 rows × 3 berths per row per deck
    rowsPerDeck: 6,
    berthsPerRow: 3
  }
};
