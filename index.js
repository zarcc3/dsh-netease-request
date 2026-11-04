/**
 * Host half of the personal NetEase Cloud Music request plugin.
 *
 * The plugin talks to the official NetEase Cloud Music open platform through
 * the vendor CLI `@music163/ncm-cli`:
 *  - App ID + private key are pushed into the CLI configuration;
 *  - login uses the CLI's QR flow;
 *  - search and playback run through `ncm-cli`, with local playback via mpv.
 *
 * Settings live in `<DSH_HOME>/netease-request/config.json` and are served to
 * the Client page over same-origin routes under `/plugin-api/netease-request`.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { MOODS, normalizeMood, pickSongForMood } from './mood.js';
import { exportHistory, hasSong, importHistory, rememberSong } from './dedupe.js';

const ROUTE_ROOT = '/plugin-api/netease-request';
const CONFIG_DIR_NAME = 'netease-request';
const CONFIG_FILE_NAME = 'config.json';
const HISTORY_FILE_NAME = 'history.json';
const MAX_BODY_BYTES = 64 * 1024;
const CLI_TIMEOUT_MS = 60_000;

export const OFFICIAL_PLAYERS = Object.freeze(['mpv', 'orpheus']);

export const DEFAULT_OFFICIAL = Object.freeze({
  appId: '',
  privateKey: '',
  player: 'mpv',
});

export const DEFAULT_AUTOPLAY = Object.freeze({
  enabled: false,
  onStartup: true,
  pollMinutes: 5,
  startupMood: 'calm',
  followConversation: true,
});

export const DEFAULT_CONFIG = Object.freeze({
  searchLimit: 10,
  volume: 50,
  official: DEFAULT_OFFICIAL,
  autoplay: DEFAULT_AUTOPLAY,
});

export function songPageUrl(id) {
  return `https://music.163.com/#/song?id=${encodeURIComponent(String(id))}`;
}

export function configDirectory() {
  const home = process.env.DSH_HOME?.trim()
    || join(process.env.USERPROFILE || process.env.HOME || homedir(), '.dsh');
  return join(home, CONFIG_DIR_NAME);
}

export function configFilePath() {
  return join(configDirectory(), CONFIG_FILE_NAME);
}

export function historyFilePath() {
  return join(configDirectory(), HISTORY_FILE_NAME);
}

function messageOf(error) {
  if (error && typeof error === 'object') {
    const cause = error.cause;
    if (cause && typeof cause === 'object' && typeof cause.code === 'string') {
      return `${error.message || String(error)} (${cause.code})`;
    }
    if (typeof error.code === 'string') {
      return `${error.message || String(error)} (${error.code})`;
    }
    if (typeof error.message === 'string') return error.message;
  }
  return String(error);
}

function truncate(text, max) {
  const value = String(text ?? '');
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

function cleanCliText(text) {
  return String(text ?? '')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/\r/g, '')
    .trim();
}

function trimmedString(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function normalizeOfficial(input = {}, base = DEFAULT_OFFICIAL) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const merged = { ...base, ...source };
  return {
    appId: trimmedString(merged.appId, 128),
    privateKey: trimmedString(merged.privateKey, 8192),
    player: OFFICIAL_PLAYERS.includes(merged.player) ? merged.player : DEFAULT_OFFICIAL.player,
  };
}

function normalizeAutoplay(input = {}, base = DEFAULT_AUTOPLAY) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const merged = { ...base, ...source };
  const rawMinutes = Number(merged.pollMinutes);
  return {
    enabled: merged.enabled === true,
    onStartup: merged.onStartup !== false,
    pollMinutes: Number.isFinite(rawMinutes)
      ? Math.min(Math.max(Math.round(rawMinutes), 1), 60)
      : DEFAULT_AUTOPLAY.pollMinutes,
    startupMood: MOODS.includes(merged.startupMood) ? merged.startupMood : DEFAULT_AUTOPLAY.startupMood,
    followConversation: merged.followConversation !== false,
  };
}

export function normalizeConfig(input = {}, base = DEFAULT_CONFIG) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const merged = { ...base, ...source };
  const rawLimit = Number(merged.searchLimit);
  const rawVolume = Number(merged.volume);
  return {
    searchLimit: Number.isFinite(rawLimit)
      ? Math.min(Math.max(Math.round(rawLimit), 1), 50)
      : DEFAULT_CONFIG.searchLimit,
    volume: Number.isFinite(rawVolume)
      ? Math.min(Math.max(Math.round(rawVolume), 0), 100)
      : DEFAULT_CONFIG.volume,
    official: normalizeOfficial(merged.official, base.official ?? DEFAULT_OFFICIAL),
    autoplay: normalizeAutoplay(merged.autoplay, base.autoplay ?? DEFAULT_AUTOPLAY),
  };
}

/** Settings returned to the browser: never project the private key back out. */
export function publicConfig(config) {
  return {
    searchLimit: config.searchLimit,
    volume: config.volume,
    official: {
      appId: config.official.appId,
      privateKey: '',
      privateKeySet: config.official.privateKey !== '',
      player: config.official.player,
    },
    autoplay: config.autoplay,
  };
}

export async function readStoredConfig() {
  try {
    const text = await readFile(configFilePath(), 'utf8');
    return normalizeConfig(JSON.parse(text));
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return normalizeConfig(DEFAULT_CONFIG);
    console.warn('[netease-request] 读取配置失败，使用默认值：', messageOf(error));
    return normalizeConfig(DEFAULT_CONFIG);
  }
}

export async function persistConfig(config) {
  const directory = configDirectory();
  await mkdir(directory, { recursive: true });
  await writeFile(configFilePath(), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return config;
}

/** Restore the in-memory played-song history from disk at startup. */
export function loadHistory() {
  try {
    const text = readFileSync(historyFilePath(), 'utf8');
    const parsed = JSON.parse(text);
    const keys = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.keys) ? parsed.keys : [];
    importHistory(keys);
  } catch (error) {
    if (!(error && typeof error === 'object' && error.code === 'ENOENT')) {
      console.warn('[netease-request] 读取去重历史失败：', messageOf(error));
    }
  }
}

/** Persist the played-song history synchronously, for dispose/exit paths. */
export function saveHistory() {
  try {
    mkdirSync(configDirectory(), { recursive: true });
    writeFileSync(
      historyFilePath(),
      `${JSON.stringify({ version: 1, keys: exportHistory() }, null, 2)}\n`,
      'utf8',
    );
  } catch (error) {
    console.warn('[netease-request] 保存去重历史失败：', messageOf(error));
  }
}

/* ------------------------------------------------------------------ */
/* Official CLI plumbing                                               */
/* ------------------------------------------------------------------ */

/** Locate the globally installed CLI entry so we can spawn it without a shell. */
export function cliEntryPath() {
  const candidates = [];
  if (process.env.APPDATA) {
    candidates.push(join(process.env.APPDATA, 'npm', 'node_modules', '@music163', 'ncm-cli', 'dist', 'index.js'));
  }
  if (process.env.npm_config_prefix) {
    candidates.push(join(process.env.npm_config_prefix, 'node_modules', '@music163', 'ncm-cli', 'dist', 'index.js'));
  }
  if (process.env.USERPROFILE) {
    candidates.push(join(process.env.USERPROFILE, 'AppData', 'Roaming', 'npm', 'node_modules', '@music163', 'ncm-cli', 'dist', 'index.js'));
  }
  if (process.env.HOME) {
    candidates.push(join(process.env.HOME, '.npm-global', 'lib', 'node_modules', '@music163', 'ncm-cli', 'dist', 'index.js'));
    candidates.push(join(process.env.HOME, '.local', 'lib', 'node_modules', '@music163', 'ncm-cli', 'dist', 'index.js'));
  }
  return candidates.find((candidate) => existsSync(candidate));
}

function cliInvocation() {
  if (process.platform === 'win32') {
    const entry = cliEntryPath();
    return entry === undefined ? null : { command: process.execPath, prefixArgs: [entry] };
  }
  return { command: 'ncm-cli', prefixArgs: [] };
}

