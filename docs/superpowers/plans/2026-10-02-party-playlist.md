# Party-Playlist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gäste wünschen per Handy Songs (YouTube-Link oder Suche), eine Abspielseite spielt Wünsche bevorzugt (FIFO) und sonst Ringkos YouTube-Playlist zufällig.

**Architecture:** Zwei statische Seiten auf GitHub Pages (plain HTML/CSS/ES-Module, kein Build). Backend ist eine Google-Apps-Script-Web-App über einem Google Sheet; sie übernimmt auch die YouTube-Suche. Reine Logik liegt in kleinen, mit Node getesteten Modulen; die Apps-Script-Logik in `Logik.gs` wird in Node per `node:vm` geladen und getestet.

**Tech Stack:** HTML, CSS, JavaScript (ES-Module), YouTube IFrame Player API, Google Apps Script (V8) mit erweitertem Dienst „YouTube Data API v3“, qrcodejs 1.0.0 von cdnjs, Node 24 `node --test` (keine npm-Abhängigkeiten).

**Spec:** `docs/superpowers/specs/2026-10-02-party-playlist-design.md`

## Global Constraints

- Kein eigener Server, keine Kosten; Hosting GitHub Pages, Backend Apps Script + Google Sheet.
- Keine npm-Abhängigkeiten, kein Build-Schritt. `package.json` nur mit `"type": "module"` und `"test": "node --test"`.
- Alle Oberflächentexte auf Deutsch.
- Farben (CSS-Variablen in `css/style.css`): `--bg #0b0b33`, `--bg-2 #12123f`, `--line #26265e`, `--text #ececff`, `--muted #a3a3cc`, `--accent #4a4aff`. Schrift `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. Karten-Radius 12–14px.
- Footer auf beiden Seiten: „made by ringko.tv“ → `https://ringko.tv`. Logo per URL `https://ringko.tv/logo.png` (kein Download).
- Nutzerdaten (Titel, Namen, Kanäle) nur per `textContent` / Attribut-Setter ins DOM, nie per `innerHTML`.
- Apps-Script-Antworten: `{ok: true, data}` bzw. `{ok: false, fehler: "<deutscher Text>"}`.
- POST-Requests mit `Content-Type: text/plain;charset=utf-8` (kein CORS-Preflight).
- Video-ID-Format: `^[A-Za-z0-9_-]{11}$`. Name max. 30 Zeichen, Suchtext max. 100 Zeichen.
- Sheet-Blatt `Wuensche`, Spalten `Zeit | VideoId | Titel | Name | Status`; Status `offen` | `gespielt` | `Fehler`.
- Polling der Warteschlange auf der Abspielseite alle 5000 ms.
- Einrichtung (Sheet, Script, Deploy, Pages) wird NICHT ins README geschrieben, sondern im Chat mit Ringko Schritt für Schritt durchgegangen.
- Push zu GitHub nur nach ausdrücklicher Zustimmung von Ringko.

## Review Focus

1. YouTube-Links mit Zusatzparametern (`&list=…&t=30s`, `?si=…`, `m.youtube.com`, `music.youtube.com`, Shorts) → richtige Video-ID. Test in Task 1.
2. Eingabe, die nach YouTube aussieht, aber keine gültige ID hat (`youtube.com/channel/…`, Playlist-Link ohne `v=`) → klare Meldung statt Suche nach der URL. Test in Task 1.
3. Derselbe Song wurde schon gespielt und wird erneut gewünscht → ist erlaubt; nur *offene* Duplikate werden abgelehnt. Test in Task 3.
4. Name mit HTML/Steuerzeichen oder zu lang (`<b>Lisa</b>\n` × 10) → gekürzt auf 30, Steuerzeichen entfernt, Anzeige nur als Text. Test in Task 3.
5. Playlist ist durch und wird neu gemischt → der zuletzt gespielte Song kommt nicht sofort noch einmal (bei ≥ 2 Songs). Test in Task 2.

---

### Task 1: Projektgrundlage + YouTube-Eingabeerkennung

**Files:**
- Create: `package.json`
- Create: `js/youtube.js`
- Test: `tests/youtube.test.js`

