# Party-Playlist – Design

Datum: 2026-10-02
Repo: https://github.com/ringko1988/Party-Playlist

## Ziel

Gäste einer Party scannen einen QR-Code, landen auf einer Wunschseite und wünschen sich
einen Song – per YouTube-Link oder per Titel/Interpret. Eine Abspielseite spielt die
Gästewünsche bevorzugt in Eingangsreihenfolge; ist kein Wunsch offen, läuft Ringkos
vorbereitete YouTube-Playlist in zufälliger Reihenfolge.

**Erfolgskriterien**
- Gast kann vom Handy aus in < 30 Sekunden einen Song wünschen.
- Ein Gästewunsch wird spätestens nach dem aktuell laufenden Song gespielt (FIFO).
- Ohne offene Wünsche spielt die eigene Playlist durchgehend zufällig weiter.
- Kein eigener Server; alles kostenlos.

## Architektur

| Teil | Technik | Aufgabe |
|---|---|---|
| Wunschseite `index.html` | GitHub Pages (statisch) | Gäste wünschen Songs |
| Abspielseite `player.html` | GitHub Pages (statisch) | spielt Musik, zeigt Warteschlange + QR-Code |
| Backend | Google Apps Script Web-App | API, YouTube-Suche |
| Datenbank | Google Sheet | Warteschlange |
| Konfiguration | `config.js` | Apps-Script-URL, Playlist-ID |

Plain HTML/CSS/JavaScript ohne Build-Schritt. Kommunikation zum Apps Script per `fetch`:
`GET` für Lesezugriffe, `POST` mit `Content-Type: text/plain` (vermeidet CORS-Preflight).
Antworten sind JSON.

## Design / Optik

An ringko.tv angelehnt:

| Token | Wert |
|---|---|
| `--bg` | `#0b0b33` |
| `--bg-2` (Karten) | `#12123f` |
| `--line` (Ränder) | `#26265e` |
| `--text` | `#ececff` |
| `--muted` | `#a3a3cc` |
| `--accent` | `#4a4aff` |

Schrift `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`; abgerundete Karten
(12–14px). Logo von ringko.tv auf der Wunschseite (eingebunden per URL `https://ringko.tv/logo.png`).
Footer auf beiden Seiten: dezenter Link „made by ringko.tv“ → https://ringko.tv.
Oberflächentexte auf Deutsch.

## Wunschseite (`index.html`, mobil zuerst)

- **Ein Eingabefeld**: YouTube-Link *oder* „Titel Interpret“. Automatische Erkennung:
  - Link (`youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`, `music.youtube.com/watch?v=`,
    mit Zusatzparametern) → Video-ID extrahieren → `info` abrufen → Vorschau (Thumbnail + Titel)
    → Button „Wünschen“.
  - Text → `suche` → 3–5 Treffer mit Thumbnail, Titel, Kanal → Gast tippt einen an → Wunsch.
- **Namensfeld** (optional, max. 30 Zeichen), in `localStorage` gemerkt.
- **Bestätigung** nach Absenden: „Dein Song ist auf Platz X der Warteschlange“.
- **Duplikat**: Ist dieselbe Video-ID bereits `offen`, wird kein neuer Eintrag angelegt;
  Meldung „Ist schon drin – auf Platz X“.