/** Candidate mpv executables, independent of the caller's PATH. */
function mpvCandidates() {
  const candidates = [];
  const explicit = process.env.MPV_PATH?.trim();
  if (explicit) candidates.push(explicit);

  if (process.platform === 'win32') {
    const programFiles = process.env.ProgramFiles || process.env['ProgramFiles'];
    if (programFiles) candidates.push(join(programFiles, 'MPV Player', 'mpv.exe'));
    const programFilesX86 = process.env['ProgramFiles(x86)'];
    if (programFilesX86) candidates.push(join(programFilesX86, 'MPV Player', 'mpv.exe'));
    if (process.env.LOCALAPPDATA) {
      candidates.push(join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', 'mpv.exe'));
      candidates.push(join(process.env.LOCALAPPDATA, 'mpv', 'mpv.exe'));
      candidates.push(...wingetMpvCandidates(process.env.LOCALAPPDATA));
    }
    if (process.env.ProgramData) {
      candidates.push(join(process.env.ProgramData, 'chocolatey', 'bin', 'mpv.exe'));
    }
    if (process.env.USERPROFILE) {
      candidates.push(join(process.env.USERPROFILE, 'scoop', 'shims', 'mpv.exe'));
    }
  } else {
    candidates.push('/usr/bin/mpv', '/usr/local/bin/mpv', '/opt/homebrew/bin/mpv');
  }
  return candidates;
}

function wingetMpvCandidates(localAppData) {
  const root = join(localAppData, 'Microsoft', 'WinGet', 'Packages');
  const candidates = [];
  try {
    for (const name of readdirSync(root)) {
      if (!name.toLowerCase().startsWith('shinchiro.mpv')) continue;
      const base = join(root, name);
      candidates.push(join(base, 'mpv.exe'));
      try {
        for (const child of readdirSync(base)) candidates.push(join(base, child, 'mpv.exe'));
      } catch {
        // ignore unreadable entries
      }
    }
  } catch {
    // WinGet is not installed for this user.
  }
  return candidates;
}

/** First existing mpv executable, or an empty string. */
export function findMpvExecutable() {
  return mpvCandidates().find((candidate) => existsSync(candidate)) ?? '';
}

/** Environment for CLI children: prepend the discovered mpv directory to PATH. */
function cliEnvironment() {
  const env = { ...process.env };
  const mpv = findMpvExecutable();
  if (mpv !== '') {
    const key = Object.keys(env).find((name) => name.toLowerCase() === 'path') ?? 'PATH';
    env[key] = `${dirname(mpv)}${delimiter}${env[key] ?? ''}`;
  }
  return env;
}

function runProcess(command, args, { timeoutMs = CLI_TIMEOUT_MS, signal } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: cliEnvironment(),
      });
    } catch (error) {
      reject(new Error(`无法启动命令 ${command}：${messageOf(error)}`));
      return;
    }

    const stdoutChunks = [];
    const stderrChunks = [];
    let settled = false;
    let timer;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      callback(value);
    };
    const onAbort = () => {
      try { child.kill(); } catch { /* ignore */ }
      finish(reject, new Error('操作已取消'));
    };

    timer = setTimeout(() => {
      try { child.kill(); } catch { /* ignore */ }
      finish(reject, new Error(`命令 ${command} 超时（${Math.round(timeoutMs / 1000)} 秒）`));
    }, timeoutMs);

    if (signal) {
      if (signal.aborted) {
        finish(reject, new Error('操作已取消'));
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    child.stdout.on('data', (chunk) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.stderr.on('data', (chunk) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.on('error', (error) => {
      finish(reject, new Error(`无法运行 ${command}：${messageOf(error)}`));
    });
    child.on('close', (code) => {
      finish(resolve, {
        code: code ?? -1,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
      });
    });
  });
}

async function runCli(args, options) {
  const invocation = cliInvocation();
  if (invocation === null) {
    throw new Error('未找到 ncm-cli。请先安装官方 CLI：npm install -g @music163/ncm-cli');
  }
  return runProcess(invocation.command, [...invocation.prefixArgs, ...args], options);
}

/**
 * Stop playback synchronously. Used from plugin disposal and process exit,
 * where asynchronous work would not get a chance to run before the Host exits.
 */
function stopPlaybackSync() {
  const invocation = cliInvocation();
  if (invocation === null) return false;
  try {
    const result = spawnSync(invocation.command, [...invocation.prefixArgs, 'stop'], {
      timeout: 5000,
      windowsHide: true,
      stdio: 'ignore',
      env: cliEnvironment(),
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

function parseJsonOutput(text) {
  const cleaned = cleanCliText(text);
  if (cleaned === '') return null;
  for (let index = 0; index < cleaned.length; index += 1) {
    const char = cleaned[index];
    if (char !== '{' && char !== '[') continue;
    const candidate = cleaned.slice(index);
    try {
      return JSON.parse(candidate);
    } catch {
      const end = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'));
      if (end > 0) {
        try {
          return JSON.parse(candidate.slice(0, end + 1));
        } catch {
          // keep scanning
        }
      }
    }
  }
  return null;
}

function cliFailureText(result) {
  const stderr = cleanCliText(result.stderr);
  const stdout = cleanCliText(result.stdout);
  const text = stderr !== '' ? stderr : stdout;
  return text !== '' ? text : `ncm-cli 退出码 ${result.code}`;
}

function withModeHint(text) {
  const lower = text.toLowerCase();
  if (lower.includes('api key') || lower.includes('appid') || lower.includes('privatekey')) {
    return `${text}\n请在「设置 → 网易云点歌」填写 App ID 与 Private Key 并保存。`;
  }
  if (text.includes('登录') || text.includes('授权') || lower.includes('login')) {
    return `${text}\n请在「设置 → 网易云点歌」点击「启动扫码登录」，或运行 ncm-cli login --background 后扫码。`;
  }
  if (lower.includes('mpv') || text.includes('播放器')) {
    return `${text}\n官方模式需要本机播放器：请安装 mpv（或将播放器切换为可用的 orpheus）。`;
  }
  return text;
}

async function probeCommand(command, args, timeoutMs = 5000) {
  try {
    const result = await runProcess(command, args, { timeoutMs });
    return { ok: result.code === 0, output: cleanCliText(result.stdout || result.stderr) };
  } catch {
    return { ok: false, output: '' };
  }
}

function parseCliAppId(text) {
  const cleaned = cleanCliText(text);
  const match = cleaned.match(/appId:\s*([^\s(]+)/i);
  if (!match) return '';
  if (match[1].includes('未配置') || match[1] === '') return '';
  return match[1];
}

/** Probe the CLI, credential state, login state and local player. */
export async function officialStatus(config) {
  const invocation = cliInvocation();
  if (invocation === null) {
    return {
      available: false,
      installed: false,
      version: '',
      cliAppId: '',
      loggedIn: false,
      mpvAvailable: false,
      player: config.official.player,
      message: '未找到 ncm-cli。请先安装：npm install -g @music163/ncm-cli',
    };
  }

  const version = await runCli(['--version'], { timeoutMs: 15_000 }).catch((error) => ({ code: -1, stdout: '', stderr: messageOf(error) }));
  const appIdResult = await runCli(['config', 'get', 'appId'], { timeoutMs: 15_000 }).catch((error) => ({ code: -1, stdout: '', stderr: messageOf(error) }));
  const loginResult = await runCli(['login', '--check'], { timeoutMs: 30_000 }).catch((error) => ({ code: -1, stdout: '', stderr: messageOf(error) }));
  const loginPayload = parseJsonOutput(loginResult.stdout) ?? parseJsonOutput(loginResult.stderr) ?? {};
  const mpvPath = findMpvExecutable();
  const mpv = mpvPath !== ''
    ? await probeCommand(mpvPath, ['--version'], 5000)
    : await probeCommand('mpv', ['--version'], 5000);

  const loggedIn = loginPayload.success === true || loginPayload.loggedIn === true;
  const loginMessage = loginPayload.success === false || loginResult.code !== 0
    ? cliFailureText(loginResult)
    : '';
  return {
    available: true,
    installed: true,
    version: cleanCliText(version.stdout || version.stderr),
    cliAppId: parseCliAppId(appIdResult.stdout || appIdResult.stderr),
    loggedIn,
    loginMessage: typeof loginPayload.message === 'string' ? loginPayload.message : loginMessage,
    mpvAvailable: mpv.ok,
    mpvPath: mpv.ok ? mpvPath : '',
    player: config.official.player,
    message: loggedIn
      ? ''
      : (typeof loginPayload.message === 'string' ? loginPayload.message : loginMessage || '未登录'),
  };
}

/** Push App ID / private key / player into the official CLI configuration. */
export async function applyOfficialSettings(official) {
  const applied = [];
  const failures = [];
  const steps = [];
  if (official.appId !== '') steps.push(['appId', official.appId]);
  if (official.privateKey !== '') steps.push(['privateKey', official.privateKey]);
  steps.push(['player', official.player || 'mpv']);

  for (const [key, value] of steps) {
    try {
      const result = await runCli(['config', 'set', key, value], { timeoutMs: 20_000 });
      if (result.code === 0) applied.push(key);
      else failures.push({ key, message: cliFailureText(result) });
    } catch (error) {
      failures.push({ key, message: messageOf(error) });
    }
  }
  return { applied, failures };
}

/** Start the official background login flow; its output is shown in settings. */
export async function startOfficialLogin() {
  try {
    const result = await runCli(['login', '--background'], { timeoutMs: 20_000 });
    return {
      ok: result.code === 0,
      exitCode: result.code,
      output: truncate(cleanCliText(`${result.stdout}\n${result.stderr}`), 4000),
    };
  } catch (error) {
    return { ok: false, exitCode: -1, output: messageOf(error) };
  }
}

/* ------------------------------------------------------------------ */
/* Search and playback through the official CLI                       */
/* ------------------------------------------------------------------ */

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function artistNames(value) {
  const raw = value.artists ?? value.ar ?? value.singer ?? value.singers ?? value.artist;
  if (typeof raw === 'string') return [raw];
  if (Array.isArray(raw)) {
    return raw
      .map((artist) => (typeof artist === 'string' ? artist : artist?.name))
      .filter((name) => typeof name === 'string' && name.length > 0);
  }
  if (raw && typeof raw === 'object' && typeof raw.name === 'string') return [raw.name];
  return [];
}

function looksLikeOfficialSong(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const name = firstString(value.name, value.songName, value.title);
  if (name === '') return false;
  const original = firstString(value.originalId, value.original_id, value.songId);
  if (original === '') return false;
  return Array.isArray(value.artists) || value.album !== undefined || value.duration !== undefined;
}

export function normalizeOfficialSong(value) {
  const encryptedId = firstString(
    value.encryptedId,
    value.encrypted_id,
    value.encryptId,
    value.encryptedID,
    typeof value.id === 'string' ? value.id : '',
  );
  const originalRaw = firstString(
    value.originalId,
    value.original_id,
    value.songId,
    typeof value.id === 'number' ? value.id : '',
  );
  const id = Number(originalRaw);
  const albumRaw = value.album ?? value.al;
  const album = typeof albumRaw === 'string'
    ? albumRaw
    : firstString(albumRaw?.name, value.albumName, '');
  const rawDuration = Number(value.duration ?? value.dt ?? value.durationMs ?? 0);
  const durationSeconds = Number.isFinite(rawDuration) && rawDuration > 0
    ? Math.round(rawDuration > 1000 ? rawDuration / 1000 : rawDuration)
    : 0;
  const visible = value.playFlag !== false
    && value.visible !== false
    && value.playable !== false
    && value.canPlay !== false;
  return {
    id: Number.isFinite(id) ? id : 0,
    name: firstString(value.name, value.songName, value.title),
    artists: artistNames(value),
    album,
    durationSeconds,
    pageUrl: Number.isFinite(id) && id > 0 ? songPageUrl(id) : '',
    playable: visible,
    encryptedId,
    originalId: originalRaw,
  };
}

export function collectOfficialSongs(value, out, seen) {  if (Array.isArray(value)) {
    for (const item of value) collectOfficialSongs(item, out, seen);
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (looksLikeOfficialSong(value)) {
    const song = normalizeOfficialSong(value);
    const key = song.encryptedId || `${song.originalId}:${song.name}`;
    if (key !== '' && !seen.has(key)) {
      seen.add(key);
      out.push(song);
    }
  }
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') collectOfficialSongs(child, out, seen);
  }
}

function officialTotal(payload, fallback) {
  if (!payload || typeof payload !== 'object') return fallback;
  const candidates = [
    payload.total,
    payload.count,
    payload.songCount,
    payload.recordCount,
    payload.data?.total,
    payload.data?.songCount,
    payload.data?.recordCount,
    payload.result?.total,
    payload.result?.songCount,
    payload.result?.recordCount,
  ];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return fallback;
}

export async function officialSearchSongs(config, query, limit, signal) {
  const keywords = typeof query === 'string' ? query.trim() : '';
  if (keywords === '') throw new Error('搜索关键词不能为空');
  const pageSize = Number.isFinite(limit)
    ? Math.min(Math.max(Math.round(limit), 1), 50)
    : config.searchLimit;
  const result = await runCli(
    [
      '--output', 'json', 'search', 'song',
      '--keyword', keywords,
      '--limit', String(pageSize),
      '--userInput', `搜索歌曲：${keywords}`,
    ],
    { timeoutMs: 45_000, signal },
  );
  if (result.code !== 0) {
    throw new Error(withModeHint(cliFailureText(result)));
  }
  const payload = parseJsonOutput(result.stdout) ?? parseJsonOutput(result.stderr);
  if (payload === null) {
    throw new Error(`ncm-cli 返回了无法解析的结果：${truncate(cleanCliText(result.stdout || result.stderr), 300)}`);
  }
  const collected = [];
  collectOfficialSongs(payload, collected, new Set());
  const songs = collected.slice(0, Math.max(pageSize, 1));
  return { keywords, total: officialTotal(payload, collected.length), songs };
}

export async function officialRequestSong(config, options, signal) {
  const query = typeof options?.query === 'string' ? options.query.trim() : '';
  if (query === '') throw new Error('点歌需要歌曲名称');
  const artist = typeof options?.artist === 'string' ? options.artist.trim() : '';
  const keywords = artist !== '' && !query.includes(artist) ? `${query} ${artist}` : query;
  const requested = Number.isFinite(options?.limit) ? options.limit : Math.max(config.searchLimit, 5);
  const found = await officialSearchSongs(config, keywords, Math.min(Math.max(requested, 1), 30), signal);
  if (found.songs.length === 0) throw new Error(`没有找到与「${keywords}」匹配的歌曲`);

  const index = Number.isFinite(options?.index)
    ? Math.min(Math.max(Math.round(options.index), 1), found.songs.length)
    : 1;
  const song = found.songs[index - 1];
  if (!song.playable) {
    throw new Error(`《${song.name}》当前不可播放（visible=false），请换一首或使用其它版本。`);
  }
  if (song.encryptedId === '') {
    throw new Error(`《${song.name}》缺少加密 ID，无法通过官方开放平台播放。`);
  }

  const originalId = song.originalId !== '' ? song.originalId : String(song.id);
  const play = await runCli(
    ['play', '--song', '--encrypted-id', song.encryptedId, '--original-id', originalId, '--output', 'json'],
    { timeoutMs: 30_000, signal },
  );
  if (play.code !== 0) {
    throw new Error(withModeHint(cliFailureText(play)));
  }
  rememberSong(song);

  return {
    keywords,
    total: found.total,
    song,
    playback: { played: true, player: config.official.player },
    alternatives: found.songs.filter((_, position) => position !== index - 1).slice(0, 4),
  };
}

/* ------------------------------------------------------------------ */
/* Model-facing text and tool definitions                              */
/* ------------------------------------------------------------------ */

export async function listPlaylists() {
  const playlists = [];
  for (const kind of ['created', 'collected']) {
    const result = await runCli(
      ['--output', 'json', 'playlist', kind, '--userInput', '查看我的歌单'],
      { timeoutMs: 30_000 },
    );
    if (result.code !== 0) {
      throw new Error(withModeHint(cliFailureText(result)));
    }
    const payload = parseJsonOutput(result.stdout) ?? parseJsonOutput(result.stderr) ?? {};
    const records = Array.isArray(payload?.data?.records) ? payload.data.records : [];
    for (const record of records) {
      if (!record || typeof record !== 'object' || !record.id) continue;
      playlists.push({
        kind,
        name: String(record.name ?? ''),
        encryptedId: String(record.id),
        originalId: String(record.originalId ?? ''),
        trackCount: Number(record.trackCount) || 0,
      });
    }
  }
  return playlists;
}

export function matchPlaylistByName(playlists, name) {
  const query = String(name ?? '').trim().toLowerCase();
  if (query === '') throw new Error('请提供歌单名称');
  const exact = playlists.filter((playlist) => playlist.name.toLowerCase() === query);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    throw new Error(`存在多个同名歌单「${name}」，请换一个更具体的名称。`);
  }
  const partial = playlists.filter((playlist) => playlist.name.toLowerCase().includes(query));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    throw new Error(`找到多个匹配「${name}」的歌单：${partial.map((playlist) => `「${playlist.name}」`).join('、')}，请用完整名称。`);
  }
  throw new Error(`没有找到歌单「${name}」。`);
}

async function fetchPlaylistTracks(playlist) {
  const tracks = [];
  let offset = 0;
  while (offset < 5000) {
    const result = await runCli(
      [
        '--output', 'json', 'playlist', 'tracks',
        '--playlistId', playlist.encryptedId,
        '--limit', '500',
        '--offset', String(offset),
        '--userInput', `读取歌单「${playlist.name}」`,
      ],
      { timeoutMs: 45_000 },
    );
    if (result.code !== 0) throw new Error(withModeHint(cliFailureText(result)));
    const payload = parseJsonOutput(result.stdout) ?? parseJsonOutput(result.stderr) ?? {};
    const page = Array.isArray(payload?.data) ? payload.data : [];
    tracks.push(...page);
    if (page.length < 500) break;
    offset += 500;
  }
  return tracks.filter((track) => track && track.playFlag !== false && track.id && track.originalId);
}

async function rememberPlaylistTracks(playlist) {
  try {
    const tracks = await fetchPlaylistTracks(playlist);
    for (const track of tracks) rememberSong(track);
  } catch {
    // Playback already succeeded; history recording is best-effort.
  }
}

function normalizeMoodPlaylistTrack(track) {
  const encryptedId = typeof track?.id === 'string' ? track.id : '';
  const originalId = track?.originalId !== undefined && track?.originalId !== null
    ? String(track.originalId)
    : '';
  if (encryptedId === '' || originalId === '') return null;
  return {
    id: Number(originalId) || 0,
    encryptedId,
    originalId,
    name: String(track.name ?? ''),
    artists: artistNames(track),
    album: track.album && typeof track.album === 'object' ? String(track.album.name ?? '') : '',
    playable: track.playFlag !== false,
    duration: Number(track.duration) || 0,
  };
}

async function searchMoodPlaylistSongs(query) {
  try {
    const result = await runCli(
      [
        '--output', 'json', 'search', 'playlist',
        '--keyword', query,
        '--limit', '5',
        '--userInput', `搜索情绪歌单：${query}`,
      ],
      { timeoutMs: 30_000 },
    );
    if (result.code !== 0) return [];
    const payload = parseJsonOutput(result.stdout) ?? parseJsonOutput(result.stderr) ?? {};
    const records = Array.isArray(payload?.data?.records)
      ? payload.data.records
      : Array.isArray(payload?.data)
        ? payload.data
        : [];
    for (const record of records.slice(0, 3)) {
      const playlist = {
        encryptedId: String(record?.id ?? ''),
        originalId: String(record?.originalId ?? ''),
        name: String(record?.name ?? ''),
        trackCount: Number(record?.trackCount) || 0,
      };
      if (playlist.encryptedId === '' || playlist.trackCount === 0) continue;
      try {
        const tracks = await fetchPlaylistTracks(playlist);
        const songs = tracks
          .map(normalizeMoodPlaylistTrack)
          .filter(Boolean)
          .slice(0, 100);
        if (songs.length > 0) return songs;
      } catch {
        // Try the next playlist.
      }
    }
  } catch {
    // No playlist fallback available.
  }
  return [];
}

function playlistSongSummary(track) {
  const id = Number(track.originalId) || 0;
  const album = track.album && typeof track.album === 'object' ? String(track.album.name ?? '') : '';
  return {
    id,
    name: String(track.name ?? ''),
    artists: artistNames(track),
    album,
  };
}

export async function queueLikedSongs(count = 5) {
  const requested = Math.min(Math.max(Math.round(Number(count) || 5), 1), 20);
  const playlists = await listPlaylists();
  const liked = playlists.find((playlist) => playlist.name.includes('喜欢的音乐'))
    ?? playlists.find((playlist) => playlist.kind === 'created' && playlist.name.includes('喜欢'));
  if (!liked) throw new Error('没有找到「喜欢的音乐」歌单。');
  const tracks = await fetchPlaylistTracks(liked);
  if (tracks.length === 0) throw new Error('喜欢的音乐里没有可播放的歌曲。');

  const shuffled = [...tracks];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  const picked = shuffled.slice(0, Math.min(requested, shuffled.length));

  let active = false;
  try {
    const stateResult = await runCli(['state'], { timeoutMs: 15_000 });
    const statePayload = parseJsonOutput(stateResult.stdout) ?? parseJsonOutput(stateResult.stderr) ?? {};
    active = statePayload?.state?.status === 'playing' || statePayload?.state?.status === 'paused';
  } catch {
    active = false;
  }

  const added = [];
  let started = false;
  let toQueue = picked;
  if (!active && picked.length > 0) {
    const first = picked[0];
    const play = await runCli(
      ['play', '--song', '--encrypted-id', String(first.id), '--original-id', String(first.originalId)],
      { timeoutMs: 60_000 },
    );
    const playPayload = parseJsonOutput(play.stdout) ?? parseJsonOutput(play.stderr) ?? {};
    if (play.code !== 0 || playPayload.success === false) {
      throw new Error(withModeHint(playPayload.message || cliFailureText(play)));
    }
    started = true;
    added.push(playlistSongSummary(first));
    rememberSong(first);
    toQueue = picked.slice(1);
    if (toQueue.length > 0) await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  for (const track of toQueue) {
    const result = await runCli(
      ['queue', 'add', '--encrypted-id', String(track.id), '--original-id', String(track.originalId)],
      { timeoutMs: 20_000 },
    );
    const payload = parseJsonOutput(result.stdout) ?? parseJsonOutput(result.stderr) ?? {};
    if (result.code !== 0 || payload.success === false) {
      throw new Error(withModeHint(payload.message || cliFailureText(result)));
    }
    added.push(playlistSongSummary(track));
    rememberSong(track);
  }
  return { playlist: liked.name, requested, started, added };
}

export async function playPlaylistByName(name) {
  const playlists = await listPlaylists();
  const playlist = matchPlaylistByName(playlists, name);
  const result = await runCli(
    [
      'play', '--playlist',
      '--encrypted-id', playlist.encryptedId,
      '--original-id', playlist.originalId !== '' ? playlist.originalId : playlist.encryptedId,
    ],
    { timeoutMs: 60_000 },
  );
  const payload = parseJsonOutput(result.stdout) ?? parseJsonOutput(result.stderr) ?? {};
  if (result.code !== 0 || payload.success === false) {
    throw new Error(withModeHint(payload.message || cliFailureText(result)));
  }
  await rememberPlaylistTracks(playlist);
  return { name: playlist.name, kind: playlist.kind, trackCount: playlist.trackCount };
}

function searchSongSummary(song) {
  return {
    id: Number(song.id) || 0,
    name: song.name,
    artists: song.artists,
    album: song.album,
  };
}

async function enqueuePickedSongs(picked) {
  let active = false;
  try {
    const stateResult = await runCli(['state'], { timeoutMs: 15_000 });
    const statePayload = parseJsonOutput(stateResult.stdout) ?? parseJsonOutput(stateResult.stderr) ?? {};
    active = statePayload?.state?.status === 'playing' || statePayload?.state?.status === 'paused';
  } catch {
    active = false;
  }

  const added = [];
  let started = false;
  let rest = picked;
  if (!active && picked.length > 0) {
    const first = picked[0];
    const play = await runCli(
      ['play', '--song', '--encrypted-id', first.encryptedId, '--original-id', String(first.originalId)],
      { timeoutMs: 60_000 },
    );
    const playPayload = parseJsonOutput(play.stdout) ?? parseJsonOutput(play.stderr) ?? {};
    if (play.code !== 0 || playPayload.success === false) {
      throw new Error(withModeHint(playPayload.message || cliFailureText(play)));
    }
    started = true;
    added.push(searchSongSummary(first));
    rememberSong(first);
    rest = picked.slice(1);
    if (rest.length > 0) await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  for (const song of rest) {
    const result = await runCli(
      ['queue', 'add', '--encrypted-id', song.encryptedId, '--original-id', String(song.originalId)],
      { timeoutMs: 20_000 },
    );
    const payload = parseJsonOutput(result.stdout) ?? parseJsonOutput(result.stderr) ?? {};
    if (result.code !== 0 || payload.success === false) {
      throw new Error(withModeHint(payload.message || cliFailureText(result)));
    }
    added.push(searchSongSummary(song));
    rememberSong(song);
  }
  return { started, added };
}

export async function queueSongsByQueries(queries, options = {}) {
  const list = (Array.isArray(queries) ? queries : [])
    .filter((query) => typeof query === 'string' && query.trim() !== '')
    .slice(0, 10);
  if (list.length === 0) throw new Error('请提供要加入队列的歌曲');

  const picked = [];
  const failed = [];
  for (const query of list) {
    try {
      const found = await officialSearchSongs({ searchLimit: 3 }, query, 3);
      const song = found.songs.find((candidate) => candidate.playable !== false) ?? found.songs[0];
      if (!song || !song.encryptedId) throw new Error('没有可播放结果');
      picked.push(song);
    } catch (error) {
      failed.push({ query, message: messageOf(error) });
    }
  }
  if (picked.length === 0) {
    throw new Error(`没有找到可加入队列的歌曲：${failed.map((item) => `${item.query}（${item.message}）`).join('；')}`);
  }

  const seen = new Set();
  const unique = [];
  for (const song of picked) {
    const key = song.encryptedId || `${song.originalId}:${song.name}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(song);
    }
  }
  if (options.replace === true) {
    const clear = await runCli(['queue', 'clear'], { timeoutMs: 20_000 });
    const clearPayload = parseJsonOutput(clear.stdout) ?? parseJsonOutput(clear.stderr) ?? {};
    if (clear.code !== 0 || clearPayload.success === false) {
      throw new Error(withModeHint(clearPayload.message || cliFailureText(clear)));
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const { started, added } = await enqueuePickedSongs(unique);
  return { requested: list.length, started, added, failed };
}

export async function radarPlaylists() {
  const result = await runCli(
    ['--output', 'json', 'playlist', 'radar', '--userInput', '推荐一些歌单'],
    { timeoutMs: 30_000 },
  );
  if (result.code !== 0) throw new Error(withModeHint(cliFailureText(result)));
  const payload = parseJsonOutput(result.stdout) ?? parseJsonOutput(result.stderr) ?? {};
  const data = Array.isArray(payload?.data) ? payload.data : [];
  return data
    .filter((item) => item && typeof item === 'object' && item.id)
    .map((item, position) => ({
      index: position + 1,
      name: String(item.name ?? ''),
      creator: String(item.creatorNickName ?? ''),
      description: String(item.describe ?? ''),
      trackCount: Number(item.trackCount) || 0,
      pageUrl: item.originalId ? `https://music.163.com/#/playlist?id=${item.originalId}` : '',
      encryptedId: String(item.id),
      originalId: String(item.originalId ?? ''),
    }));
}

export async function recommendPlaylists(options = {}) {
  const playlists = await radarPlaylists();
  if (playlists.length === 0) throw new Error('没有获取到推荐歌单。');

  let playing = '';
  if (options.play === true) {
    const index = Math.min(Math.max(Math.round(Number(options.index) || 1), 1), playlists.length);
    const playlist = playlists[index - 1];
    const result = await runCli(
      [
        'play', '--playlist',
        '--encrypted-id', playlist.encryptedId,
        '--original-id', playlist.originalId !== '' ? playlist.originalId : playlist.encryptedId,
      ],
      { timeoutMs: 60_000 },
    );
    const payload = parseJsonOutput(result.stdout) ?? parseJsonOutput(result.stderr) ?? {};
    if (result.code !== 0 || payload.success === false) {
      throw new Error(withModeHint(payload.message || cliFailureText(result)));
    }
    playing = playlist.name;
    await rememberPlaylistTracks(playlist);
  }

  return {
    playlists: playlists.map(({ encryptedId, originalId, ...rest }) => rest),
    playing,
  };
}

async function clearPlayerQueue() {
  const clear = await runCli(['queue', 'clear'], { timeoutMs: 20_000 });
  const payload = parseJsonOutput(clear.stdout) ?? parseJsonOutput(clear.stderr) ?? {};
  if (clear.code !== 0 || payload.success === false) {
    throw new Error(withModeHint(payload.message || cliFailureText(clear)));
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

async function fetchRecommendedSongs(kind, count) {
  const limit = Math.min(Math.max(Math.round(Number(count) || 10), 1), 30);
  const requestLimit = kind === 'daily'
    ? Math.min(Math.max(limit * 4, 20), 40)
    : Math.min(Math.max(limit * 3, 10), 40);
  let result;
  if (kind === 'daily') {
    result = await runCli(
      ['--output', 'json', 'recommend', 'daily', '--limit', String(requestLimit), '--userInput', '推荐歌曲'],
      { timeoutMs: 30_000 },
    );
  } else {
    const playlists = await listPlaylists();
    const liked = playlists.find((playlist) => playlist.name.includes('喜欢的音乐'))
      ?? playlists.find((playlist) => playlist.kind === 'created' && playlist.name.includes('喜欢'));
    if (!liked) throw new Error('没有找到「喜欢的音乐」歌单。');
    result = await runCli(
      [
        '--output', 'json', 'recommend', 'heartbeat',
        '--playlistId', liked.encryptedId,
        '--type', 'fromPlayAll',
        '--count', String(requestLimit),
        '--userInput', '心动模式推荐',
      ],
      { timeoutMs: 30_000 },
    );
  }
  if (result.code !== 0) throw new Error(withModeHint(cliFailureText(result)));
  const payload = parseJsonOutput(result.stdout) ?? parseJsonOutput(result.stderr) ?? {};
  const data = Array.isArray(payload?.data) ? payload.data : [];
  const seen = new Set();
  const songs = [];
  for (const item of data) {
    const song = normalizeOfficialSong(item);
    if (!song || song.playable === false || song.encryptedId === '') continue;
    const key = song.encryptedId;
    if (seen.has(key)) continue;
    seen.add(key);
    songs.push(song);
  }

  return songs.slice(0, limit);
}

export async function recommendSongs(options = {}) {
  const kind = options.kind === 'daily' ? 'daily' : 'heartbeat';
  const requested = Math.min(Math.max(Math.round(Number(options.count) || 10), 1), 30);
  const songs = await fetchRecommendedSongs(kind, requested);
  if (songs.length === 0) throw new Error('没有获取到可播放的推荐歌曲。');

  let started = false;
  if (options.play === true) {
    if (options.replace === true) await clearPlayerQueue();
    const enqueued = await enqueuePickedSongs(songs);
    started = enqueued.started;
  }
  return {
    kind,
    playing: options.play === true,
    started,
    songs: songs.map(publicSong),
  };
}

function publicSong(song) {
  return {
    id: song.id,
    name: song.name,
    artists: song.artists,
    album: song.album,
    durationSeconds: song.durationSeconds,
    pageUrl: song.pageUrl,
    playable: song.playable !== false,
  };
}

function formatDuration(seconds) {
  const total = Number(seconds) || 0;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

export function formatSearchResult(value) {
  if (!Array.isArray(value.songs) || value.songs.length === 0) {
    return `没有在网易云音乐中找到与「${value.keywords}」匹配的歌曲。`;
  }
  const lines = value.songs.map((song, index) => {
    const artist = song.artists.length > 0 ? ` — ${song.artists.join('/')}` : '';
    const album = song.album !== '' ? ` · ${song.album}` : '';
    const playable = song.playable === false ? '（不可播放）' : '';
    return `${index + 1}. ${song.name}${artist}${album}（${formatDuration(song.durationSeconds)}）${playable}\n   ${song.pageUrl}`;
  });
  return [
    `在网易云音乐中搜索「${value.keywords}」，共 ${value.total} 条结果，返回前 ${value.songs.length} 首：`,
    '',
    lines.join('\n'),
    '',
    '要播放其中某一首，调用 netease_request_song，传入歌名（可用 index 选择第几首）；点歌会在本机播放。',
  ].join('\n');
}

export function formatRequestResult(value) {
  const song = value.song;
  const artist = song.artists.length > 0 ? ` — ${song.artists.join('/')}` : '';
  const album = song.album !== '' ? ` · ${song.album}` : '';
  const parts = [
    `已点歌：${song.name}${artist}${album}（${formatDuration(song.durationSeconds)}）`,
    `已通过官方开放平台（ncm-cli）开始在本机播放，播放器：${value.playback.player}。`,
    `网易云页面：${song.pageUrl}`,
  ];
  if (value.alternatives.length > 0) {
    parts.push(`其它候选：${value.alternatives.map((other) => `${other.name} — ${other.artists.join('/')}`).join('；')}`);
  }
  return parts.join('\n');
}

const SONG_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    name: { type: 'string' },
    artists: { type: 'array', items: { type: 'string' } },
    album: { type: 'string' },
    durationSeconds: { type: 'integer' },
    pageUrl: { type: 'string' },
    playable: { type: 'boolean' },
  },
  required: ['id', 'name', 'artists', 'album', 'durationSeconds', 'pageUrl', 'playable'],
};

const SEARCH_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    keywords: { type: 'string' },
    total: { type: 'integer' },
    songs: { type: 'array', items: SONG_SCHEMA },
  },
  required: ['ok', 'keywords', 'total', 'songs'],
};

const PLAYBACK_SCHEMA = {
  type: 'object',
  properties: {
    played: { type: 'boolean' },
    player: { type: 'string' },
  },
  required: ['played', 'player'],
};

const REQUEST_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    keywords: { type: 'string' },
    total: { type: 'integer' },
    song: SONG_SCHEMA,
    playback: PLAYBACK_SCHEMA,
    alternatives: { type: 'array', items: SONG_SCHEMA },
  },
  required: ['ok', 'keywords', 'total', 'song', 'playback', 'alternatives'],
};

const PLAYLIST_SONG_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    name: { type: 'string' },
    artists: { type: 'array', items: { type: 'string' } },
    album: { type: 'string' },
  },
  required: ['id', 'name', 'artists', 'album'],
};