**Interfaces:**
- Produces:
  - `extractVideoId(input: string): string | null`
  - `classifyInput(input: string): {type: 'empty'} | {type: 'link', videoId: string} | {type: 'invalid-link'} | {type: 'search', query: string}`
  - `thumbnailUrl(videoId: string): string` → `https://i.ytimg.com/vi/<id>/mqdefault.jpg`

- [ ] **Step 1: `package.json` anlegen**

```json
{ "name": "party-playlist", "private": true, "type": "module", "scripts": { "test": "node --test" } }
```

- [ ] **Step 2: Failing tests schreiben** (`tests/youtube.test.js`, `node:test` + `node:assert/strict`)

```js
const ID = 'dQw4w9WgXcQ';
test('extractVideoId erkennt Link-Varianten', () => {
  for (const url of [
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&list=PLabc&t=30s`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}&si=xyz`,
    `https://youtu.be/${ID}?si=abc`,
    `https://www.youtube.com/shorts/${ID}`,
    `  youtu.be/${ID}  `,
  ]) assert.equal(extractVideoId(url), ID, url);
});
test('extractVideoId liefert null ohne gültige ID', () => {
  assert.equal(extractVideoId('https://www.youtube.com/channel/UC123'), null);
  assert.equal(extractVideoId('https://www.youtube.com/playlist?list=PLabc'), null);
  assert.equal(extractVideoId('Bohemian Rhapsody Queen'), null);
});
test('classifyInput', () => {
  assert.deepEqual(classifyInput('   '), { type: 'empty' });
  assert.deepEqual(classifyInput(`youtu.be/${ID}`), { type: 'link', videoId: ID });
  assert.deepEqual(classifyInput('https://www.youtube.com/channel/UC123'), { type: 'invalid-link' });
  assert.deepEqual(classifyInput('  Queen   Bohemian Rhapsody '), { type: 'search', query: 'Queen Bohemian Rhapsody' });
});
test('thumbnailUrl', () => {
  assert.equal(thumbnailUrl(ID), `https://i.ytimg.com/vi/${ID}/mqdefault.jpg`);
});
```

- [ ] **Step 3: Tests laufen lassen** — `npm test` → FAIL (Modul fehlt).
- [ ] **Step 4: `js/youtube.js` implementieren.** Ohne Protokoll `https://` voranstellen und mit `new URL` parsen; Hosts `youtube.com`, `www.`, `m.`, `music.`, `youtu.be`. Als Link gilt jede Eingabe, die `youtube.com` oder `youtu.be` enthält. Suchtext: Whitespace zusammenfassen und trimmen.
- [ ] **Step 5: Tests laufen lassen** — `npm test` → PASS.
- [ ] **Step 6: Commit** — `git add package.json js/youtube.js tests/youtube.test.js` → `git commit -m "feat: YouTube-Eingabeerkennung"`

---

### Task 2: Abspiel-Logik (Mischen, Wunsch vor Playlist)

**Files:**
- Create: `js/queue.js`
- Test: `tests/queue.test.js`

**Interfaces:**
- Produces:
  - `shuffle<T>(items: T[], rng = Math.random): T[]` — neue Liste, Fisher-Yates, Original unverändert.
  - `class PlaylistCursor { constructor(videoIds: string[], rng = Math.random); next(): string | null; get size(): number }` — gibt die gemischte Liste nacheinander aus; am Ende neu mischen; bei `size >= 2` ist das erste Element nach dem Neumischen nie gleich dem zuletzt ausgegebenen (dann das erste mit dem zweiten tauschen). Leere Liste → `null`.
  - `chooseNext(wish: {videoId, titel, name} | null, cursor: PlaylistCursor): {source: 'wunsch', videoId, titel, name} | {source: 'playlist', videoId} | null`

- [ ] **Step 1: Failing tests schreiben** (deterministischer RNG, z. B. Mulberry32 mit Seed im Test)

