/**
 * Mood -> one-song selection for autoplay.
 *
 * This module is intentionally independent of Cordis, timers, settings and the
 * ncm-cli transport: `pickSongForMood` only needs search functions.
 * Change the mood table or the selection strategy here without touching the
 * autoplay scheduler or the agent tool.
 *
 * The table also covers fiction / novel-writing scenes: romantic tension,
 * majesty, battles, mystery, horror, epics, nostalgia, etc.
 */

export const MOODS = Object.freeze([
  'calm',
  'focus',
  'upbeat',
  'celebration',
  'romantic',
  'playful',
  'night',
  'lonely',
  'melancholy',
  'nostalgic',
  'hopeful',
  'ethereal',
  'pastoral',
  'majestic',
  'epic',
  'battle',
  'tense',
  'mystery',
  'horror',
  'dark',
]);

/** Search keywords for each mood; the first playable result is used. */
export const MOOD_QUERIES = Object.freeze({
  calm: '舒缓 轻音乐 放松',
  focus: '专注 纯音乐 工作',
  upbeat: '轻快 活力 流行',
  celebration: '庆祝 欢快 派对',
  romantic: '暧昧 浪漫 心动 情歌',
  playful: '俏皮 可爱 活泼 轻快',
  night: '夜晚 安静 氛围',
  lonely: '孤独 深夜 钢琴 寂寞',
  melancholy: '伤感 慢歌 情绪',
  nostalgic: '怀旧 回忆 老歌',
  hopeful: '希望 温暖 治愈 明亮',
  ethereal: '空灵 仙气 氛围 女声',
  pastoral: '田园 自然 清新 民谣',
  majestic: '威严 庄严 管弦 史诗',
  epic: '史诗 宏大 交响 预告片',
  battle: '战斗 热血 史诗 配乐',
  tense: '紧张 悬疑 压迫 配乐',
  mystery: '悬疑 推理 神秘 配乐',
  horror: '惊悚 恐怖 诡异 配乐',
  dark: '黑暗 阴郁 低沉 暗黑',
});

/** How many results to request for the first song search. */
export const MOOD_SEARCH_LIMIT = 50;

/** Per-mood in-memory candidate cache. Never persisted. */
const MOOD_CACHE = new Map();

/** Coerce arbitrary input to a known mood key. */
export function normalizeMood(value) {
  const mood = String(value ?? '').trim().toLowerCase();
  return MOODS.includes(mood) ? mood : 'calm';
}

function normalizeCachedSongs(result) {
  const songs = Array.isArray(result)
    ? result
    : Array.isArray(result?.songs)
      ? result.songs
      : [];
  const seen = new Set();
  const normalized = [];
  for (const song of songs) {
    if (!song || typeof song !== 'object') continue;
    if (typeof song.encryptedId !== 'string' || song.encryptedId === '') continue;
    if (song.playable === false) continue;
    if (seen.has(song.encryptedId)) continue;
    seen.add(song.encryptedId);
    normalized.push(song);
  }
  return normalized;
}

function freshCandidates(songs, deps) {
  return songs.filter((song) => (
    typeof deps?.isDuplicate === 'function' ? !deps.isDuplicate(song) : true
  ));
}

function scoreSong(song, tokens) {
  const name = String(song.name ?? '').toLowerCase();
  const album = String(song.album ?? '').toLowerCase();
  const artists = Array.isArray(song.artists) ? song.artists.join(' ').toLowerCase() : '';
  let value = 0;
  for (const token of tokens) {
    if (name.includes(token)) value += 3;
    else if (album.includes(token) || artists.includes(token)) value += 1;
  }
  return value;
}

/**
 * Pick exactly one playable song for a mood.
 *
 * Search results are cached per mood in memory. If every cached song has
 * already been played, fall back to songs from mood playlists and cache those
 * too. Returns null only when no unseen candidate remains.
 *
 * @param {string} mood
 * @param {{
 *   searchSongs: (query: string, limit?: number) => Promise<unknown>,
 *   searchPlaylistSongs?: (query: string) => Promise<unknown>,
 *   isDuplicate?: (song: object) => boolean,
 * }} deps
 * @returns {Promise<object | null>} one song, or null when nothing playable
 */
export async function pickSongForMood(mood, deps) {
  if (typeof deps?.searchSongs !== 'function') return null;
  const moodKey = normalizeMood(mood);
  const query = MOOD_QUERIES[moodKey];
  const tokens = query.split(/\s+/).filter(Boolean).map((token) => token.toLowerCase());

  let cache = MOOD_CACHE.get(moodKey);
  if (!cache) {
    cache = { songs: [], playlistLoaded: false };
    MOOD_CACHE.set(moodKey, cache);
  }

  try {
    if (cache.songs.length === 0) {
      const result = await deps.searchSongs(query, MOOD_SEARCH_LIMIT);
      cache.songs = normalizeCachedSongs(result);
    }

    let fresh = freshCandidates(cache.songs, deps);
    if (fresh.length === 0 && !cache.playlistLoaded && typeof deps.searchPlaylistSongs === 'function') {
      cache.playlistLoaded = true;
      const extra = await deps.searchPlaylistSongs(query);
      const additions = normalizeCachedSongs(extra);
      if (additions.length > 0) {
        const known = new Set(cache.songs.map((song) => song.encryptedId));
        for (const song of additions) {
          if (known.has(song.encryptedId)) continue;
          known.add(song.encryptedId);
          cache.songs.push(song);
        }
      }
      fresh = freshCandidates(cache.songs, deps);
    }

    if (fresh.length === 0) return null;
    return [...fresh].sort((left, right) => scoreSong(right, tokens) - scoreSong(left, tokens))[0];
  } catch {
    return null;
  }
}

/** Clear the per-mood cache (used by tests or a manual reset). */
export function clearMoodCache() {
  MOOD_CACHE.clear();
}