const QUEUE_LIKED_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    playlist: { type: 'string' },
    requested: { type: 'integer' },
    started: { type: 'boolean' },
    added: { type: 'array', items: PLAYLIST_SONG_SCHEMA },
  },
  required: ['ok', 'playlist', 'requested', 'started', 'added'],
};

const PLAY_PLAYLIST_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    name: { type: 'string' },
    kind: { type: 'string' },
    trackCount: { type: 'integer' },
  },
  required: ['ok', 'name', 'kind', 'trackCount'],
};

function formatQueueLiked(value) {
  if (!Array.isArray(value.added) || value.added.length === 0) {
    return `没有从「${value.playlist}」加入歌曲。`;
  }
  const label = (song) => {
    const artist = song.artists.length > 0 ? ` — ${song.artists.join('/')}` : '';
    return `${song.name}${artist}`;
  };
  if (value.started === true) {
    const first = value.added[0];
    const rest = value.added.slice(1);
    const lines = [`当前没有播放，已开始播放：${label(first)}`];
    if (rest.length > 0) {
      lines.push(`并把剩余 ${rest.length} 首加入队列：`);
      rest.forEach((song, index) => lines.push(`${index + 1}. ${label(song)}`));
    }
    return lines.join('\n');
  }
  const lines = value.added.map((song, index) => `${index + 1}. ${label(song)}`);
  return [`已从「${value.playlist}」加入 ${value.added.length} 首到队列：`, ...lines].join('\n');
}