```js
test('shuffle behält alle Elemente und ändert Original nicht', () => {
  const a = ['a','b','c','d','e']; const s = shuffle(a, seeded(1));
  assert.deepEqual([...s].sort(), a); assert.deepEqual(a, ['a','b','c','d','e']);
});
test('PlaylistCursor gibt jede ID einmal pro Runde aus', () => {
  const c = new PlaylistCursor(['a','b','c'], seeded(2));
  assert.deepEqual([c.next(), c.next(), c.next()].sort(), ['a','b','c']);
});
test('nach Neumischen kommt der letzte Song nicht direkt wieder', () => {
  for (let seed = 0; seed < 200; seed++) {
    const c = new PlaylistCursor(['a','b','c'], seeded(seed));
    const runde1 = [c.next(), c.next(), c.next()];
    assert.notEqual(c.next(), runde1[2], `seed ${seed}`);
  }
});
test('PlaylistCursor mit einem bzw. keinem Song', () => {
  const eins = new PlaylistCursor(['a']); assert.equal(eins.next(), 'a'); assert.equal(eins.next(), 'a');
  assert.equal(new PlaylistCursor([]).next(), null);
});
test('chooseNext: Wunsch vor Playlist', () => {
  const c = new PlaylistCursor(['p1']);
  const w = { videoId: 'w1xxxxxxxxx', titel: 'T', name: 'Lisa' };
  assert.deepEqual(chooseNext(w, c), { source: 'wunsch', ...w });
  assert.deepEqual(chooseNext(null, c), { source: 'playlist', videoId: 'p1' });
  assert.equal(chooseNext(null, new PlaylistCursor([])), null);
});
```

- [ ] **Step 2: Tests laufen lassen** — `npm test` → FAIL.
- [ ] **Step 3: `js/queue.js` implementieren.**
- [ ] **Step 4: Tests laufen lassen** — `npm test` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: Abspiel-Logik mit Mischen und Wunsch-Vorrang"`

---

### Task 3: Apps-Script-Logik (rein, testbar)

**Files:**
- Create: `apps-script/Logik.gs`
- Create: `tests/helpers/load-gs.js`
- Test: `tests/logik.test.js`

**Interfaces:**
- Produces (globale Funktionen in `Logik.gs`, Zeilen = Sheet-Werte ohne Kopfzeile, Spaltenreihenfolge `[zeit, videoId, titel, name, status]`):
  - `istGueltigeVideoId(id): boolean`
  - `bereinigeName(name): string` — `String(name ?? '')`, Steuerzeichen (`\p{Cc}`) entfernen, Whitespace zusammenfassen, trimmen, auf 30 Zeichen kürzen.
  - `bereinigeSuche(q): string` — wie oben, max. 100 Zeichen.
  - `offeneWuensche(rows): Array<{zeile: number, zeit: string, videoId, titel, name}>` — nur Status `offen`, in Sheet-Reihenfolge; `zeile` = Sheet-Zeilennummer (`index + 2`); `zeit` als ISO-String.
  - `platzVon(rows, videoId): number` — 1-basierter Platz unter den offenen Wünschen, `0` wenn nicht offen.
  - `letzteZeileMitStatus(rows, videoId, status): number` — Sheet-Zeilennummer des letzten Eintrags mit dieser ID und diesem Status, `0` wenn keiner.
- `tests/helpers/load-gs.js`: `loadGs(...paths: string[]): object` — liest die Dateien, führt sie mit `vm.runInNewContext` in einem gemeinsamen Kontext aus und gibt den Kontext zurück.

- [ ] **Step 1: Failing tests schreiben**