- **Vorschau-Liste** der nächsten offenen Wünsche (Titel + Name).
- Fehlermeldungen in verständlichem Deutsch (z. B. „Gerade keine Verbindung – versuch's gleich nochmal“).

Bewusst nicht enthalten: Login, Voting, Limit pro Gast.

## Abspielseite (`player.html`, Laptop/Tablet/Beamer)

**Layout**
- Querformat: links YouTube-Player groß, rechts Warteschlange; Hochformat: untereinander.
- Unter dem Player: „Jetzt läuft: *Titel*“, bei Gästewunsch zusätzlich „🎤 gewünscht von *Name*“.
- Warteschlange: Platz, Thumbnail, Titel, Name. Leer → „Keine Wünsche – zufällige Songs aus der Playlist“.
- QR-Code zur Wunschseite (URL = Seiten-URL mit `index.html`), clientseitig erzeugt
  (QR-Bibliothek von cdnjs).
- **Bedienknöpfe permanent sichtbar, groß und touch-tauglich**: Pause/Play, Überspringen, Vollbild.

**Ablauf**
1. Startbildschirm mit Button „Party starten“ (nötig für Autoplay mit Ton).
2. Playlist laden: YouTube IFrame Player lädt die Playlist (`list`), `getPlaylist()` liefert
   die Video-IDs. Die Seite mischt diese selbst (Fisher-Yates) und spielt danach Einzelvideos
   per `loadVideoById`. Ist die Liste durch, wird neu gemischt.
   Beim Bau prüfen, ob `getPlaylist()` bei sehr langen Playlists (> 200 Songs) alle IDs liefert;
   falls nicht, Playlist-IDs stattdessen über das Apps Script (`PlaylistItems.list`) laden.
3. Vor jedem neuen Song (Songende, Überspringen, Fehler): `naechster` abfragen.
   Offener Gästewunsch vorhanden → ältester zuerst, wird dabei im Sheet auf `gespielt`
   gesetzt. Sonst nächster Song der gemischten Playlist.
4. Die Warteschlangen-Anzeige wird alle ~5 Sekunden über `warteschlange` aktualisiert.
5. Screen Wake Lock API hält den Bildschirm wach (wo unterstützt; erneutes Anfordern nach
   Sichtbarkeitswechsel).

**Fehlerbehandlung**
- Player-Fehler (z. B. 2, 5, 100, 101, 150 – ungültig, gesperrt, nicht einbettbar):
  automatisch zum nächsten Song; war es ein Gästewunsch, Status `Fehler`.
- Apps Script nicht erreichbar: weiter mit der Playlist, nächster Versuch beim nächsten Song /
  nächsten Poll. Dezente Statusanzeige „Verbindung zum Wunsch-Server unterbrochen“.
- Playlist lässt sich nicht laden (privat/falsche ID): klare Fehlermeldung auf dem Startbildschirm.

**Werbung**: Ringko hat YouTube Premium; der eingebettete Player erkennt das in der Regel bei
Anmeldung im selben Browser. Safari/iPad blockiert ggf. Drittanbieter-Cookies → vor der Party testen.

## Google Sheet

Tabellenblatt `Wuensche`, Kopfzeile:

| Zeit | VideoId | Titel | Name | Status |
|---|---|---|---|---|

Status: `offen` → `gespielt` | `Fehler`. Manuelles Entfernen eines Wunsches: Status auf
`gespielt` setzen. Das Script legt das Blatt samt Kopfzeile an, falls es fehlt.

## Apps Script API

Ein Endpunkt (Web-App-URL), Aktion über Parameter `action`:

| Aktion | Methode | Eingabe | Ausgabe |
|---|---|---|---|
| `suche` | GET | `q` | bis zu 5 Treffer `{videoId, titel, kanal, thumbnail}` (nur einbettbare Videos, `videoEmbeddable=true`) |
| `info` | GET | `videoId` | `{videoId, titel, kanal, thumbnail}` oder Fehler „Video nicht gefunden“ |
| `warteschlange` | GET | – | offene Wünsche in Reihenfolge `{videoId, titel, name, zeit}` |
| `wuenschen` | POST | `{videoId, name}` | `{platz, duplikat: bool}`; Titel holt das Script selbst über die YouTube-API (keine Titel vom Client übernehmen) |
| `naechster` | POST | – | ältester offener Wunsch (wird auf `gespielt` gesetzt) oder `null` |
| `fehler` | POST | `{videoId}` | setzt den zuletzt gespielten Eintrag dieser Video-ID auf `Fehler` |

- YouTube-Suche über den Apps-Script-Dienst „YouTube Data API v3“ (Ausführung als Ringko,
  kein API-Schlüssel im Frontend). Kontingent ca. 100 Suchen/Tag – reicht für eine Party.
- `LockService` um alle schreibenden Aktionen.
- Eingaben validieren: Video-ID per Regex `^[A-Za-z0-9_-]{11}$`, Name gekürzt (30 Zeichen),
  Suchtext gekürzt (100 Zeichen). Frontend fügt alle Texte nur per `textContent` ein (kein `innerHTML` mit Nutzerdaten).
- Antwortformat: `{ok: true, data: ...}` bzw. `{ok: false, fehler: "..."}`.

## Repo-Struktur

```
index.html          Wunschseite
player.html         Abspielseite
css/style.css       gemeinsames Styling
js/config.js        Apps-Script-URL, Playlist-ID
js/api.js           fetch-Wrapper für das Apps Script
js/youtube.js       Link-Erkennung / Video-ID-Extraktion (rein, testbar)
js/queue.js         Logik „Wunsch vor Playlist“, Mischen (rein, testbar)
js/wish.js          Wunschseiten-UI
js/player.js        Abspielseiten-UI, IFrame-API
apps-script/Code.gs  Web-App (doGet/doPost, Sheet, YouTube) zum Einfügen in Apps Script
apps-script/Logik.gs reine Logik (Validierung, Warteschlange), mit Node getestet
tests/              automatische Tests
```

## Tests

- Automatische Tests (Node, eingebauter Test-Runner `node --test`, keine Abhängigkeiten) für:
  Video-ID-Extraktion aus allen Link-Varianten, Erkennung Link vs. Text, Mischen,
  Auswahl nächster Song (Wunsch vor Playlist, Neumischen am Listenende).
- Apps-Script-Logik (Duplikat, Platzberechnung, `naechster`) als reine Funktionen in
  `Code.gs` gekapselt und ebenfalls mit Node getestet.
- Abschließend gemeinsamer End-to-End-Test im Browser nach der Einrichtung.

## Einrichtung

Nicht im README. Ringko und Claude gehen die Einrichtung im Chat Schritt für Schritt gemeinsam durch:
Google Sheet anlegen → Apps Script einfügen → YouTube-Dienst aktivieren → als Web-App
bereitstellen (Zugriff „Jeder“, ausführen als „Ich“) → URL + Playlist-ID in `config.js` →
GitHub Pages aktivieren → Test (inkl. Werbung/Premium auf dem Tablet).

Voraussetzung: Die YouTube-Playlist ist öffentlich oder „nicht gelistet“.