const QUEUE_SONGS_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    requested: { type: 'integer' },
    started: { type: 'boolean' },
    added: { type: 'array', items: PLAYLIST_SONG_SCHEMA },
    failed: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          message: { type: 'string' },
        },
        required: ['query', 'message'],
      },
    },
  },
  required: ['ok', 'requested', 'started', 'added', 'failed'],
};

function formatQueueSongs(value) {
  const label = (song) => {
    const artist = song.artists.length > 0 ? ` — ${song.artists.join('/')}` : '';
    return `${song.name}${artist}`;
  };
  const lines = [];
  const rest = value.started === true ? value.added.slice(1) : value.added;
  if (value.started === true && value.added.length > 0) {
    lines.push(`当前没有播放，已开始播放：${label(value.added[0])}`);
  }
  if (rest.length > 0) {
    lines.push(`${value.started === true ? '并把剩余' : '已加入队列'} ${rest.length} 首${value.started === true ? '加入队列' : ''}：`);
    rest.forEach((song, index) => lines.push(`${index + 1}. ${label(song)}`));
  }
  if (Array.isArray(value.failed) && value.failed.length > 0) {
    lines.push(`未找到：${value.failed.map((item) => `${item.query}（${item.message}）`).join('；')}`);
  }
  return lines.join('\n') || '没有加入歌曲。';
}