```js
const L = loadGs('apps-script/Logik.gs');
const rows = [
  [new Date('2026-10-09T20:00:00Z'), 'aaaaaaaaaaa', 'A', 'Lisa', 'gespielt'],
  [new Date('2026-10-09T20:01:00Z'), 'bbbbbbbbbbb', 'B', '',     'offen'],
  [new Date('2026-10-09T20:02:00Z'), 'ccccccccccc', 'C', 'Tom',  'offen'],
];
test('istGueltigeVideoId', () => {
  assert.equal(L.istGueltigeVideoId('dQw4w9WgXcQ'), true);
  for (const x of ['', 'kurz', 'dQw4w9WgXcQx', 'dQw4w9WgXc!', null]) assert.equal(L.istGueltigeVideoId(x), false);
});
test('bereinigeName kürzt und entfernt Steuerzeichen', () => {
  assert.equal(L.bereinigeName('  Li\nsa  '), 'Li sa');
  assert.equal(L.bereinigeName('<b>Lisa</b>'.repeat(10)).length, 30);
  assert.equal(L.bereinigeName(undefined), '');
});
test('bereinigeSuche kürzt auf 100', () => {
  assert.equal(L.bereinigeSuche('x'.repeat(150)).length, 100);
});
test('offeneWuensche in Reihenfolge mit Zeilennummer', () => {
  const o = L.offeneWuensche(rows);
  assert.deepEqual(o.map(w => [w.zeile, w.videoId, w.name]), [[3, 'bbbbbbbbbbb', ''], [4, 'ccccccccccc', 'Tom']]);
  assert.equal(o[0].zeit, '2026-10-09T20:01:00.000Z');
});
test('platzVon: nur offene zählen; gespielte dürfen erneut gewünscht werden', () => {
  assert.equal(L.platzVon(rows, 'ccccccccccc'), 2);
  assert.equal(L.platzVon(rows, 'aaaaaaaaaaa'), 0);
});
test('letzteZeileMitStatus', () => {
  assert.equal(L.letzteZeileMitStatus(rows, 'aaaaaaaaaaa', 'gespielt'), 2);
  assert.equal(L.letzteZeileMitStatus(rows, 'bbbbbbbbbbb', 'gespielt'), 0);
});
```

- [ ] **Step 2: Tests laufen lassen** — `npm test` → FAIL.
- [ ] **Step 3: `Logik.gs` + `load-gs.js` implementieren** (V8-kompatibel, keine `import`/`export` in `.gs`).
- [ ] **Step 4: Tests laufen lassen** — `npm test` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: reine Apps-Script-Logik mit Tests"`

---

### Task 4: Apps-Script-Web-App + gemeinsame Einrichtung (Teil 1)

**Files:**
- Create: `apps-script/Code.gs`
- Test: `tests/code.test.js`

**Interfaces:**
- Consumes: alle Funktionen aus `Logik.gs` (Task 3).
- Produces: Web-App mit `doGet(e)` / `doPost(e)`; Aktionen laut Spec-Tabelle:
  - GET `?action=suche&q=` → `data: [{videoId, titel, kanal, thumbnail}]` (max. 5; `YouTube.Search.list('snippet', {q, type: 'video', videoEmbeddable: 'true', maxResults: 5})`)
  - GET `?action=info&videoId=` → `data: {videoId, titel, kanal, thumbnail}`; `YouTube.Videos.list('snippet,status', {id})`; nicht gefunden → `fehler: 'Video nicht gefunden'`; `status.embeddable === false` → `fehler: 'Dieses Video darf nicht auf anderen Seiten abgespielt werden'`.
  - GET `?action=warteschlange` → `data: offeneWuensche(...)` ohne `zeile`.
  - POST `{action:'wuenschen', videoId, name}` → validieren, Titel per `info` holen, unter Lock: `platzVon` > 0 → `{platz, duplikat: true}`, sonst Zeile `[new Date(), videoId, titel, name, 'offen']` anhängen → `{platz, duplikat: false}`.
  - POST `{action:'naechster'}` → unter Lock ersten offenen Wunsch auf `gespielt` setzen, `data: {videoId, titel, name} | null`.
  - POST `{action:'fehler', videoId}` → unter Lock `letzteZeileMitStatus(rows, videoId, 'gespielt')` auf `Fehler` setzen.
  - Unbekannte Aktion → `fehler: 'Unbekannte Aktion'`; jede Exception → `{ok:false, fehler: 'Serverfehler: ' + message}`.
  - Hilfsfunktionen: `blatt_()` (legt `Wuensche` mit Kopfzeile an, falls fehlend), `zeilen_()` (Werte ohne Kopfzeile), `json_(obj)` (`ContentService…setMimeType(JSON)`), `mitLock_(fn)` (`LockService.getScriptLock().waitLock(10000)`, `finally releaseLock`).

