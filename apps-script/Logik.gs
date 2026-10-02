// Reine Logik ohne Google-Dienste – wird in Node getestet (tests/logik.test.js).
// Zeilen = Sheet-Werte ohne Kopfzeile: [zeit, videoId, titel, name, status]

var SPALTE = { ZEIT: 0, VIDEO_ID: 1, TITEL: 2, NAME: 3, STATUS: 4 };

function istGueltigeVideoId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id);
}

function bereinigeText_(text, maxLaenge) {
  return String(text == null ? '' : text)
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLaenge);
}

function bereinigeName(name) {
  return bereinigeText_(name, 30);
}

function bereinigeSuche(q) {
  return bereinigeText_(q, 100);
}

function alsIso_(zeit) {
  return zeit && typeof zeit.toISOString === 'function' ? zeit.toISOString() : String(zeit);
}

function offeneWuensche(rows) {
  var ergebnis = [];
  rows.forEach(function (r, i) {
    if (r[SPALTE.STATUS] !== 'offen') return;
    ergebnis.push({
      zeile: i + 2,
      zeit: alsIso_(r[SPALTE.ZEIT]),
      videoId: String(r[SPALTE.VIDEO_ID]),
      titel: String(r[SPALTE.TITEL]),
      name: String(r[SPALTE.NAME]),
    });
  });
  return ergebnis;
}

function platzVon(rows, videoId) {
  var offen = offeneWuensche(rows);
  for (var i = 0; i < offen.length; i++) {
    if (offen[i].videoId === videoId) return i + 1;
  }
  return 0;
}

function letzteZeileMitStatus(rows, videoId, status) {
  for (var i = rows.length - 1; i >= 0; i--) {
    if (rows[i][SPALTE.VIDEO_ID] === videoId && rows[i][SPALTE.STATUS] === status) return i + 2;
  }
  return 0;
}