const RECOMMEND_PLAYLISTS_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    playing: { type: 'string' },
    playlists: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          name: { type: 'string' },
          creator: { type: 'string' },
          description: { type: 'string' },
          trackCount: { type: 'integer' },
          pageUrl: { type: 'string' },
        },
        required: ['index', 'name', 'creator', 'description', 'trackCount', 'pageUrl'],
      },
    },
  },
  required: ['ok', 'playing', 'playlists'],
};

function formatRecommendPlaylists(value) {
  const lines = [];
  if (value.playing !== '') {
    lines.push(`开始播放推荐歌单「${value.playing}」。`, '');
  }
  lines.push('个性化推荐歌单：');
  value.playlists.forEach((playlist) => {
    const creator = playlist.creator !== '' ? ` — ${playlist.creator}` : '';
    lines.push(`${playlist.index}. ${playlist.name}（${playlist.trackCount} 首）${creator}`);
    const description = playlist.description.replace(/\s+/g, ' ').slice(0, 80);
    if (description !== '') lines.push(`   ${description}`);
  });
  lines.push('', '要播放第几个，直接说序号即可。');
  return lines.join('\n');
}

const RECOMMEND_SONGS_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    kind: { type: 'string' },
    playing: { type: 'boolean' },
    started: { type: 'boolean' },
    songs: { type: 'array', items: SONG_SCHEMA },
  },
  required: ['ok', 'kind', 'playing', 'started', 'songs'],
};

function formatRecommendSongs(value) {
  const label = (song) => {
    const artist = song.artists.length > 0 ? ` — ${song.artists.join('/')}` : '';
    return `${song.name}${artist}`;
  };
  const lines = [];
  if (value.playing === true) {
    if (value.started === true && value.songs.length > 0) {
      lines.push(`当前没有播放，已开始播放推荐：${label(value.songs[0])}`);
      const rest = value.songs.slice(1);
      if (rest.length > 0) {
        lines.push(`并把剩余 ${rest.length} 首加入队列：`);
        rest.forEach((song, index) => lines.push(`${index + 1}. ${label(song)}`));
      }
    } else {
      lines.push(`已把 ${value.songs.length} 首推荐加入队列：`);
      value.songs.forEach((song, index) => lines.push(`${index + 1}. ${label(song)}`));
    }
    return lines.join('\n');
  }
  lines.push(`为你推荐（${value.kind === 'daily' ? '每日推荐' : '心动模式'}）：`);
  value.songs.forEach((song, index) => lines.push(`${index + 1}. ${label(song)}`));
  return lines.join('\n');
}

const MOOD_LABELS = Object.freeze({
  calm: '舒缓',
  focus: '专注',
  upbeat: '轻快',
  celebration: '庆祝',
  romantic: '暧昧',
  playful: '俏皮',
  night: '夜晚',
  lonely: '孤独',
  melancholy: '伤感',
  nostalgic: '怀旧',
  hopeful: '希望',
  ethereal: '空灵',
  pastoral: '田园',
  majestic: '威严',
  epic: '史诗',
  battle: '战斗',
  tense: '紧张',
  mystery: '悬疑',
  horror: '惊悚',
  dark: '黑暗',
});

const MOOD_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    mood: { type: 'string' },
    played: { oneOf: [SONG_SCHEMA, { type: 'null' }] },
    skipped: { type: 'string' },
  },
  required: ['ok', 'mood', 'played', 'skipped'],
};

function formatMoodResult(value) {
  const label = MOOD_LABELS[value.mood] ?? value.mood;
  if (value.played) {
    const artist = value.played.artists.length > 0 ? ` — ${value.played.artists.join('/')}` : '';
    return `氛围「${label}」：已开始播放 ${value.played.name}${artist}。`;
  }
  if (value.skipped === 'playing') return `已记录氛围「${label}」；当前正在播放，不切歌。`;
  if (value.skipped === 'paused') return `已记录氛围「${label}」；当前已暂停，保持现状。`;
  if (value.skipped === 'disabled') return `已记录氛围「${label}」；自动播放未开启。`;
  if (value.skipped === 'no-song') return `已记录氛围「${label}」；没有找到适合的歌曲。`;
  if (value.skipped === 'error') return `已记录氛围「${label}」；本轮播放失败。`;
  return `已记录氛围「${label}」；本轮未播放。`;
}

const LIKE_CURRENT_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    song: { oneOf: [SONG_SCHEMA, { type: 'null' }] },
    liked: { type: 'boolean' },
    alreadyLiked: { type: 'boolean' },
  },
  required: ['ok', 'song', 'liked', 'alreadyLiked'],
};

function formatLikeCurrentResult(value) {
  const song = value.song;
  if (!song) return '没有识别到当前歌曲。';
  const artist = song.artists.length > 0 ? ` — ${song.artists.join('/')}` : '';
  if (value.alreadyLiked === true) {
    return `《${song.name}》${artist} 已经在「喜欢的音乐」中。`;
  }
  return `已把《${song.name}》${artist} 添加到「喜欢的音乐」。`;
}

function formatUnlikeCurrentResult(value) {
  const song = value.song;
  if (!song) return '没有识别到当前歌曲。';
  const artist = song.artists.length > 0 ? ` — ${song.artists.join('/')}` : '';
  return `已把《${song.name}》${artist} 从「喜欢的音乐」移除。`;
}

