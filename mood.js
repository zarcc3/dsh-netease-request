/**
 * Mood -> one-song selection for autoplay.
 *
 * This module is intentionally independent of Cordis, timers, settings and the
 * ncm-cli transport: `pickSongForMood` only needs a `searchSongs` function.
 * Change the mood table or the selection strategy here without touching the
 * autoplay scheduler or the agent tool.
 */

export const MOODS = Object.freeze([
  'calm',
  'focus',
  'upbeat',
  'night',
  'melancholy',
  'celebration',
]);

/** Search keywords for each mood; the first playable result is used. */
export const MOOD_QUERIES = Object.freeze({
  calm: '舒缓 轻音乐 放松',
  focus: '专注 纯音乐 工作',
  upbeat: '轻快 活力 流行',
  night: '夜晚 安静 氛围',
  melancholy: '伤感 慢歌 情绪',
  celebration: '庆祝 欢快 派对',
});

/** Coerce arbitrary input to a known mood key. */
export function normalizeMood(value) {
  const mood = String(value ?? '').trim().toLowerCase();
  return MOODS.includes(mood) ? mood : 'calm';
}

/**
 * Pick exactly one playable song for a mood.
 *
 * @param {string} mood
 * @param {{ searchSongs: (query: string) => Promise<unknown> }} deps
 * @returns {Promise<object | null>} one song, or null when nothing playable
 */
export async function pickSongForMood(mood, deps) {
  if (typeof deps?.searchSongs !== 'function') return null;
  const query = MOOD_QUERIES[normalizeMood(mood)];
  try {
    const result = await deps.searchSongs(query);
    const songs = Array.isArray(result)
      ? result
      : Array.isArray(result?.songs)
        ? result.songs
        : [];
    return songs.find((song) => (
      song
      && typeof song === 'object'
      && typeof song.encryptedId === 'string'
      && song.encryptedId !== ''
      && song.playable !== false
    )) ?? null;
  } catch {
    return null;
  }
}
