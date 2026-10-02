import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shuffle, PlaylistCursor, chooseNext } from '../js/queue.js';

// Mulberry32: deterministischer Zufall für reproduzierbare Tests
function seeded(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('shuffle behält alle Elemente und ändert Original nicht', () => {
  const a = ['a', 'b', 'c', 'd', 'e'];
  const s = shuffle(a, seeded(1));
  assert.deepEqual([...s].sort(), a);
  assert.deepEqual(a, ['a', 'b', 'c', 'd', 'e']);
});

test('PlaylistCursor gibt jede ID einmal pro Runde aus', () => {
  const c = new PlaylistCursor(['a', 'b', 'c'], seeded(2));
  assert.equal(c.size, 3);
  assert.deepEqual([c.next(), c.next(), c.next()].sort(), ['a', 'b', 'c']);
});

test('nach Neumischen kommt der letzte Song nicht direkt wieder', () => {
  for (let seed = 0; seed < 200; seed++) {
    const c = new PlaylistCursor(['a', 'b', 'c'], seeded(seed));
    const runde1 = [c.next(), c.next(), c.next()];
    assert.notEqual(c.next(), runde1[2], `seed ${seed}`);
  }
});

test('PlaylistCursor mit einem bzw. keinem Song', () => {
  const eins = new PlaylistCursor(['a']);
  assert.equal(eins.next(), 'a');
  assert.equal(eins.next(), 'a');
  assert.equal(new PlaylistCursor([]).next(), null);
});

test('chooseNext: Wunsch vor Playlist', () => {
  const c = new PlaylistCursor(['p1']);
  const w = { videoId: 'w1xxxxxxxxx', titel: 'T', name: 'Lisa' };
  assert.deepEqual(chooseNext(w, c), { source: 'wunsch', ...w });
  assert.deepEqual(chooseNext(null, c), { source: 'playlist', videoId: 'p1' });
  assert.equal(chooseNext(null, new PlaylistCursor([])), null);
});
