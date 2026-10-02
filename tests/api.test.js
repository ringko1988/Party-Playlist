import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi, ApiError } from '../js/api.js';

const BASE = 'https://example.test/exec';

function fakeFetch(antwort) {
  const calls = [];
  const fn = async (url, opts = {}) => {
    calls.push({ url, opts });
    if (antwort instanceof Error) throw antwort;
    return { json: async () => (typeof antwort === 'function' ? antwort() : antwort) };
  };
  return { fn, calls };
}

test('suche ruft GET mit Parametern auf und liefert data', async () => {
  const f = fakeFetch({ ok: true, data: [{ videoId: 'x' }] });
  const api = createApi(BASE, f.fn);
  assert.deepEqual(await api.suche('a b'), [{ videoId: 'x' }]);
  assert.equal(f.calls[0].url, `${BASE}?action=suche&q=a+b`);
  assert.equal(f.calls[0].opts.method ?? 'GET', 'GET');
});

test('wuenschen sendet POST als text/plain mit JSON-Body', async () => {
  const f = fakeFetch({ ok: true, data: { platz: 1, duplikat: false } });
  const api = createApi(BASE, f.fn);
  assert.deepEqual(await api.wuenschen('dQw4w9WgXcQ', 'Lisa'), { platz: 1, duplikat: false });
  const { url, opts } = f.calls[0];
  assert.equal(url, BASE);
  assert.equal(opts.method, 'POST');
  assert.equal(opts.headers['Content-Type'], 'text/plain;charset=utf-8');
  assert.equal(opts.body, '{"action":"wuenschen","videoId":"dQw4w9WgXcQ","name":"Lisa"}');
});

test('ok:false wird zu ApiError mit Server-Text', async () => {
  const api = createApi(BASE, fakeFetch({ ok: false, fehler: 'Video nicht gefunden' }).fn);
  await assert.rejects(api.info('dQw4w9WgXcQ'), (e) => e instanceof ApiError && e.message === 'Video nicht gefunden');
});

test('Netzwerkfehler und kaputtes JSON werden zu Verbindungs-Fehler', async () => {
  const text = "Gerade keine Verbindung – versuch's gleich nochmal";
  const netz = createApi(BASE, fakeFetch(new TypeError('Failed to fetch')).fn);
  await assert.rejects(netz.warteschlange(), (e) => e instanceof ApiError && e.message === text);
  const kaputt = createApi(BASE, fakeFetch(() => { throw new SyntaxError('bad json'); }).fn);
  await assert.rejects(kaputt.naechster(), (e) => e instanceof ApiError && e.message === text);
});
