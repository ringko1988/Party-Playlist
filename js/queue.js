// Abspiel-Reihenfolge: Gästewünsche vor der zufällig gemischten Playlist.

export function shuffle(items, rng = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export class PlaylistCursor {
  #ids;
  #rng;
  #order = [];
  #pos = 0;
  #last = null;

  constructor(videoIds, rng = Math.random) {
    this.#ids = [...videoIds];
    this.#rng = rng;
  }

  get size() {
    return this.#ids.length;
  }

  next() {
    if (this.#ids.length === 0) return null;
    if (this.#pos >= this.#order.length) {
      this.#order = shuffle(this.#ids, this.#rng);
      // Den gerade gespielten Song nicht direkt nach dem Neumischen wiederholen
      if (this.#order.length >= 2 && this.#order[0] === this.#last) {
        [this.#order[0], this.#order[1]] = [this.#order[1], this.#order[0]];
      }
      this.#pos = 0;
    }
    this.#last = this.#order[this.#pos++];
    return this.#last;
  }
}

export function chooseNext(wish, cursor) {
  if (wish) return { source: 'wunsch', ...wish };
  const videoId = cursor.next();
  return videoId ? { source: 'playlist', videoId } : null;
}
