import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGs } from './helpers/load-gs.js';

const L = loadGs(['apps-script/Logik.gs']);
const rows = [
  [new Date('2026-10-09T20:00:00Z'), 'aaaaaaaaaaa', 'A', 'Lisa', 'gespielt'],
  [new Date('2026-10-09T20:01:00Z'), 'bbbbbbbbbbb', 'B', '', 'offen'],
  [new Date('2026-10-09T20:02:00Z'), 'ccccccccccc', 'C', 'Tom', 'offen'],
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
  assert.deepEqual(o.map((w) => [w.zeile, w.videoId, w.name]), [[3, 'bbbbbbbbbbb', ''], [4, 'ccccccccccc', 'Tom']]);
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