- [ ] **Step 1: Failing test schreiben** — `tests/code.test.js` lädt `Logik.gs` + `Code.gs` per `loadGs` mit Fakes für `SpreadsheetApp` (In-Memory-Blatt mit `getDataRange().getValues()`, `appendRow`, `getRange(r,c).setValue`), `LockService`, `ContentService` (gibt den String zurück) und `YouTube`. Tests:
  - `wuenschen` legt Zeile an und liefert `{platz: 1, duplikat: false}`; zweiter gleicher Wunsch → `{platz: 1, duplikat: true}`, Blatt hat weiterhin 1 Datenzeile.
  - `wuenschen` mit ungültiger ID → `ok: false`.
  - `naechster` zweimal mit zwei Wünschen → FIFO, danach `data: null`; Status-Spalte `gespielt`.
  - `fehler` setzt den gespielten Eintrag auf `Fehler`.
  - `info` mit `embeddable: false` → `ok: false`.
- [ ] **Step 2: Test laufen lassen** — `npm test` → FAIL.
- [ ] **Step 3: `Code.gs` implementieren.**
- [ ] **Step 4: Test laufen lassen** — `npm test` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: Apps-Script-Web-App"`
- [ ] **Step 6: Einrichtung mit Ringko im Chat (Schritt für Schritt, je ein Schritt pro Nachricht, auf Rückmeldung warten):**
  1. Neues Google Sheet „Party-Playlist“ anlegen.
  2. *Erweiterungen → Apps Script*; Dateien `Logik.gs` und `Code.gs` anlegen und Inhalte einfügen; speichern.
  3. *Dienste (+) → YouTube Data API v3* hinzufügen (Kennung `YouTube`).
  4. *Bereitstellen → Neue Bereitstellung → Web-App*, ausführen als „Ich“, Zugriff „Jeder“; Berechtigungen erlauben.
  5. Web-App-URL in den Chat geben lassen.
  6. YouTube-Playlist-Link geben lassen (öffentlich oder „nicht gelistet“).
- [ ] **Step 7: Verifizieren** — im Browser `<URL>?action=suche&q=queen bohemian rhapsody` → `{"ok":true,"data":[…5 Treffer…]}`; `?action=warteschlange` → `{"ok":true,"data":[]}`.

---

### Task 5: Konfiguration + API-Client

**Files:**
- Create: `js/config.js`
- Create: `js/api.js`
- Test: `tests/api.test.js`

**Interfaces:**
- Produces:
  - `js/config.js`: `export const APPS_SCRIPT_URL = '<aus Task 4>'; export const PLAYLIST_ID = '<aus Task 4>';`
  - `class ApiError extends Error`
  - `createApi(baseUrl: string, fetchFn = globalThis.fetch.bind(globalThis))` → `{ suche(q), info(videoId), warteschlange(), wuenschen(videoId, name), naechster(), fehler(videoId) }`, jeweils `Promise<data>`; wirft `ApiError` mit `fehler`-Text bei `ok:false` und `ApiError('Gerade keine Verbindung – versuch\'s gleich nochmal')` bei Netzwerkfehler / nicht-JSON.
  - GET: `${baseUrl}?action=<a>&<params per URLSearchParams>`; POST: `fetch(baseUrl, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify({action, ...})})`.

- [ ] **Step 1: Failing tests schreiben** mit Fake-`fetchFn`, das Aufrufe aufzeichnet:
  - `suche('a b')` ruft `…?action=suche&q=a+b` per GET auf und liefert `data`.
  - `wuenschen('dQw4w9WgXcQ','Lisa')` sendet POST mit Body `{"action":"wuenschen","videoId":"dQw4w9WgXcQ","name":"Lisa"}` und Header `text/plain;charset=utf-8`.
  - `{ok:false, fehler:'Video nicht gefunden'}` → `ApiError` mit genau dieser Nachricht.
  - `fetchFn` wirft → `ApiError` mit Verbindungs-Text.
- [ ] **Step 2: Tests laufen lassen** — FAIL.
- [ ] **Step 3: `api.js` und `config.js` implementieren.**
- [ ] **Step 4: Tests laufen lassen** — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: API-Client und Konfiguration"`

---

### Task 6: Wunschseite

**Files:**
- Create: `index.html`
- Create: `css/style.css`
- Create: `js/wish.js`

**Interfaces:**
- Consumes: `classifyInput`, `thumbnailUrl` (Task 1); `createApi`, `ApiError`, `APPS_SCRIPT_URL` (Task 5).

