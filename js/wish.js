// Wunschseite: Song per Link oder Suche finden und in die Warteschlange stellen.
import { classifyInput, thumbnailUrl } from './youtube.js';
import { createApi, ApiError } from './api.js';
import { APPS_SCRIPT_URL } from './config.js';

const api = createApi(APPS_SCRIPT_URL);
const NAME_KEY = 'party-name';
const UPCOMING_MAX = 5;
const UPCOMING_INTERVAL_MS = 15000;

const $ = (id) => document.getElementById(id);
const form = $('wish-form');
const queryInput = $('query');
const nameInput = $('name');
const searchBtn = $('search-btn');
const message = $('message');
const results = $('results');

let busy = false;

// --- Name merken (localStorage kann im privaten Modus fehlen) ---

try { nameInput.value = localStorage.getItem(NAME_KEY) || ''; } catch { /* egal */ }
nameInput.addEventListener('change', () => {
  try { localStorage.setItem(NAME_KEY, nameInput.value.trim()); } catch { /* egal */ }
});

// --- Anzeige-Helfer ---

function showMessage(text, kind = '') {
  message.textContent = text;
  message.className = `message ${kind}`.trim();
}

function setBusy(value) {
  busy = value;
  searchBtn.disabled = value;
  results.querySelectorAll('button').forEach((b) => { b.disabled = value; });
}

function songElement({ videoId, titel, kanal, thumbnail }) {
  const row = document.createElement('div');
  row.className = 'song';
  const img = document.createElement('img');
  img.src = thumbnail || thumbnailUrl(videoId);
  img.alt = '';
  img.loading = 'lazy';
  const text = document.createElement('div');
  text.className = 'song-text';
  const title = document.createElement('div');
  title.className = 'song-title';
  title.textContent = titel;
  text.append(title);
  if (kanal) {
    const sub = document.createElement('div');
    sub.className = 'song-sub';
    sub.textContent = kanal;
    text.append(sub);
  }
  row.append(img, text);
  return row;
}

function resultButton(video) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'result';
  btn.append(songElement(video));
  btn.addEventListener('click', () => wish(video.videoId));
  return btn;
}

// --- Ablauf ---

async function run(task) {
  if (busy) return;
  setBusy(true);
  try {
    await task();
  } catch (err) {
    showMessage(err instanceof ApiError ? err.message : 'Da ist etwas schiefgelaufen – versuch\'s nochmal.', 'error');
  } finally {
    setBusy(false);
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  queryInput.blur();
  const input = classifyInput(queryInput.value);
  if (input.type === 'empty') return;
  if (input.type === 'invalid-link') {
    results.replaceChildren();
    showMessage('Das ist kein Link zu einem YouTube-Video.', 'error');
    return;
  }

  run(async () => {
    showMessage(input.type === 'link' ? 'Video wird geladen …' : 'Suche läuft …');
    results.replaceChildren();

    if (input.type === 'link') {
      const video = await api.info(input.videoId);
      showMessage('');
      const preview = document.createElement('div');
      preview.className = 'preview';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.textContent = 'Wünschen';
      btn.addEventListener('click', () => wish(video.videoId));
      preview.append(songElement(video), btn);
      results.append(preview);
      return;
    }

    const treffer = await api.suche(input.query);
    if (treffer.length === 0) {
      showMessage('Nichts gefunden – versuch\'s anders.', 'error');
      return;
    }
    showMessage('');
    const hint = document.createElement('p');
    hint.className = 'muted result-hint';
    hint.textContent = 'Tipp auf deinen Song:';
    results.append(hint, ...treffer.map(resultButton));
  });
});

function wish(videoId) {
  run(async () => {
    showMessage('Wird gewünscht …');
    const { platz, duplikat } = await api.wuenschen(videoId, nameInput.value.trim());
    if (duplikat) {
      showMessage(`Ist schon drin – auf Platz ${platz}.`, 'ok');
    } else {
      showMessage(`Dein Song ist auf Platz ${platz} der Warteschlange 🎉`, 'ok');
    }
    queryInput.value = '';
    results.replaceChildren();
    loadUpcoming();
  });
}

// --- Liste „Als Nächstes“ ---

async function loadUpcoming() {
  let wuensche;
  try {
    wuensche = await api.warteschlange();
  } catch {
    return; // Liste ist nur Zusatzinfo – Fehler hier nicht anzeigen
  }
  const list = $('upcoming-list');
  list.replaceChildren(...wuensche.slice(0, UPCOMING_MAX).map((w) => {
    const li = document.createElement('li');
    li.textContent = w.name ? `${w.titel} – ${w.name}` : w.titel;
    return li;
  }));
  $('upcoming-empty').classList.toggle('hidden', wuensche.length > 0);
}

loadUpcoming();
setInterval(loadUpcoming, UPCOMING_INTERVAL_MS);