function createToolDefinitions(currentConfig, autoplayController = {}) {
  const searchTool = {
    name: 'netease_search_songs',
    description:
      'Search NetEase Cloud Music (网易云音乐) through the official open-platform CLI (ncm-cli) and list matching songs. '
      + 'Returns each song\'s title, artists, album, duration, playability and music.163.com page URL. '
      + 'Use this to find candidates before requesting a specific song; use netease_request_song to actually 点歌/play it.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: {
          type: 'string',
          description: 'Song title, artist, or combined keywords, e.g. "周杰伦 晴天".',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          description: 'Maximum number of songs to return. Defaults to the configured search count.',
        },
      },
      required: ['query'],
    },
    output: {
      schema: SEARCH_OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: formatSearchResult(value) }],
    },
    timeoutMs: 60_000,
    isConcurrencySafe: () => true,
    presentCall(args) {
      return {
        card: 'generic',
        title: `搜索歌曲：${String(args?.query ?? '')}`,
        kind: 'search',
        rawInput: args,
      };
    },
    async execute(args, exec) {
      const config = await currentConfig();
      const result = await officialSearchSongs(config, args?.query, args?.limit ?? config.searchLimit, exec.signal);
      return { ok: true, ...result };
    },
  };

  const requestTool = {
    name: 'netease_request_song',
    description:
      'Request a song (点歌 / 播放 / 来一首) from NetEase Cloud Music through the official open-platform CLI (ncm-cli): '
      + 'searches, picks the best match, and starts local playback through the configured player (mpv). '
      + 'Use when the user asks to play, queue or request music. '
      + 'If the tool reports that playback could not start, relay the reason instead of inventing a stream URL.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: {
          type: 'string',
          description: 'Song title or combined keywords, e.g. "晴天" or "周杰伦 晴天".',
        },
        artist: {
          type: 'string',
          description: 'Optional artist name to narrow the search.',
        },
        index: {
          type: 'integer',
          minimum: 1,
          maximum: 30,
          description: 'Which search result to request, 1-based. Defaults to the first match.',
        },
      },
      required: ['query'],
    },
    output: {
      schema: REQUEST_OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: formatRequestResult(value) }],
    },
    timeoutMs: 60_000,
    isConcurrencySafe: () => true,
    presentCall(args) {
      const query = String(args?.query ?? '');
      const artist = typeof args?.artist === 'string' && args.artist !== '' ? ` ${args.artist}` : '';
      return {
        card: 'generic',
        title: `点歌：${query}${artist}`,
        kind: 'search',
        rawInput: args,
      };
    },
    async execute(args, exec) {
      const config = await currentConfig();
      const result = await officialRequestSong(config, args, exec.signal);
      return { ok: true, ...result };
    },
  };

  const queueLikedTool = {
    name: 'netease_queue_liked',
    description:
      'Add N random songs from the user\'s NetEase "喜欢的音乐" playlist to the current playback queue through the official ncm-cli. '
      + 'Current playback is not interrupted. Use when the user asks to queue or add liked songs (e.g. 加几首我喜欢的歌到队列).',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        count: {
          type: 'integer',
          minimum: 1,
          maximum: 20,
          description: 'How many random liked songs to add. Defaults to 5.',
        },
      },
    },
    output: {
      schema: QUEUE_LIKED_OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: formatQueueLiked(value) }],
    },
    timeoutMs: 120_000,
    isConcurrencySafe: () => false,
    presentCall(args) {
      return {
        card: 'generic',
        title: `加入喜欢的歌：${args?.count ?? 5} 首`,
        kind: 'search',
        rawInput: args,
      };
    },
    async execute(args) {
      const result = await queueLikedSongs(args?.count ?? 5);
      return { ok: true, ...result };
    },
  };

  const playPlaylistTool = {
    name: 'netease_play_playlist',
    description:
      'Play one of the user\'s NetEase playlists by name through the official ncm-cli. '
      + 'Supports created and collected playlists, matched exactly or by a unique partial name. '
      + 'Use when the user asks to play a playlist (播放某个歌单).',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: {
          type: 'string',
          description: 'Playlist name, exact or a unique partial match.',
        },
      },
      required: ['name'],
    },
    output: {
      schema: PLAY_PLAYLIST_OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: `开始播放歌单「${value.name}」（${value.trackCount} 首）。` }],
    },
    timeoutMs: 120_000,
    isConcurrencySafe: () => false,
    presentCall(args) {
      return {
        card: 'generic',
        title: `播放歌单：${String(args?.name ?? '')}`,
        kind: 'search',
        rawInput: args,
      };
    },
    async execute(args) {
      const result = await playPlaylistByName(args?.name);
      return { ok: true, ...result };
    },
  };

  const queueSongsTool = {
    name: 'netease_queue_songs',
    description:
      'Search one or more song queries through the official ncm-cli and add the best playable match of each to the playback queue. '
      + 'Starts playback automatically when idle. Set replace=true to clear the current queue first. '
      + 'Use when the user asks to play or queue a specific set of songs (e.g. 就放这几首).',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        queries: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 10,
          description: 'One query per song, ideally title plus artist.',
        },
        replace: {
          type: 'boolean',
          description: 'Clear the current playback queue before adding these songs. Defaults to false.',
        },
      },
      required: ['queries'],
    },
    output: {
      schema: QUEUE_SONGS_OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: formatQueueSongs(value) }],
    },
    timeoutMs: 180_000,
    isConcurrencySafe: () => false,
    presentCall(args) {
      const count = Array.isArray(args?.queries) ? args.queries.length : 0;
      return {
        card: 'generic',
        title: `加入队列：${count} 首`,
        kind: 'search',
        rawInput: args,
      };
    },
    async execute(args) {
      const result = await queueSongsByQueries(args?.queries, { replace: args?.replace === true });
      return { ok: true, ...result };
    },
  };

  const radarPlaylistsTool = {
    name: 'netease_radar_playlists',
    description:
      '私人雷达: list the user\'s personalized NetEase radar playlists (not songs) through the official ncm-cli. '
      + 'Set play=true with an optional 1-based index to start playing one immediately. '
      + 'Use when the user asks for recommended playlists; use netease_heartbeat or netease_daily_recommend for songs.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        play: {
          type: 'boolean',
          description: 'Start playing one of the recommended playlists. Defaults to false (list only).',
        },
        index: {
          type: 'integer',
          minimum: 1,
          maximum: 20,
          description: '1-based playlist index used when play=true. Defaults to 1.',
        },
      },
    },
    output: {
      schema: RECOMMEND_PLAYLISTS_OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: formatRecommendPlaylists(value) }],
    },
    timeoutMs: 120_000,
    isConcurrencySafe: () => false,
    presentCall(args) {
      const playing = args?.play === true ? `播放第 ${args?.index ?? 1} 个` : '私人雷达';
      return {
        card: 'generic',
        title: playing,
        kind: 'search',
        rawInput: args,
      };
    },
    async execute(args) {
      const result = await recommendPlaylists({ play: args?.play === true, index: args?.index });
      return { ok: true, ...result };
    },
  };

  const makeSongRecommendTool = ({ name, kind, title, description, countHint }) => ({
    name,
    description,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        count: {
          type: 'integer',
          minimum: 1,
          maximum: 30,
          description: countHint,
        },
        play: {
          type: 'boolean',
          description: 'Start or queue the recommended songs immediately. Defaults to false (list only).',
        },
        replace: {
          type: 'boolean',
          description: 'Clear the current queue before playing recommendations, used with play=true.',
        },
      },
    },
    output: {
      schema: RECOMMEND_SONGS_OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: formatRecommendSongs(value) }],
    },
    timeoutMs: 180_000,
    isConcurrencySafe: () => false,
    presentCall(args) {
      return {
        card: 'generic',
        title,
        kind: 'search',
        rawInput: args,
      };
    },
    async execute(args) {
      const result = await recommendSongs({
        kind,
        count: args?.count,
        play: args?.play === true,
        replace: args?.replace === true,
      });
      return { ok: true, ...result };
    },
  });

  const heartbeatTool = makeSongRecommendTool({
    name: 'netease_heartbeat',
    kind: 'heartbeat',
    title: '心动模式推荐',
    countHint: 'How many songs to request. Heartbeat may return fewer than requested.',
    description:
      '心动模式: get personalized song recommendations (not a playlist) based on the user\'s liked playlist through ncm-cli. '
      + 'Set play=true to start or queue them immediately; replace=true clears the current queue first.',
  });

  const dailyRecommendTool = makeSongRecommendTool({
    name: 'netease_daily_recommend',
    kind: 'daily',
    title: '每日推荐',
    countHint: 'How many daily recommended songs to return. Defaults to 10.',
    description:
      '每日推荐: get today\'s personalized NetEase recommendation songs (not a playlist) through ncm-cli. '
      + 'Set play=true to start or queue them immediately; replace=true clears the current queue first.',
  });

  const likeCurrentTool = {
    name: 'netease_like_current',
    description:
      'Add the currently playing or paused NetEase song to the user\'s 喜欢的音乐 through the official ncm-cli. '
      + 'Use when the user asks to like/favorite the current song. Fails if no current song can be identified.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
    output: {
      schema: LIKE_CURRENT_OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: formatLikeCurrentResult(value) }],
    },
    timeoutMs: 60_000,
    isConcurrencySafe: () => false,
    presentCall() {
      return {
        card: 'generic',
        title: '喜欢当前歌曲',
        kind: 'search',
        rawInput: {},
      };
    },
    async execute() {
      if (typeof autoplayController.likeCurrent !== 'function') {
        throw new Error('喜欢当前歌曲的控制器未就绪');
      }
      const result = await autoplayController.likeCurrent();
      return { ok: true, ...result };
    },
  };

  const unlikeCurrentTool = {
    name: 'netease_unlike_current',
    description:
      'Remove the currently playing or paused NetEase song from the user\'s 喜欢的音乐 (取消红心) through the official ncm-cli. '
      + 'Use when the user asks to unlike/unfavorite the current song. Fails if no current song can be identified.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
    output: {
      schema: LIKE_CURRENT_OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: formatUnlikeCurrentResult(value) }],
    },
    timeoutMs: 60_000,
    isConcurrencySafe: () => false,
    presentCall() {
      return {
        card: 'generic',
        title: '取消喜欢当前歌曲',
        kind: 'search',
        rawInput: {},
      };
    },
    async execute() {
      if (typeof autoplayController.unlikeCurrent !== 'function') {
        throw new Error('取消喜欢当前歌曲的控制器未就绪');
      }
      const result = await autoplayController.unlikeCurrent();
      return { ok: true, ...result };
    },
  };

  const playMoodTool = {
    name: 'netease_play_mood',
    description:
      'Record the current conversation mood for the autoplay feature and, only when the player is stopped, pick one suitable song and play it. '
      + 'Never interrupts music that is playing or paused. Call it whenever the mood of the conversation or a written scene changes noticeably, '
      + 'without waiting for an explicit request; supports daily moods and fiction scenes (e.g. romantic tension 暧昧, majestic 威严, battle, tense, mystery, horror, epic).',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        mood: {
          type: 'string',
          enum: [...MOODS],
          description: 'Conversation mood; supports daily moods and fiction scenes such as romantic, majestic, battle, tense, mystery, horror, epic.',
        },
      },
      required: ['mood'],
    },
    output: {
      schema: MOOD_OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: formatMoodResult(value) }],
    },
    timeoutMs: 120_000,
    isConcurrencySafe: () => false,
    presentCall(args) {
      const label = MOOD_LABELS[args?.mood] ?? String(args?.mood ?? '');
      return {
        card: 'generic',
        title: `氛围：${label}`,
        kind: 'search',
        rawInput: args,
      };
    },
    async execute(args) {
      if (typeof autoplayController.applyMood !== 'function') {
        throw new Error('自动播放控制器未就绪');
      }
      const result = await autoplayController.applyMood(args?.mood);
      return { ...result, ok: result.ok === true };
    },
  };

  return [
    searchTool,
    requestTool,
    queueLikedTool,
    playPlaylistTool,
    queueSongsTool,
    radarPlaylistsTool,
    heartbeatTool,
    dailyRecommendTool,
    likeCurrentTool,
    unlikeCurrentTool,
    playMoodTool,
  ];
}

