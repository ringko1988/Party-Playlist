// Web-App für die Party-Playlist: Warteschlange im Google Sheet + YouTube-Suche.
// Benötigt den erweiterten Dienst „YouTube Data API v3“ (Kennung: YouTube).

var BLATT_NAME = 'Wuensche';
var KOPFZEILE = ['Zeit', 'VideoId', 'Titel', 'Name', 'Status'];

function doGet(e) {
  var p = (e && e.parameter) || {};
  return antwort_(function () {
    switch (p.action) {
      case 'suche': return suche_(p.q);
      case 'info': return info_(p.videoId);
      case 'warteschlange': return warteschlange_();
      default: throw nutzerFehler_('Unbekannte Aktion');
    }
  });
}

function doPost(e) {
  return antwort_(function () {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    switch (body.action) {
      case 'wuenschen': return wuenschen_(body.videoId, body.name);
      case 'naechster': return naechster_();
      case 'fehler': return fehler_(body.videoId);
      default: throw nutzerFehler_('Unbekannte Aktion');
    }
  });
}

// --- Aktionen ---

function suche_(q) {
  var query = bereinigeSuche(q);
  if (!query) throw nutzerFehler_('Bitte gib einen Suchbegriff ein');
  var res = YouTube.Search.list('snippet', {
    q: query, type: 'video', videoEmbeddable: 'true', maxResults: 5,
  });
  return (res.items || []).map(function (item) {
    return videoDaten_(item.id.videoId, item.snippet);
  });
}

function info_(videoId) {
  if (!istGueltigeVideoId(videoId)) throw nutzerFehler_('Ungültige Video-ID');
  var res = YouTube.Videos.list('snippet,status', { id: videoId });
  var item = (res.items || [])[0];
  if (!item) throw nutzerFehler_('Video nicht gefunden');
  if (item.status && item.status.embeddable === false) {
    throw nutzerFehler_('Dieses Video darf nicht auf anderen Seiten abgespielt werden');
  }
  return videoDaten_(item.id, item.snippet);
}

function warteschlange_() {
  return offeneWuensche(zeilen_()).map(function (w) {
    return { zeit: w.zeit, videoId: w.videoId, titel: w.titel, name: w.name };
  });
}

function wuenschen_(videoId, name) {
  var video = info_(videoId);
  var gastName = bereinigeName(name);
  return mitLock_(function () {
    var platz = platzVon(zeilen_(), videoId);
    if (platz > 0) return { platz: platz, duplikat: true };
    blatt_().appendRow([new Date(), alsZelltext(videoId), alsZelltext(video.titel), alsZelltext(gastName), 'offen']);
    return { platz: platzVon(zeilen_(), videoId), duplikat: false };
  });
}

function naechster_() {
  return mitLock_(function () {
    var wunsch = offeneWuensche(zeilen_())[0];
    if (!wunsch) return null;
    blatt_().getRange(wunsch.zeile, SPALTE.STATUS + 1).setValue('gespielt');
    return { videoId: wunsch.videoId, titel: wunsch.titel, name: wunsch.name };
  });
}

function fehler_(videoId) {
  if (!istGueltigeVideoId(videoId)) throw nutzerFehler_('Ungültige Video-ID');
  return mitLock_(function () {
    var zeile = letzteZeileMitStatus(zeilen_(), videoId, 'gespielt');
    if (zeile) blatt_().getRange(zeile, SPALTE.STATUS + 1).setValue('Fehler');
    return null;
  });
}

// --- Hilfsfunktionen ---

function videoDaten_(videoId, snippet) {
  var thumbs = snippet.thumbnails || {};
  var thumb = thumbs.medium || thumbs.high || thumbs['default'];
  return {
    videoId: videoId,
    titel: dekodiereHtml_(snippet.title),
    kanal: dekodiereHtml_(snippet.channelTitle),
    thumbnail: thumb ? thumb.url : 'https://i.ytimg.com/vi/' + videoId + '/mqdefault.jpg',
  };
}

// Die YouTube-Suche liefert Titel HTML-kodiert (z. B. &#39; statt ')
function dekodiereHtml_(text) {
  return String(text == null ? '' : text)
    .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(Number(n)); })
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function blatt_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var blatt = ss.getSheetByName(BLATT_NAME);
  if (!blatt) {
    blatt = ss.insertSheet(BLATT_NAME);
    blatt.appendRow(KOPFZEILE);
    blatt.setFrozenRows(1);
    blatt.getRange('B:D').setNumberFormat('@'); // VideoId, Titel, Name immer als Text
  }
  return blatt;
}

function zeilen_() {
  return blatt_().getDataRange().getValues().slice(1);
}

function mitLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function nutzerFehler_(text) {
  var err = new Error(text);
  err.fuerNutzer = true;
  return err;
}

function antwort_(fn) {
  var ergebnis;
  try {
    ergebnis = { ok: true, data: fn() };
  } catch (err) {
    ergebnis = { ok: false, fehler: err.fuerNutzer ? err.message : 'Serverfehler: ' + err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(ergebnis)).setMimeType(ContentService.MimeType.JSON);
}
