// Verbindung zur Apps-Script-Web-App.

const VERBINDUNGSFEHLER = "Gerade keine Verbindung – versuch's gleich nochmal";

export class ApiError extends Error {}

export function createApi(baseUrl, fetchFn = globalThis.fetch.bind(globalThis)) {
  async function auswerten(anfrage) {
    let antwort;
    try {
      antwort = await (await anfrage()).json();
    } catch {
      throw new ApiError(VERBINDUNGSFEHLER);
    }
    if (!antwort || !antwort.ok) throw new ApiError(antwort?.fehler || VERBINDUNGSFEHLER);
    return antwort.data;
  }

  const get = (action, params = {}) =>
    auswerten(() => fetchFn(`${baseUrl}?${new URLSearchParams({ action, ...params })}`));

  // text/plain vermeidet den CORS-Preflight, den Apps Script nicht beantwortet
  const post = (action, daten = {}) =>
    auswerten(() => fetchFn(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...daten }),
    }));

  return {
    suche: (q) => get('suche', { q }),
    info: (videoId) => get('info', { videoId }),
    warteschlange: () => get('warteschlange'),
    wuenschen: (videoId, name) => post('wuenschen', { videoId, name }),
    naechster: () => post('naechster'),
    fehler: (videoId) => post('fehler', { videoId }),
  };
}