- [ ] **Step 1: `css/style.css`** — Farbtokens aus Global Constraints auf `:root`, `body` mit `background: var(--bg)`; Karten, Buttons (Akzent `--accent`), Eingabefelder, Trefferliste, Footer; mobil zuerst, 16px Seitenabstand, keine horizontale Scrollbar. Wird in Task 7 mitbenutzt.
- [ ] **Step 2: `index.html`** — Logo `https://ringko.tv/logo.png`, Überschrift „Wünsch dir einen Song“, Eingabefeld (Placeholder „YouTube-Link oder Titel und Interpret“), Button „Los“, Namensfeld „Dein Name (optional)“ (`maxlength=30`), Bereich für Vorschau/Treffer, Meldungsbereich (`aria-live="polite"`), Liste „Als Nächstes“, Footer. `<script type="module" src="js/wish.js">`.
- [ ] **Step 3: `js/wish.js`**
  - Name in `localStorage` (`party-name`), Zugriff in try/catch.
  - Absenden: `classifyInput` → `empty`: nichts; `invalid-link`: „Das ist kein Link zu einem YouTube-Video“; `link`: `api.info` → eine Vorschaukarte mit Button „Wünschen“; `search`: `api.suche` → bis zu 5 Karten (Thumbnail, Titel, Kanal), Antippen = wünschen; 0 Treffer → „Nichts gefunden – versuch's anders“.
  - Wünschen: `api.wuenschen(videoId, name)` → „Dein Song ist auf Platz X der Warteschlange 🎉“ bzw. bei `duplikat` „Ist schon drin – auf Platz X“; Eingabe und Treffer leeren; Liste neu laden.
  - Während Requests Buttons deaktivieren (kein Doppelabsenden); `ApiError.message` als Meldung anzeigen.
  - Liste „Als Nächstes“: `api.warteschlange()` beim Laden und alle 15 s, max. 5 Einträge „Titel – Name“.
  - Alles DOM per `createElement`/`textContent`.
- [ ] **Step 4: Verifizieren im Browser** — `.claude/launch.json` mit statischem Server (`npx --yes http-server -p 8080 -c-1` oder `python -m http.server 8080`, was verfügbar ist) anlegen, `preview_start`; mit Mobil-Viewport (375px) prüfen:
  - Suche „queen bohemian rhapsody“ → Treffer mit Bildern; Antippen → Platz-Meldung; Zeile im Sheet mit Status `offen`.
  - Gleichen Song nochmal → „Ist schon drin“.
  - Link `https://youtu.be/dQw4w9WgXcQ?si=x` → Vorschau, Wünschen funktioniert.
  - `https://www.youtube.com/channel/abc` → Fehlermeldung.
  - Keine Konsolenfehler, kein horizontales Scrollen.
  - Danach Test-Einträge im Sheet auf `gespielt` setzen (Ringko oder via `naechster`).
- [ ] **Step 5: Commit** — `git commit -m "feat: Wunschseite"`

---

### Task 7: Abspielseite

**Files:**
- Create: `player.html`
- Create: `js/player.js`
- Modify: `css/style.css` (Player-Layout)

**Interfaces:**
- Consumes: `PlaylistCursor`, `chooseNext` (Task 2); `createApi`, `APPS_SCRIPT_URL`, `PLAYLIST_ID` (Task 5); `thumbnailUrl` (Task 1).

