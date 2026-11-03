/**
 * Mood -> one-song selection for autoplay.
 *
 * This module is intentionally independent of Cordis, timers, settings and the
 * ncm-cli transport: `pickSongForMood` only needs a `searchSongs` function.
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
  const tokens = query.split(/\s+/).filter(Boolean).map((token) => token.toLowerCase());
  try {
    const result = await deps.searchSongs(query);
    const songs = Array.isArray(result)
      ? result
      : Array.isArray(result?.songs)
        ? result.songs
        : [];
    const candidates = songs.filter((song) => (
      song
      && typeof song === 'object'
      && typeof song.encryptedId === 'string'
      && song.encryptedId !== ''
      && song.playable !== false
    ));
    if (candidates.length === 0) return null;

    const score = (song) => {
      const name = String(song.name ?? '').toLowerCase();
      const album = String(song.album ?? '').toLowerCase();
      const artists = Array.isArray(song.artists) ? song.artists.join(' ').toLowerCase() : '';
      let value = 0;
      for (const token of tokens) {
        if (name.includes(token)) value += 3;
        else if (album.includes(token) || artists.includes(token)) value += 1;
      }
      return value;
    };

    return [...candidates].sort((left, right) => score(right) - score(left))[0];
  } catch {
    return null;
  }
}
