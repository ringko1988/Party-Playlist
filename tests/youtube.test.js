import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractVideoId, classifyInput, thumbnailUrl } from '../js/youtube.js';

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
