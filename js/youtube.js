// Erkennung von YouTube-Links und Suchtext in der Wunsch-Eingabe.

const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const WATCH_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'];

function looksLikeYouTube(text) {
  return /youtube\.com|youtu\.be/i.test(text);
}

function validId(id) {
  return id && ID_PATTERN.test(id) ? id : null;
}

export function extractVideoId(input) {
  const text = String(input ?? '').trim();
  if (!looksLikeYouTube(text)) return null;

  let url;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  if (host === 'youtu.be') return validId(url.pathname.split('/')[1]);
  if (!WATCH_HOSTS.includes(host)) return null;
  if (url.pathname === '/watch') return validId(url.searchParams.get('v'));
  const shorts = url.pathname.match(/^\/shorts\/([^/]+)/);
  return shorts ? validId(shorts[1]) : null;
}

export function classifyInput(input) {
  const text = String(input ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return { type: 'empty' };
  if (looksLikeYouTube(text)) {
    const videoId = extractVideoId(text);
    return videoId ? { type: 'link', videoId } : { type: 'invalid-link' };
  }
  return { type: 'search', query: text };
}

export function thumbnailUrl(videoId) {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}
