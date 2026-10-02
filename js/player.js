// Abspielseite: Gästewünsche zuerst, sonst zufällige Songs aus der eigenen Playlist.
import { PlaylistCursor, chooseNext } from './queue.js';
import { createApi, ApiError } from './api.js';
import { thumbnailUrl } from './youtube.js';
import { APPS_SCRIPT_URL, PLAYLIST_ID } from './config.js';

const api = createApi(APPS_SCRIPT_URL);
const QUEUE_INTERVAL_MS = 5000;
const PLAYLIST_TIMEOUT_MS = 8000;

const $ = (id) => document.getElementById(id);

let player;
let cursor;
let current = null; // { source: 'wunsch' | 'playlist', videoId, titel?, name? }
let advancing = false;

// --- QR-Code zur Wunschseite ---

function renderQr() {
  const ziel = new URL('index.html', location.href).href;
  new QRCode($('qr'), {
    text: ziel,
    width: 280,
    height: 280,
    colorDark: '#0b0b33',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M,
  });
  $('qr').title = ziel;
}

// --- Anzeige ---

function setStatus(text) {
  $('status').textContent = text || '';
  $('status').classList.toggle('hidden', !text);
}

function showNow() {
  // Direkt nach loadVideoById liefert getVideoData() noch nichts bzw. das alte Video
  const daten = player?.getVideoData?.();
  const passend = daten && daten.video_id === current?.videoId;
  const titel = current?.titel || (passend && daten.title) || '…';
  $('now-title').textContent = titel;
  const wish = current?.source === 'wunsch';
  $('now-wish').textContent = wish ? `🎤 gewünscht von ${current.name || 'einem Gast'}` : '';
  $('now-wish').classList.toggle('hidden', !wish);
}

function queueItem(wunsch, index) {
  const li = document.createElement('li');
  li.className = 'queue-item';
  const pos = document.createElement('span');
  pos.className = 'queue-pos';
  pos.textContent = String(index + 1);
  const song = document.createElement('div');
  song.className = 'song';
  const img = document.createElement('img');
  img.src = thumbnailUrl(wunsch.videoId);
  img.alt = '';
  const text = document.createElement('div');
  text.className = 'song-text';
  const title = document.createElement('div');
  title.className = 'song-title';
  title.textContent = wunsch.titel;
  text.append(title);
  if (wunsch.name) {
    const sub = document.createElement('div');
    sub.className = 'song-sub';
    sub.textContent = wunsch.name;
    text.append(sub);
  }
  song.append(img, text);
  li.append(pos, song);
  return li;
}

async function refreshQueue() {
  try {
    const wuensche = await api.warteschlange();
    $('queue-list').replaceChildren(...wuensche.map(queueItem));
    $('queue-empty').classList.toggle('hidden', wuensche.length > 0);
    setStatus('');
  } catch {
    setStatus('Verbindung zum Wunsch-Server unterbrochen – die Playlist läuft weiter.');
  }
}

// --- Abspielen ---

async function playNext() {
  if (advancing) return;
  advancing = true;
  try {
    let wunsch = null;
    try {
      wunsch = await api.naechster();
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      setStatus('Verbindung zum Wunsch-Server unterbrochen – die Playlist läuft weiter.');
    }
    current = chooseNext(wunsch, cursor);
    if (!current) return;
    player.loadVideoById(current.videoId);
    showNow();
    refreshQueue();
  } finally {
    advancing = false;
  }
}

function onStateChange(event) {
  const S = YT.PlayerState;
  if (event.data === S.ENDED) playNext();
  if (event.data === S.PLAYING) showNow(); // Titel von Playlist-Songs ist erst jetzt bekannt
  if (event.data === S.PLAYING || event.data === S.PAUSED) {
    $('play-btn').textContent = event.data === S.PLAYING ? '⏸ Pause' : '▶ Weiter';
  }
}

function onError() {
  // Video gesperrt, gelöscht oder nicht einbettbar → einfach weiter
  if (current?.source === 'wunsch') api.fehler(current.videoId).catch(() => {});
  playNext();
}

// Der Player lädt die Playlist; getPlaylist() ist erst kurz danach gefüllt.
function waitForPlaylist() {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      const ids = player.getPlaylist() || [];
      if (ids.length > 0 || Date.now() - start > PLAYLIST_TIMEOUT_MS) resolve(ids);
      else setTimeout(check, 250);
    };
    check();
  });
}

function youtubeReady() {
  return new Promise((resolve) => {
    if (window.YT?.Player) return resolve();
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { previous?.(); resolve(); };
  });
}

async function startParty() {
  $('start-btn').disabled = true;
  $('start-error').textContent = '';
  await youtubeReady();

  player = new YT.Player('player', {
    playerVars: { listType: 'playlist', list: PLAYLIST_ID, playsinline: 1, rel: 0 },
    events: {
      onReady: async () => {
        const ids = await waitForPlaylist();
        if (ids.length === 0) {
          $('start-error').textContent = 'Playlist konnte nicht geladen werden – ist sie öffentlich oder nicht gelistet?';
          $('start-btn').disabled = false;
          return;
        }
        console.info(`Playlist geladen: ${ids.length} Songs`);
        cursor = new PlaylistCursor(ids);
        $('start-screen').classList.add('hidden');
        $('party').classList.remove('hidden');
        setInterval(refreshQueue, QUEUE_INTERVAL_MS);
        keepAwake();
        await playNext();
      },
      onStateChange,
      onError,
    },
  });
}

// --- Bedienung ---

$('start-btn').addEventListener('click', startParty);

$('play-btn').addEventListener('click', () => {
  if (player.getPlayerState() === YT.PlayerState.PLAYING) player.pauseVideo();
  else player.playVideo();
});

$('skip-btn').addEventListener('click', () => playNext());

const fullscreenSupported = document.fullscreenEnabled || document.webkitFullscreenEnabled;
$('fullscreen-btn').classList.toggle('hidden', !fullscreenSupported);
$('fullscreen-btn').addEventListener('click', () => {
  const el = document.documentElement;
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  } else {
    (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
  }
});

// --- Bildschirm wach halten (Tablet) ---

// Der Browser gibt die Sperre beim Verstecken der Seite frei → beim Zurückkehren neu anfordern
async function keepAwake() {
  try {
    await navigator.wakeLock?.request('screen');
  } catch { /* nicht unterstützt oder abgelehnt */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && cursor) keepAwake();
});

renderQr();