/* ------------------------------------------------------------------ */
/* Same-origin settings HTTP surface                                   */
/* ------------------------------------------------------------------ */

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function readJsonBody(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new HttpError(413, '请求体过大');
    chunks.push(chunk);
  }
  if (total === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, '请求体不是合法的 JSON');
  }
}

function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  response.end(body);
}

function sendError(response, error) {
  if (response.headersSent) {
    response.end();
    return;
  }
  if (error instanceof HttpError) {
    sendJson(response, error.status, { ok: false, error: { message: error.message } });
    return;
  }
  const message = messageOf(error);
  console.error('[netease-request]', message);
  sendJson(response, 500, { ok: false, error: { message } });
}

function methodNotAllowed(response, allow) {
  response.writeHead(405, { allow, 'cache-control': 'no-store' });
  response.end();
}

export function apply(ctx) {
  loadHistory();
  const state = { config: normalizeConfig(DEFAULT_CONFIG) };
  const ready = readStoredConfig().then((stored) => {
    state.config = stored;
  });
  const currentConfig = async () => {
    await ready;
    return state.config;
  };

  const saveConfig = async (patch) => {
    await ready;
    const source = patch && typeof patch === 'object' && !Array.isArray(patch) ? { ...patch } : {};
    if (source.official && typeof source.official === 'object' && !Array.isArray(source.official)) {
      const official = { ...source.official };
      if (official.privateKey === undefined || official.privateKey === '') delete official.privateKey;
      source.official = official;
    }
    const next = normalizeConfig(source, state.config);
    await persistConfig(next);
    state.config = next;
    return next;
  };

  const player = {
    volume: DEFAULT_CONFIG.volume,
    cacheAt: 0,
    cache: null,
    queueTotal: 0,
    queueAt: 0,
    volumeSaveTimer: null,
    volumeTarget: null,
    volumeRunning: false,
    paused: false,
  };
  void ready.then(() => {
    player.volume = state.config.volume;
  });

  const clampVolume = (value) => Math.min(Math.max(Math.round(Number(value) || 0), 0), 100);

  const readQueueTotal = async (force = false) => {
    if (!force && Date.now() - player.queueAt < 5000) return player.queueTotal;
    try {
      const result = await runCli(['queue'], { timeoutMs: 10_000 });
      const payload = parseJsonOutput(result.stdout) ?? parseJsonOutput(result.stderr) ?? {};
      const total = Number(payload.total);
      if (Number.isFinite(total) && total >= 0) {
        player.queueTotal = total;
        player.queueAt = Date.now();
      }
    } catch {
      // Keep the last known total; queue length is cosmetic.
    }
    return player.queueTotal;
  };

  const readPlayerState = async (force = false) => {
    if (!force && player.cache !== null && Date.now() - player.cacheAt < 1000) return player.cache;
    const result = await runCli(['state'], { timeoutMs: 15_000 });
    const payload = parseJsonOutput(result.stdout) ?? parseJsonOutput(result.stderr) ?? {};
    if (result.code !== 0 && payload.state === undefined) {
      throw new Error(withModeHint(cliFailureText(result)));
    }
    const raw = payload.state ?? {};
    const active = raw.status === 'playing' || raw.status === 'paused';
    const queueTotal = active ? await readQueueTotal() : 0;
    const value = {
      ok: payload.success !== false,
      status: typeof raw.status === 'string' ? raw.status : 'stopped',
      title: typeof raw.title === 'string' ? raw.title : '',
      position: Number(raw.position) || 0,
      duration: Number(raw.duration) || 0,
      progress: typeof raw.progress === 'string' ? raw.progress : '',
      currentIndex: Number(raw.currentIndex) || 0,
      queueLength: queueTotal > 0 ? queueTotal : Number(raw.queueLength) || 0,
      volume: player.volume,
    };
    if (value.status === 'playing') player.paused = false;
    player.cache = value;
    player.cacheAt = Date.now();
    return value;
  };

  const resolveCurrentSong = async () => {
    const queueResult = await runCli(['queue'], { timeoutMs: 15_000 });
    const queuePayload = parseJsonOutput(queueResult.stdout) ?? parseJsonOutput(queueResult.stderr) ?? {};
    if (queueResult.code !== 0 && queuePayload.success === false) {
      throw new Error(withModeHint(cliFailureText(queueResult)));
    }
    const queue = Array.isArray(queuePayload.queue) ? queuePayload.queue : [];
    const current = queue.find((item) => item?.current === true);
    const label = String(current?.label ?? '');
    const queueId = /^([0-9A-Fa-f]{32})\b/.exec(label)?.[1] ?? '';
    const state = await readPlayerState(true);
    const title = String(state.title ?? '').trim()
      || label.replace(/^[0-9A-Fa-f]{32}\s*\|\s*/, '').replace(/^歌曲 ID:.*$/i, '').trim();

    const historyResult = await runCli(
      ['--output', 'json', 'user', 'history', '--limit', '20', '--userInput', '查找当前歌曲'],
      { timeoutMs: 30_000 },
    );
    const historyPayload = parseJsonOutput(historyResult.stdout) ?? parseJsonOutput(historyResult.stderr) ?? {};
    if (historyResult.code !== 0 || !historyPayload?.data) {
      throw new Error(withModeHint(cliFailureText(historyResult)));
    }
    const history = Array.isArray(historyPayload?.data?.songListVo)
      ? historyPayload.data.songListVo
      : Array.isArray(historyPayload?.data?.songs)
        ? historyPayload.data.songs
        : [];

    const normalize = (value) => String(value ?? '').toLowerCase().replace(/\s+/g, '');
    const normalizedTitle = normalize(title);
    let match = queueId === ''
      ? null
      : history.find((song) => String(song?.id ?? '') === queueId) ?? null;
    if (match === null && normalizedTitle !== '') {
      match = history.find((song) => {
        const name = normalize(song?.name);
        if (name === '' || !normalizedTitle.includes(name)) return false;
        const artist = normalize(song?.artists?.[0]?.name);
        return artist === '' || normalizedTitle.includes(artist);
      }) ?? null;
    }

    const encryptedId = queueId !== '' ? queueId : String(match?.id ?? '');
    if (encryptedId === '') {
      throw new Error('无法识别当前歌曲，可能没有正在播放的歌曲。');
    }
    const song = normalizeOfficialSong(match ?? {
      id: encryptedId,
      name: title || '当前歌曲',
    });
    return { encryptedId, song, liked: match?.liked === true };
  };

  const setCurrentSongLiked = async (liked) => {
    const current = await resolveCurrentSong();
    if (current.liked === liked) {
      return { song: publicSong(current.song), liked, alreadyLiked: liked };
    }
    const result = await runCli(
      [
        '--output', 'json', 'song', liked ? 'like' : 'dislike',
        '--songId', current.encryptedId,
        '--userInput', `${liked ? '喜欢' : '取消喜欢'}：${current.song.name}`,
      ],
      { timeoutMs: 30_000 },
    );
    const payload = parseJsonOutput(result.stdout) ?? parseJsonOutput(result.stderr) ?? {};
    if (result.code !== 0 || payload.success === false) {
      throw new Error(withModeHint(payload.message || cliFailureText(result)));
    }
    return { song: publicSong(current.song), liked, alreadyLiked: false };
  };

  const likeCurrentSong = () => setCurrentSongLiked(true);
  const unlikeCurrentSong = () => setCurrentSongLiked(false);
  const readCurrentLiked = async () => {
    const current = await resolveCurrentSong();
    return { song: publicSong(current.song), liked: current.liked };
  };

  const autoplay = { mood: DEFAULT_AUTOPLAY.startupMood, running: false };

  const runAutoplay = async ({ mood, source } = {}) => {
    if (mood !== undefined) autoplay.mood = normalizeMood(mood);
    const config = await currentConfig();
    const base = { ok: false, mood: autoplay.mood, played: null, skipped: '' };
    if (!config.autoplay.enabled) return { ...base, skipped: 'disabled' };
    if (autoplay.running) return { ...base, skipped: 'busy' };

    autoplay.running = true;
    try {
      const current = await readPlayerState(true);
      if (player.paused === true) {
        return { ...base, skipped: 'paused' };
      }
      if (current.status !== 'stopped') {
        return { ...base, skipped: current.status };
      }
      const song = await pickSongForMood(autoplay.mood, {
        searchSongs: async (query, limit) => (await officialSearchSongs(config, query, limit ?? 50)).songs,
        searchPlaylistSongs: async (query) => searchMoodPlaylistSongs(query),
        isDuplicate: (candidate) => hasSong(candidate),
      });
      if (!song) return { ...base, skipped: 'no-song' };

      const play = await runCli(
        ['play', '--song', '--encrypted-id', song.encryptedId, '--original-id', String(song.originalId)],
        { timeoutMs: 60_000 },
      );
      const payload = parseJsonOutput(play.stdout) ?? parseJsonOutput(play.stderr) ?? {};
      if (play.code !== 0 || payload.success === false) {
        console.warn('[netease-request] 自动播放失败：', payload.message || cliFailureText(play));
        return { ...base, skipped: 'error' };
      }
      player.cacheAt = 0;
      player.queueAt = 0;
      rememberSong(song);
      return { ok: true, mood: autoplay.mood, played: publicSong(song), skipped: '' };
    } catch (error) {
      console.warn(`[netease-request] 自动播放失败（${source ?? 'unknown'}）：`, messageOf(error));
      return { ...base, skipped: 'error' };
    } finally {
      autoplay.running = false;
    }
  };

  const persistVolume = async (volume) => {
    player.volume = volume;
    state.config = { ...state.config, volume };
    try {
      await persistConfig(state.config);
    } catch (error) {
      console.warn('[netease-request] 保存音量失败：', messageOf(error));
    }
  };

  const handlePlayerState = async (request, response) => {
    if (request.method !== 'GET') {
      methodNotAllowed(response, 'GET');
      return;
    }
    try {
      const value = await readPlayerState();
      sendJson(response, 200, { ok: true, state: value });
    } catch (error) {
      throw new HttpError(502, messageOf(error));
    }
  };

  const handlePlayerLiked = async (request, response) => {
    if (request.method !== 'GET') {
      methodNotAllowed(response, 'GET');
      return;
    }
    try {
      const value = await readCurrentLiked();
      sendJson(response, 200, { ok: true, ...value });
    } catch (error) {
      throw new HttpError(409, messageOf(error));
    }
  };

  const handlePlayerQueue = async (request, response) => {
    if (request.method !== 'GET') {
      methodNotAllowed(response, 'GET');
      return;
    }
    try {
      const result = await runCli(['queue'], { timeoutMs: 10_000 });
      const payload = parseJsonOutput(result.stdout) ?? parseJsonOutput(result.stderr) ?? {};
      const items = Array.isArray(payload.queue)
        ? payload.queue.map((item) => {
          const index = Number(item?.index) || 0;
          let label = typeof item?.label === 'string' ? item.label : '';
          if (/^[0-9A-Fa-f]{32}$/.test(label)) {
            label = item?.current === true && typeof player.cache?.title === 'string' && player.cache.title !== ''
              ? player.cache.title
              : `曲目 ${index}`;
          }
          return { index, current: item?.current === true, label };
        })
        : [];
      sendJson(response, 200, {
        ok: true,
        queue: { total: Number(payload.total) || items.length, items },
      });
    } catch (error) {
      throw new HttpError(502, messageOf(error));
    }
  };

  const pumpVolume = async () => {
    if (player.volumeRunning) return;
    player.volumeRunning = true;
    try {
      while (player.volumeTarget !== null) {
        const target = player.volumeTarget;
        player.volumeTarget = null;
        try {
          await runCli(['volume', String(target)], { timeoutMs: 10_000 });
        } catch {
          // Volume is best-effort; the slider keeps the latest requested value.
        }
      }
    } finally {
      player.volumeRunning = false;
    }
  };

  const handlePlayerVolume = async (request, response) => {
    if (request.method !== 'POST') {
      methodNotAllowed(response, 'POST');
      return;
    }
    const body = await readJsonBody(request);
    const value = clampVolume(body?.value);
    player.volume = value;
    state.config = { ...state.config, volume: value };
    if (player.volumeSaveTimer !== null) clearTimeout(player.volumeSaveTimer);
    player.volumeSaveTimer = setTimeout(() => {
      player.volumeSaveTimer = null;
      state.config = { ...state.config, volume: player.volume };
      persistConfig(state.config).catch((error) => {
        console.warn('[netease-request] 保存音量失败：', messageOf(error));
      });
    }, 400);
    player.volumeTarget = value;
    void pumpVolume();
    sendJson(response, 200, { ok: true, volume: value });
  };

  const handlePlayerControl = async (request, response) => {
    if (request.method !== 'POST') {
      methodNotAllowed(response, 'POST');
      return;
    }
    const body = await readJsonBody(request);
    const action = typeof body?.action === 'string' ? body.action : '';
    if (action === 'like' || action === 'unlike') {
      try {
        const result = await (action === 'like' ? likeCurrentSong() : unlikeCurrentSong());
        player.cacheAt = 0;
        const next = await readPlayerState(true);
        sendJson(response, 200, { ok: true, ...result, state: next });
      } catch (error) {
        throw new HttpError(409, messageOf(error));
      }
      return;
    }
    let args;
    if (action === 'pause') args = ['pause'];
    else if (action === 'resume') args = ['resume'];
    else if (action === 'stop') args = ['stop'];
    else if (action === 'next') args = ['next'];
    else if (action === 'prev') args = ['prev'];
    else if (action === 'queueClear') args = ['queue', 'clear'];
    else if (action === 'seek') {
      args = ['seek', String(Math.max(0, Math.round(Number(body?.value) || 0)))];
    } else if (action === 'volume') {
      args = ['volume', String(clampVolume(body?.value))];
    } else {
      throw new HttpError(400, '未知的播放控制');
    }

    let result;
    try {
      result = await runCli(args, { timeoutMs: 20_000 });
    } catch (error) {
      throw new HttpError(502, messageOf(error));
    }
    const payload = parseJsonOutput(result.stdout) ?? parseJsonOutput(result.stderr) ?? {};
    if (result.code !== 0 || payload.success === false) {
      throw new HttpError(409, payload.message || withModeHint(cliFailureText(result)));
    }
    if (action === 'volume') await persistVolume(clampVolume(body?.value));
    if (action === 'pause') player.paused = true;
    else if (action === 'resume' || action === 'next' || action === 'prev' || action === 'stop' || action === 'queueClear') {
      player.paused = false;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
    player.cacheAt = 0;
    player.queueAt = 0;
    const next = await readPlayerState(true);
    sendJson(response, 200, { ok: true, state: next });
  };

  const handleConfig = async (request, response) => {
    if (request.method === 'GET') {
      const config = await currentConfig();
      sendJson(response, 200, {
        ok: true,
        config: publicConfig(config),
        defaults: publicConfig(DEFAULT_CONFIG),
        players: OFFICIAL_PLAYERS,
        configPath: configFilePath(),
      });
      return;
    }
    if (request.method !== 'PUT' && request.method !== 'POST') {
      methodNotAllowed(response, 'GET, PUT');
      return;
    }
    const body = await readJsonBody(request);
    const patch = body && typeof body === 'object' && body.config ? body.config : body;
    let saved;
    try {
      saved = await saveConfig(patch);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(400, messageOf(error));
    }

    const official = await applyOfficialSettings(saved.official);
    sendJson(response, 200, {
      ok: true,
      config: publicConfig(saved),
      official,
      configPath: configFilePath(),
    });
  };

  const handleOfficialStatus = async (request, response) => {
    if (request.method !== 'GET') {
      methodNotAllowed(response, 'GET');
      return;
    }
    const config = await currentConfig();
    const status = await officialStatus(config);
    sendJson(response, 200, { ok: true, official: status });
  };

  const handleOfficialLogin = async (request, response) => {
    if (request.method !== 'POST') {
      methodNotAllowed(response, 'POST');
      return;
    }
    const result = await startOfficialLogin();
    sendJson(response, 200, { ok: true, login: result });
  };

  const guarded = (handler) => async (request, response) => {
    try {
      await handler(request, response);
    } catch (error) {
      sendError(response, error);
    }
  };

  ctx.effect(() => {
    const disposers = [
      ctx.webServer.register({
        kind: 'exact',
        path: `${ROUTE_ROOT}/config`,
        handler: guarded(handleConfig),
      }),
      ctx.webServer.register({
        kind: 'exact',
        path: `${ROUTE_ROOT}/official/status`,
        handler: guarded(handleOfficialStatus),
      }),
      ctx.webServer.register({
        kind: 'exact',
        path: `${ROUTE_ROOT}/official/login`,
        handler: guarded(handleOfficialLogin),
      }),
      ctx.webServer.register({
        kind: 'exact',
        path: `${ROUTE_ROOT}/player/state`,
        handler: guarded(handlePlayerState),
      }),
      ctx.webServer.register({
        kind: 'exact',
        path: `${ROUTE_ROOT}/player/liked`,
        handler: guarded(handlePlayerLiked),
      }),
      ctx.webServer.register({
        kind: 'exact',
        path: `${ROUTE_ROOT}/player/queue`,
        handler: guarded(handlePlayerQueue),
      }),
      ctx.webServer.register({
        kind: 'exact',
        path: `${ROUTE_ROOT}/player/volume`,
        handler: guarded(handlePlayerVolume),
      }),
      ctx.webServer.register({
        kind: 'exact',
        path: `${ROUTE_ROOT}/player/control`,
        handler: guarded(handlePlayerControl),
      }),
    ];
    return () => {
      for (const dispose of disposers) dispose();
    };
  }, 'netease-request: settings HTTP API');

  ctx.effect(() => {
    let active = true;
    let pollTimer = null;
    const schedulePoll = async () => {
      const config = await currentConfig();
      if (!active) return;
      const minutes = Math.max(1, Number(config.autoplay.pollMinutes) || 5);
      pollTimer = setTimeout(async () => {
        if (!active) return;
        await runAutoplay({ source: 'poll' });
        if (active) void schedulePoll();
      }, minutes * 60_000);
    };

    const startupTimer = setTimeout(() => {
      if (!active) return;
      void currentConfig().then((config) => {
        if (!active || !config.autoplay.enabled || !config.autoplay.onStartup) return;
        autoplay.mood = normalizeMood(config.autoplay.startupMood);
        void runAutoplay({ source: 'startup', mood: config.autoplay.startupMood });
      });
    }, 5_000);

    void schedulePoll();
    return () => {
      active = false;
      clearTimeout(startupTimer);
      if (pollTimer !== null) clearTimeout(pollTimer);
    };
  }, 'netease-request: autoplay timers');

  ctx.effect(() => {
    const persistAndStop = () => {
      saveHistory();
      stopPlaybackSync();
    };
    process.once('exit', persistAndStop);
    return () => {
      process.removeListener('exit', persistAndStop);
      saveHistory();
      stopPlaybackSync();
    };
  }, 'netease-request: persist history and stop player on dispose');

  ctx.effect(() => {
    const disposers = createToolDefinitions(currentConfig, {
      applyMood: (mood) => runAutoplay({ mood, source: 'tool' }),
      likeCurrent: () => likeCurrentSong(),
      unlikeCurrent: () => unlikeCurrentSong(),
    }).map((definition) => ctx.tools.register(definition));
    return () => {
      for (const dispose of disposers) dispose();
    };
  }, 'netease-request: agent tools');
}

export const name = 'netease-request';
export const inject = ['tools', 'webServer'];
