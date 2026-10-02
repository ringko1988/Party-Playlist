import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGs } from './helpers/load-gs.js';

const ID1 = 'dQw4w9WgXcQ';
const ID2 = 'fJ9rUzIMcZQ';

// In-Memory-Nachbau der benötigten Google-Dienste
function fakes({ videos = {} } = {}) {
  const sheets = {};
  const makeSheet = () => {
    const data = [];
    const formulas = [];
    // Wie Google Sheets: führendes ' markiert Text und wird nicht gespeichert;
    // ungeschützte Werte mit = + - @ würden als Formel gelesen
    const zelle = (v) => {
      if (typeof v !== 'string') return v;
      if (v.startsWith("'")) return v.slice(1);
      if (/^[=+\-@]/.test(v)) { formulas.push(v); return '#ERROR!'; }
      return v;
    };
    return {
      data,
      formulas,
      appendRow: (row) => data.push(row.map(zelle)),
      getDataRange: () => ({ getValues: () => data.map((r) => [...r]) }),
      getRange: (r, c) => ({
        setValue: (v) => { data[r - 1][c - 1] = zelle(v); },
        setNumberFormat: () => {},
      }),
      setFrozenRows: () => {},
    };
  };
  const ss = {
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = makeSheet()),
  };
  const videoItem = (id) => ({
    id,
    snippet: { title: videos[id].titel, channelTitle: 'Kanal', thumbnails: { medium: { url: `thumb-${id}` } } },
    status: { embeddable: videos[id].embeddable !== false },
  });
  return {
    sheets,
    globals: {
      SpreadsheetApp: { getActiveSpreadsheet: () => ss },
      LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
      ContentService: { createTextOutput: (s) => ({ setMimeType: () => s }), MimeType: { JSON: 'json' } },
      YouTube: {
        Videos: { list: (_part, { id }) => ({ items: videos[id] ? [videoItem(id)] : [] }) },
        Search: {
          list: (_part, opts) => ({
            items: Object.keys(videos).map((id) => ({
              id: { videoId: id },
              snippet: { title: videos[id].titel, channelTitle: 'Kanal', thumbnails: { medium: { url: `thumb-${id}` } } },
              _opts: opts,
            })),
          }),
        },
      },
    },
  };
}

function setup(videos = { [ID1]: { titel: 'Song Eins' }, [ID2]: { titel: 'Song Zwei' } }) {
  const f = fakes({ videos });
  const app = loadGs(['apps-script/Logik.gs', 'apps-script/Code.gs'], f.globals);
  const post = (body) => JSON.parse(app.doPost({ postData: { contents: JSON.stringify(body) } }));
  const get = (parameter) => JSON.parse(app.doGet({ parameter }));
  const datenzeilen = () => f.sheets.Wuensche.data.slice(1);
  return { post, get, datenzeilen, sheets: f.sheets };
}

test('wuenschen legt Zeile an; gleicher offener Wunsch wird nicht doppelt angelegt', () => {
  const { post, datenzeilen } = setup();
  assert.deepEqual(post({ action: 'wuenschen', videoId: ID1, name: ' Lisa ' }), { ok: true, data: { platz: 1, duplikat: false } });
  assert.deepEqual(post({ action: 'wuenschen', videoId: ID1, name: 'Tom' }), { ok: true, data: { platz: 1, duplikat: true } });
  assert.equal(datenzeilen().length, 1);
  assert.deepEqual(datenzeilen()[0].slice(1), [ID1, 'Song Eins', 'Lisa', 'offen']);
});

test('wuenschen mit ungültiger ID wird abgelehnt', () => {
  const { post } = setup();
  const r = post({ action: 'wuenschen', videoId: 'kaputt', name: '' });
  assert.equal(r.ok, false);
  assert.equal(typeof r.fehler, 'string');
});

test('naechster liefert Wünsche in Eingangsreihenfolge und markiert sie gespielt', () => {
  const { post, datenzeilen } = setup();
  post({ action: 'wuenschen', videoId: ID1, name: 'Lisa' });
  post({ action: 'wuenschen', videoId: ID2, name: '' });
  assert.deepEqual(post({ action: 'naechster' }).data, { videoId: ID1, titel: 'Song Eins', name: 'Lisa' });
  assert.deepEqual(post({ action: 'naechster' }).data, { videoId: ID2, titel: 'Song Zwei', name: '' });
  assert.deepEqual(post({ action: 'naechster' }), { ok: true, data: null });
  assert.deepEqual(datenzeilen().map((r) => r[4]), ['gespielt', 'gespielt']);
});

test('gespielter Song darf erneut gewünscht werden', () => {
  const { post, datenzeilen } = setup();
  post({ action: 'wuenschen', videoId: ID1, name: '' });
  post({ action: 'naechster' });
  assert.deepEqual(post({ action: 'wuenschen', videoId: ID1, name: '' }).data, { platz: 1, duplikat: false });
  assert.equal(datenzeilen().length, 2);
});

test('fehler setzt den gespielten Eintrag auf Fehler', () => {
  const { post, datenzeilen } = setup();
  post({ action: 'wuenschen', videoId: ID1, name: '' });
  post({ action: 'naechster' });
  assert.equal(post({ action: 'fehler', videoId: ID1 }).ok, true);
  assert.equal(datenzeilen()[0][4], 'Fehler');
});

test('warteschlange liefert offene Wünsche ohne Zeilennummer', () => {
  const { post, get } = setup();
  post({ action: 'wuenschen', videoId: ID1, name: 'Lisa' });
  const r = get({ action: 'warteschlange' });
  assert.equal(r.ok, true);
  assert.equal(r.data.length, 1);
  assert.equal(r.data[0].zeile, undefined);
  assert.equal(r.data[0].titel, 'Song Eins');
});

test('info: nicht einbettbares Video wird abgelehnt, unbekanntes ebenso', () => {
  const { get } = setup({ [ID1]: { titel: 'Gesperrt', embeddable: false } });
  assert.equal(get({ action: 'info', videoId: ID1 }).ok, false);
  assert.equal(get({ action: 'info', videoId: ID2 }).fehler, 'Video nicht gefunden');
});

test('suche liefert Treffer mit dekodierten Titeln', () => {
  const { get } = setup({ [ID1]: { titel: 'Guns N&#39; Roses &amp; Friends' } });
  const r = get({ action: 'suche', q: 'guns' });
  assert.deepEqual(r.data, [{ videoId: ID1, titel: "Guns N' Roses & Friends", kanal: 'Kanal', thumbnail: `thumb-${ID1}` }]);
});

test('unbekannte Aktion', () => {
  const { get } = setup();
  assert.deepEqual(get({ action: 'quatsch' }), { ok: false, fehler: 'Unbekannte Aktion' });
});

test('IDs, Titel und Namen mit = + - @ landen als Text im Sheet', () => {
  const MINUS = '-tJYN-eG1zk';
  const { post, datenzeilen, sheets } = setup({ [MINUS]: { titel: '=Hit' } });
  assert.deepEqual(post({ action: 'wuenschen', videoId: MINUS, name: '-_-' }).data, { platz: 1, duplikat: false });
  assert.deepEqual(post({ action: 'wuenschen', videoId: MINUS, name: '' }).data, { platz: 1, duplikat: true });
  assert.deepEqual(sheets.Wuensche.formulas, []);
  assert.deepEqual(datenzeilen()[0].slice(1), [MINUS, '=Hit', '-_-', 'offen']);
  assert.deepEqual(post({ action: 'naechster' }).data, { videoId: MINUS, titel: '=Hit', name: '-_-' });
});
