/**
 * In-memory FIFO history of played songs, used to avoid repeating songs in
 * recommendations and autoplay selection.
 *
 * - Capacity: 100 keys.
 * - Lookup: hasSong(song).
 * - Insert: rememberSong(song); the oldest key is evicted with pop_front.
 * - The history is process-local and resets when DSH restarts.
 */

export const MAX_HISTORY = 100;

const order = [];
const seen = new Set();

/** Stable identity for a song: encrypted id, else original id, else title+artists. */
export function songKey(song) {
  if (!song || typeof song !== 'object') return '';
  if (typeof song.encryptedId === 'string' && song.encryptedId !== '') return song.encryptedId;
  if (typeof song.id === 'string' && /^[0-9A-Fa-f]{32}$/.test(song.id)) return song.id;
  if (song.originalId !== undefined && song.originalId !== null && String(song.originalId) !== '') {
    return String(song.originalId);
  }
  const name = typeof song.name === 'string' ? song.name.trim() : '';
  if (name === '') return '';
  const artists = Array.isArray(song.artists) ? song.artists.join('/') : '';
  return `${name}|${artists}`;
}

/** Whether the song is already in the recent-played set. */
export function hasSong(song) {
  const key = songKey(song);
  return key !== '' && seen.has(key);
}

/**
 * Append a played song to the history.
 * Existing keys are left untouched; when the queue grows past 100, the oldest
 * inserted key is removed.
 *
 * @returns {boolean} true when a new key was inserted, false for duplicates/empty
 */
export function rememberSong(song) {
  const key = songKey(song);
  if (key === '' || seen.has(key)) return false;
  seen.add(key);
  order.push(key);
  while (order.length > MAX_HISTORY) {
    const oldest = order.shift();
    if (oldest !== undefined) seen.delete(oldest);
  }
  return true;
}

/** Current number of remembered songs. */
export function historySize() {
  return order.length;
}

/** Snapshot the keys in insertion order (oldest first). */
export function exportHistory() {
  return [...order];
}

/** Replace the history with validated keys, keeping the newest MAX_HISTORY. */
export function importHistory(keys) {
  clearHistory();
  if (!Array.isArray(keys)) return;
  for (const key of keys) {
    if (typeof key !== 'string' || key === '' || seen.has(key)) continue;
    seen.add(key);
    order.push(key);
    while (order.length > MAX_HISTORY) {
      const oldest = order.shift();
      if (oldest !== undefined) seen.delete(oldest);
    }
  }
}

/** Clear the history (used by tests/tools that need a clean slate). */
export function clearHistory() {
  order.length = 0;
  seen.clear();
}