- [ ] **Step 1: `player.html`** — Startbildschirm mit Button „Party starten“; danach Layout: Player-Container (16:9), „Jetzt läuft“-Zeile + „🎤 gewünscht von …“, Bedienleiste (Pause/Play, Überspringen, Vollbild – permanent sichtbar, mind. 48px Touch-Ziele), Warteschlange, QR-Code-Box „Song wünschen? Scan mich!“, Statuszeile für Verbindungsprobleme, Footer. Scripts: `https://www.youtube.com/iframe_api`, `https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js`, `js/player.js` als Modul.
- [ ] **Step 2: CSS** — Querformat (`min-width: 900px` oder `orientation: landscape` mit ausreichender Breite): Grid Player links (~2fr) / Seitenleiste rechts (~1fr); sonst untereinander.
- [ ] **Step 3: `js/player.js`**
  - QR-Code: Ziel = `new URL('index.html', location.href)`, weiß auf hellem Untergrund (Kontrast für Scanner).
  - Nach „Party starten“: `YT.Player` mit `playerVars: {listType: 'playlist', list: PLAYLIST_ID, playsinline: 1}`; im ersten `onStateChange`/`onReady` `getPlaylist()` lesen (ggf. kurz bis zu 5 s auf nicht-leeres Ergebnis warten), `new PlaylistCursor(ids)`, dann `spieleNaechsten()`. Leere Liste → Meldung „Playlist konnte nicht geladen werden – ist sie öffentlich oder nicht gelistet?“.
  - `spieleNaechsten()`: `api.naechster()` (bei `ApiError` → `null` + Statuszeile), `chooseNext(wunsch, cursor)`, `player.loadVideoById(videoId)`, „Jetzt läuft“ setzen (Wunsch: Titel aus Sheet + Name; Playlist: Titel aus `player.getVideoData().title` sobald verfügbar), Warteschlange sofort aktualisieren.
  - `onStateChange` `ENDED` → `spieleNaechsten()`. `onError` → war es ein Wunsch: `api.fehler(videoId)` (Fehler ignorieren), dann `spieleNaechsten()`.
  - Doppelauslösung verhindern (Flag während `spieleNaechsten` läuft).
  - Überspringen → `spieleNaechsten()`; Pause/Play toggelt; Vollbild per `document.documentElement.requestFullscreen()` (Button ausblenden, wenn nicht unterstützt).
  - Polling `api.warteschlange()` alle 5000 ms → Liste (Platz, Thumbnail, Titel, Name) bzw. „Keine Wünsche – zufällige Songs aus der Playlist“; Fehler → Statuszeile „Verbindung zum Wunsch-Server unterbrochen“, bei Erfolg wieder ausblenden.
  - Wake Lock: `navigator.wakeLock?.request('screen')` nach Start und bei `visibilitychange` → sichtbar erneut anfordern; Fehler ignorieren.
- [ ] **Step 4: Verifizieren im Browser** (Preview aus Task 6):
  - Start → zufälliger Song aus der Playlist läuft; Titel wird angezeigt. Anzahl `getPlaylist()`-IDs mit Playlist-Länge vergleichen; hat die Playlist > 200 Songs und es fehlen IDs → Ringko informieren und Fallback (Apps-Script-Aktion `playlist` über `YouTube.PlaylistItems.list`) als Zusatz-Task einplanen.
  - In zweitem Tab auf der Wunschseite einen Song wünschen → erscheint innerhalb ~5 s in der Warteschlange; Überspringen → Wunsch läuft mit „gewünscht von …“; im Sheet `gespielt`.
  - Zwei Wünsche → laufen in Eingangsreihenfolge; danach wieder Playlist.
  - Viewport Tablet hoch/quer prüfen; Bedienknöpfe sichtbar; QR-Code scannbar (Screenshot).
  - Keine Konsolenfehler außer YouTube-eigenen.
- [ ] **Step 5: Commit** — `git commit -m "feat: Abspielseite"`

---

### Task 8: Veröffentlichen + Abnahme (Einrichtung Teil 2)

**Files:**
- Modify: `README.md` (kurze Projektbeschreibung, Links zu Wunsch- und Abspielseite, `npm test`; KEINE Einrichtungsanleitung)

- [ ] **Step 1: README aktualisieren und committen** — `git commit -m "docs: README"`
- [ ] **Step 2: Ringko um Zustimmung zum Push fragen**, dann `git push origin main`.
- [ ] **Step 3: Mit Ringko im Chat GitHub Pages einschalten** — *Settings → Pages → Source: Deploy from a branch → main / (root) → Save*; nach 1–2 Minuten `https://ringko1988.github.io/Party-Playlist/` öffnen.
- [ ] **Step 4: Abnahme live** — Wunschseite und Abspielseite über die Pages-URL erneut wie in Task 6/7 testen; QR-Code zeigt auf die Pages-URL. Ringko testet mit dem Handy (Scan, Wunsch) und auf dem Tablet (Abspielen, Knöpfe, Werbung trotz Premium? – bei Safari ggf. „Websiteübergreifendes Tracking verhindern“ als Ursache nennen).
- [ ] **Step 5: Test-Einträge im Sheet aufräumen** (Ringko löscht die Zeilen unter der Kopfzeile).
