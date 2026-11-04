/**
 * Client half: the "网易云点歌" settings page.
 *
 * Registers one page in the Settings panel (`settings.section`). The plugin uses
 * the official NetEase open platform through `@music163/ncm-cli`: App ID +
 * private key are written into the CLI configuration, and the page reports the
 * CLI/login/mpv state for that account.
 */

window.__ModuleLoader__.load({
  id: '@local/netease-request',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useRef, useState } = React;

    const NS = 'netease-request';
    const API = '/plugin-api/netease-request';

    const zh = {
      nav: '网易云点歌',
      title: '网易云点歌',
      subtitle: '个人点歌插件：通过官方开放平台（ncm-cli）搜索歌曲并在本机播放。',
      loading: '正在加载配置…',
      loadFailed: '加载配置失败',
      officialTitle: '官方开放平台',
      officialIntro: '使用你的 App ID / Private Key 调用官方 ncm-cli；点歌会在本机播放（需要 mpv）。',
      appId: 'App ID',
      appIdHint: '开放平台控制台里的 App ID。',
      privateKey: 'Private Key',
      privateKeyHint: '仅保存在本机配置文件；保存后不会再回显。留空表示不修改。',
      privateKeySaved: '已保存，留空表示不修改',
      player: '播放器',
      playerHint: 'Windows 请选 mpv；orpheus 仅 macOS。',
      playerMpv: 'mpv（内置播放器）',
      playerOrpheus: '网易云 App（仅 macOS）',
      officialStatus: '运行状态',
      checkStatus: '检查状态',
      checking: '检查中…',
      startLogin: '启动扫码登录',
      starting: '启动中…',
      loggedIn: '已登录',
      notLoggedIn: '未登录',
      loginHint: '登录需要在终端扫码，或点击左侧按钮启动：',
      loginCommand: 'ncm-cli login --background',
      loginOutput: '登录输出',
      cliMissing: '未安装 ncm-cli',
      mpvMissing: '未检测到 mpv',
      mpvOk: 'mpv 已安装',
      appIdMissing: 'CLI 未配置 App ID',
      save: '保存',
      saving: '保存中…',
      discard: '撤销修改',
      saved: '配置已保存，工具立即生效。',
      saveFailed: '保存失败',
      applied: '已写入 ncm-cli 配置',
      applyFailed: '写入 ncm-cli 配置失败',
      statusOk: '官方链路就绪',
      statusWarn: '官方链路未就绪',
      statusFailed: '状态检查失败',
      autoplayTitle: '自动播放',
      autoplayEnable: '自动播放',
      autoplayEnableHint: '只在当前没有播放时添加一首歌，不会打断正在播放或暂停的音乐。',
      autoplayStartup: '启动时播放',
      autoplayPoll: '轮询间隔（分钟）',
      autoplayMood: '启动风格',
      autoplayFollow: '根据对话调整风格',
      moodCalm: '舒缓',
      moodFocus: '专注',
      moodUpbeat: '轻快',
      moodCelebration: '庆祝',
      moodRomantic: '暧昧',
      moodPlayful: '俏皮',
      moodNight: '夜晚',
      moodLonely: '孤独',
      moodMelancholy: '伤感',
      moodNostalgic: '怀旧',
      moodHopeful: '希望',
      moodEthereal: '空灵',
      moodPastoral: '田园',
      moodMajestic: '威严',
      moodEpic: '史诗',
      moodBattle: '战斗',
      moodTense: '紧张',
      moodMystery: '悬疑',
      moodHorror: '惊悚',
      moodDark: '黑暗',
      configPath: '配置文件',
      playerUnknown: '网易云音乐',
      playerQueue: '队列',
      playerVolume: '音量',
      playerPrev: '上一首',
      playerNext: '下一首',
      playerPlay: '播放',
      playerPause: '暂停',
      playerLike: '喜欢',
      playerUnlike: '取消喜欢',
      playerError: '播放控制失败',
      playerIdle: '未在播放',
      playerIdleHint: '说「放首歌」即可开始',
      playerQueueView: '查看队列',
      playerQueueHide: '收起队列',
      playerQueueSkip: '跳过当前',
      playerQueueClear: '清空队列',
      playerQueueClearConfirm: '确定清空播放队列并停止播放？',
      playerQueueEmpty: '队列为空',
      playerQueueLoading: '正在读取队列…',
      playerQueueRefresh: '刷新',
      usage: '怎么点歌',
      usageIntro: '在对话里直接说：',
      usageExample: '点歌 <歌名> <歌手>',
      usageSearch: 'netease_search_songs：列出候选歌曲。',
      usageRequest: 'netease_request_song：选中歌曲并在本机播放。',
      usageTip: '播放依赖 ncm-cli 登录态与 mpv；播放链接不会由本插件生成。',
      noCli: '需要先安装官方 CLI：npm install -g @music163/ncm-cli',
      noMpv: '本机播放需要 mpv。安装后点「检查状态」刷新。',
      unknown: '未知',
    };

    const en = {
      nav: 'NetEase Requests',
      title: 'NetEase Music Requests',
      subtitle: 'Personal song requests through the official open platform (ncm-cli), playing locally.',
      loading: 'Loading settings…',
      loadFailed: 'Could not load settings',
      officialTitle: 'Official open platform',
      officialIntro: 'Uses your App ID and private key with the official ncm-cli. Requesting a song plays it locally (mpv required).',
      appId: 'App ID',
      appIdHint: 'The App ID from the open-platform console.',
      privateKey: 'Private Key',
      privateKeyHint: 'Stored only in the local config file and never echoed back. Leave empty to keep the saved value.',
      privateKeySaved: 'Saved — leave empty to keep it',
      player: 'Player',
      playerHint: 'Choose mpv on Windows; orpheus is macOS-only.',
      playerMpv: 'mpv (built-in player)',
      playerOrpheus: 'NetEase app (macOS only)',
      officialStatus: 'Runtime status',
      checkStatus: 'Check status',
      checking: 'Checking…',
      startLogin: 'Start QR login',
      starting: 'Starting…',
      loggedIn: 'Signed in',
      notLoggedIn: 'Not signed in',
      loginHint: 'Scan the QR in a terminal, or start it with the button on the left:',
      loginCommand: 'ncm-cli login --background',
      loginOutput: 'Login output',
      cliMissing: 'ncm-cli is not installed',
      mpvMissing: 'mpv not detected',
      mpvOk: 'mpv installed',
      appIdMissing: 'CLI has no App ID',
      save: 'Save',
      saving: 'Saving…',
      discard: 'Discard changes',
      saved: 'Saved. The tools pick it up immediately.',
      saveFailed: 'Save failed',
      applied: 'Written to ncm-cli config',
      applyFailed: 'Could not write ncm-cli config',
      statusOk: 'official path ready',
      statusWarn: 'official path not ready',
      statusFailed: 'Status check failed',
      autoplayTitle: 'Autoplay',
      autoplayEnable: 'Autoplay',
      autoplayEnableHint: 'Only adds one song when nothing is playing; never interrupts playing or paused music.',
      autoplayStartup: 'Play on startup',
      autoplayPoll: 'Poll interval (minutes)',
      autoplayMood: 'Startup mood',
      autoplayFollow: 'Adjust the style to the conversation',
      moodCalm: 'Calm',
      moodFocus: 'Focus',
      moodUpbeat: 'Upbeat',
      moodCelebration: 'Celebration',
      moodRomantic: 'Romantic tension',
      moodPlayful: 'Playful',
      moodNight: 'Night',
      moodLonely: 'Lonely',
      moodMelancholy: 'Melancholy',
      moodNostalgic: 'Nostalgic',
      moodHopeful: 'Hopeful',
      moodEthereal: 'Ethereal',
      moodPastoral: 'Pastoral',
      moodMajestic: 'Majestic',
      moodEpic: 'Epic',
      moodBattle: 'Battle',
      moodTense: 'Tense',
      moodMystery: 'Mystery',
      moodHorror: 'Horror',
      moodDark: 'Dark',
      configPath: 'Config file',
      playerUnknown: 'NetEase Music',
      playerQueue: 'Queue',
      playerVolume: 'Volume',
      playerPrev: 'Previous',
      playerNext: 'Next',
      playerPlay: 'Play',
      playerPause: 'Pause',
      playerLike: 'Like',
      playerUnlike: 'Unlike',
      playerError: 'Playback control failed',
      playerIdle: 'Nothing playing',
      playerIdleHint: 'Ask to play a song to start',
      playerQueueView: 'View queue',
      playerQueueHide: 'Hide queue',
      playerQueueSkip: 'Skip current',
      playerQueueClear: 'Clear queue',
      playerQueueClearConfirm: 'Clear the play queue and stop playback?',
      playerQueueEmpty: 'Queue is empty',
      playerQueueLoading: 'Loading queue…',
      playerQueueRefresh: 'Refresh',
      usage: 'How to request a song',
      usageIntro: 'Just ask in chat:',
      usageExample: 'play "<song>" by <artist>',
      usageSearch: 'netease_search_songs: list candidate songs.',
      usageRequest: 'netease_request_song: pick a song and play it locally.',
      usageTip: 'Playback depends on the ncm-cli login and mpv; this plugin never fabricates a stream URL.',
      noCli: 'Install the official CLI first: npm install -g @music163/ncm-cli',
      noMpv: 'Local playback needs mpv. Install it, then press "Check status".',
      unknown: 'unknown',
    };

    const MOOD_OPTIONS = [
      ['calm', 'moodCalm'],
      ['focus', 'moodFocus'],
      ['upbeat', 'moodUpbeat'],
      ['celebration', 'moodCelebration'],
      ['romantic', 'moodRomantic'],
      ['playful', 'moodPlayful'],
      ['night', 'moodNight'],
      ['lonely', 'moodLonely'],
      ['melancholy', 'moodMelancholy'],
      ['nostalgic', 'moodNostalgic'],
      ['hopeful', 'moodHopeful'],
      ['ethereal', 'moodEthereal'],
      ['pastoral', 'moodPastoral'],
      ['majestic', 'moodMajestic'],
      ['epic', 'moodEpic'],
      ['battle', 'moodBattle'],
      ['tense', 'moodTense'],
      ['mystery', 'moodMystery'],
      ['horror', 'moodHorror'],
      ['dark', 'moodDark'],
    ];

    const CSS = [
      '.nr-page{display:flex;flex-direction:column;gap:14px;max-width:720px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}',
      '.nr-title{margin:0;font-size:16px;font-weight:600;line-height:24px}',
      '.nr-subtitle{margin:0;color:var(--dsw-alias-label-secondary)}',
      '.nr-card{display:flex;flex-direction:column;gap:12px;padding:14px 16px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}',
      '.nr-cardTitle{margin:0;font-size:13px;font-weight:600}',
      '.nr-field{display:flex;flex-direction:column;gap:4px;min-width:0}',
      '.nr-label{font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.nr-input,.nr-select{box-sizing:border-box;width:100%;min-height:32px;padding:5px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;outline:none}',
      '.nr-input:focus,.nr-select:focus{border-color:var(--dsw-alias-brand-primary)}',
      '.nr-input:disabled,.nr-select:disabled{opacity:.6}',
      '.nr-hint{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}',
      '.nr-check{display:flex;align-items:center;gap:8px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary)}',
      '.nr-check input{width:14px;height:14px;margin:0;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}',
      '.nr-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}',
      '.nr-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.nr-btn{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);border-radius:8px;padding:4px 14px;font:inherit;font-size:12px;line-height:20px;cursor:pointer;white-space:nowrap}',
      '.nr-btn:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary)}',
      '.nr-btn:disabled{opacity:.5;cursor:default}',
      '.nr-primary{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-brand-primary);color:#fff}',
      '.nr-primary:hover:not(:disabled){filter:brightness(.92)}',
      '.nr-notice{padding:8px 10px;border-radius:8px;font-size:12px;line-height:18px;border:1px solid var(--dsw-alias-border-l2)}',
      '.nr-noticeOk{color:var(--dsw-alias-state-success-primary)}',
      '.nr-noticeErr{color:var(--dsw-alias-state-error-primary)}',
      '.nr-noticeWarn{color:var(--dsw-alias-state-warn-primary)}',
      '.nr-path{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);word-break:break-all;user-select:text}',
      '.nr-code{display:inline-block;padding:1px 6px;border-radius:6px;background:var(--dsw-alias-bg-layer-2);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;user-select:text}',
      '.nr-example{margin:0;padding:8px 10px;border-radius:8px;border:1px dashed var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;user-select:text}',
      '.nr-status{display:flex;flex-wrap:wrap;gap:6px 12px;padding:8px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);font-size:12px;line-height:18px}',
      '.nr-statusItem{color:var(--dsw-alias-label-secondary)}',
      '.nr-statusItem b{color:var(--dsw-alias-label-primary);font-weight:500}',
      '.nr-pre{margin:0;max-height:180px;overflow:auto;padding:8px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;line-height:16px;white-space:pre-wrap;word-break:break-all;user-select:text}',
      '.nr-warn{color:var(--dsw-alias-state-warn-primary)}',
      '.nr-okText{color:var(--dsw-alias-state-success-primary)}',
      '.np-root{width:100%;max-width:760px;margin:0 auto;padding:0 16px;box-sizing:border-box;color:var(--dsw-alias-label-primary);font-size:12px}',
      '.np-bar{display:flex;align-items:center;gap:10px;padding:6px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}',
      '.np-note{display:flex;align-items:center;justify-content:center;flex:none;width:26px;height:26px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary)}',
      '.np-info{display:flex;flex-direction:column;gap:3px;flex:1;min-width:0}',
      '.np-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:16px;font-weight:500}',
      '.np-row{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:14px}',
      '.np-track{position:relative;flex:1;height:4px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);cursor:pointer;overflow:hidden;min-width:40px}',
      '.np-fill{height:100%;border-radius:999px;background:var(--dsw-alias-brand-primary)}',
      '.np-controls{display:flex;align-items:center;gap:2px;flex:none}',
      '.np-btn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer}',
      '.np-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}',
      '.np-btn:disabled{opacity:.4;cursor:default}',
      '.np-play{border-radius:999px;background:var(--dsw-alias-brand-primary);color:#fff}',
      '.np-play:hover:not(:disabled){filter:brightness(.92);background:var(--dsw-alias-brand-primary)}',
      '.np-volWrap{display:flex;align-items:center;gap:4px;flex:none;color:var(--dsw-alias-label-secondary)}',
      '.np-volume{width:64px;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}',
      '.np-queue{flex:none;padding:1px 6px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;white-space:nowrap}',
      '.np-error{margin-top:4px;padding:4px 8px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-state-error-primary);font-size:11px;line-height:16px}',
      '.npf-root{position:fixed;right:16px;bottom:16px;z-index:60;display:flex;flex-direction:column;align-items:flex-end;gap:6px;pointer-events:auto;color:var(--dsw-alias-label-primary);font-size:12px}',
      '.npf-bar{display:flex;align-items:center;gap:4px;padding:5px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:var(--dsw-alias-bg-overlay);box-shadow:0 6px 24px rgba(0,0,0,.18);max-width:320px}',
      '.npf-drag{display:flex;align-items:center;gap:6px;flex:1;min-width:0;cursor:grab;user-select:none;padding-right:2px}',
      '.npf-drag:active{cursor:grabbing}',
      '.npf-note{display:flex;align-items:center;justify-content:center;flex:none;width:22px;height:22px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary)}',
      '.npf-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:196px;font-size:12px;line-height:16px}',
      '.npf-btn{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:none;border-radius:999px;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;flex:none}',
      '.npf-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}',
      '.npf-btn:disabled{opacity:.4;cursor:default}',
      '.npf-play{background:var(--dsw-alias-brand-primary);color:#fff}',
      '.npf-play:hover:not(:disabled){filter:brightness(.92);background:var(--dsw-alias-brand-primary)}',
      '.npf-panel{display:flex;flex-direction:column;gap:8px;width:280px;padding:10px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-overlay);box-shadow:0 10px 30px rgba(0,0,0,.22)}',
      '.npf-row{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:14px}',
      '.npf-track{position:relative;flex:1;height:4px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);cursor:pointer;overflow:hidden;min-width:40px}',
      '.npf-fill{height:100%;border-radius:999px;background:var(--dsw-alias-brand-primary)}',
      '.npf-controls{display:flex;align-items:center;gap:4px}',
      '.npf-queue{margin-left:auto;padding:1px 6px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;white-space:nowrap}',
      '.npf-vol{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary)}',
      '.npf-vol input{flex:1;min-width:0;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}',
      '.npf-error{width:280px;padding:4px 8px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-state-error-primary);font-size:11px;line-height:16px;background:var(--dsw-alias-bg-overlay)}',
      '.nsp-root{position:relative;display:inline-flex}',
      '.nsp-trigger{position:relative;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}',
      '.nsp-trigger:hover,.nsp-trigger.is-open{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.nsp-dot{position:absolute;right:4px;bottom:4px;width:5px;height:5px;border-radius:999px;background:var(--dsw-alias-state-success-primary)}',
      '.nsp-pop{position:fixed;z-index:80;display:flex;flex-direction:column;gap:8px;width:280px;box-sizing:border-box;padding:10px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-overlay);box-shadow:0 10px 30px rgba(0,0,0,.22);color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px}',
      '.nsp-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}',
      '.nsp-row{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:14px}',
      '.nsp-track{position:relative;flex:1;height:4px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);cursor:pointer;overflow:hidden;min-width:40px}',
      '.nsp-fill{height:100%;border-radius:999px;background:var(--dsw-alias-brand-primary)}',
      '.nsp-controls{display:flex;align-items:center;gap:4px}',
      '.nsp-btn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:none;border-radius:999px;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;flex:none}',
      '.nsp-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}',
      '.nsp-btn:disabled{opacity:.4;cursor:default}',
      '.nsp-play{background:var(--dsw-alias-brand-primary);color:#fff}',
      '.nsp-play:hover:not(:disabled){filter:brightness(.92);background:var(--dsw-alias-brand-primary)}',
      '.nsp-queue{margin-left:auto;padding:1px 6px;border:none;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;line-height:16px;white-space:nowrap;cursor:pointer}',
      '.nsp-queue:hover{color:var(--dsw-alias-label-primary)}',
      '.nsp-vol{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary)}',
      '.nsp-vol input{flex:1;min-width:0;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}',
      '.nsp-error{padding:4px 8px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-state-error-primary);font-size:11px;line-height:16px}',
      '.nsp-hint{font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}',
      '.nsp-queuePanel{display:flex;flex-direction:column;gap:1px;max-height:154px;overflow-y:auto;padding-top:4px;border-top:1px solid var(--dsw-alias-border-l1)}',
      '.nsp-queueRow{display:flex;align-items:center;gap:6px;min-width:0;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}',
      '.nsp-queueRow.is-current{color:var(--dsw-alias-brand-primary);font-weight:600}',
      '.nsp-queueIndex{flex:none;width:18px;text-align:right;opacity:.7}',
      '.nsp-queueTitle{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '@media (max-width:640px){.np-volume{width:44px}.np-queue{display:none}}',
      '@media (max-width:520px){.nr-grid{grid-template-columns:minmax(0,1fr)}}',
    ].join('\n');

    function asRecord(value) {
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    }

    function draftFromConfig(config) {
      const source = asRecord(config);
      const official = asRecord(source.official);
      const autoplay = asRecord(source.autoplay);
      return {
        searchLimit: String(source.searchLimit ?? 10),
        official: {
          appId: String(official.appId ?? ''),
          privateKey: '',
          player: String(official.player ?? 'mpv'),
          privateKeySet: official.privateKeySet === true,
        },
        autoplay: {
          enabled: autoplay.enabled === true,
          onStartup: autoplay.onStartup !== false,
          pollMinutes: String(autoplay.pollMinutes ?? 5),
          startupMood: String(autoplay.startupMood ?? 'calm'),
          followConversation: autoplay.followConversation !== false,
        },
      };
    }

    function formatClock(seconds) {
      const total = Math.max(0, Math.round(Number(seconds) || 0));
      return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
    }

    function PlayerIcon(props) {
      const shape = props.kind;
      if (shape === 'volume') {
        return h('svg', { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true, focusable: false },
          h('path', { d: 'M2 6h3l4-3v10l-4-3H2z', fill: 'currentColor' }),
          h('path', {
            d: 'M11 6.2a3 3 0 010 3.6M12.8 4.5a5.5 5.5 0 010 7',
            fill: 'none', stroke: 'currentColor', 'stroke-width': 1.2, 'stroke-linecap': 'round',
          }),
        );
      }
      if (shape === 'heart' || shape === 'heartFilled') {
        const d = 'M8 13.7S2.3 10.2 2.3 6.2A3.2 3.2 0 018 4.2a3.2 3.2 0 015.7 2c0 4-5.7 7.5-5.7 7.5z';
        return h('svg', { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true, focusable: false },
          h('path', {
            d,
            fill: shape === 'heartFilled' ? 'currentColor' : 'none',
            stroke: shape === 'heart' ? 'currentColor' : 'none',
            'stroke-width': shape === 'heart' ? 1.2 : 0,
            'stroke-linejoin': 'round',
          }),
        );
      }
      const paths = {
        prev: ['M4 3h2v10H4z', 'M14 3v10L6 8z'],
        next: ['M12 3h2v10h-2z', 'M2 3v10l8-5z'],
        play: ['M4 2.5v11l9-5.5z'],
        pause: ['M4 3h3v10H4z', 'M9 3h3v10H9z'],
        heart: ['M8 13.7S2.3 10.2 2.3 6.2A3.2 3.2 0 018 4.2a3.2 3.2 0 015.7 2c0 4-5.7 7.5-5.7 7.5z'],
      };
      const list = paths[shape] ?? paths.play;
      return h('svg', { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true, focusable: false },
        list.map((d, index) => h('path', { key: index, d, fill: 'currentColor' })),
      );
    }

    function makePlayerBar(t) {
      return function NowPlaying() {
        const [player, setPlayer] = useState(null);
        const [volume, setVolume] = useState(50);
        const [busy, setBusy] = useState(false);
        const [error, setError] = useState('');

        useEffect(() => {
          let alive = true;
          let timer;
          const tick = async () => {
            let delay = 8000;
            try {
              if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
                delay = 10000;
              } else {
                const response = await fetch(`${API}/player/state`, { headers: { accept: 'application/json' } });
                const data = await response.json().catch(() => null);
                if (alive && response.ok && data?.ok && data.state) {
                  setPlayer(data.state);
                  if (typeof data.state.volume === 'number') setVolume(data.state.volume);
                  setError('');
                  delay = data.state.status === 'playing'
                    ? 2000
                    : data.state.status === 'paused'
                      ? 3000
                      : 8000;
                }
              }
            } catch (fetchError) {
              if (alive) setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
            }
            if (alive) timer = setTimeout(tick, delay);
          };
          void tick();
          return () => {
            alive = false;
            clearTimeout(timer);
          };
        }, []);

        const control = async (action, value) => {
          if (busy) return;
          setBusy(true);
          setError('');
          try {
            const response = await fetch(`${API}/player/control`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ action, value }),
            });
            const data = await response.json().catch(() => null);
            if (!response.ok || !data?.ok) {
              throw new Error(data?.error?.message || `HTTP ${response.status}`);
            }
            if (data.state) {
              setPlayer(data.state);
              if (typeof data.state.volume === 'number') setVolume(data.state.volume);
            }
          } catch (controlError) {
            setError(`${t('playerError')}：${controlError instanceof Error ? controlError.message : String(controlError)}`);
          } finally {
            setBusy(false);
          }
        };

        if (!player || player.status === 'stopped' || player.status === '') return null;

        const playing = player.status === 'playing';
        const duration = Number(player.duration) || 0;
        const position = Number(player.position) || 0;
        const percent = duration > 0 ? Math.min(Math.max((position / duration) * 100, 0), 100) : 0;

        const seek = (event) => {
          if (duration <= 0 || busy) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
          void control('seek', ratio * duration);
        };

        return h('div', { className: 'np-root' },
          h('style', null, CSS),
          h('div', { className: 'np-bar' },
            h('span', { className: 'np-note' }, h(PlayerIcon, { kind: 'volume' })),
            h('div', { className: 'np-info' },
              h('div', { className: 'np-title', title: player.title || '' },
                player.title || t('playerUnknown'),
              ),
              h('div', { className: 'np-row' },
                h('span', null, formatClock(position)),
                h('div', {
                  className: 'np-track',
                  role: 'progressbar',
                  tabIndex: 0,
                  'aria-valuemin': 0,
                  'aria-valuemax': Math.round(duration),
                  'aria-valuenow': Math.round(position),
                  onClick: seek,
                  onKeyDown: (event) => {
                    if (event.key === 'ArrowRight') void control('seek', position + 5);
                    else if (event.key === 'ArrowLeft') void control('seek', position - 5);
                  },
                }, h('div', { className: 'np-fill', style: { width: `${percent}%` } })),
                h('span', null, formatClock(duration)),
              ),
            ),
            h('div', { className: 'np-controls' },
              h('button', {
                className: 'np-btn', type: 'button', title: t('playerPrev'), disabled: busy,
                onClick: () => void control('prev'),
              }, h(PlayerIcon, { kind: 'prev' })),
              h('button', {
                className: 'np-btn np-play', type: 'button',
                title: playing ? t('playerPause') : t('playerPlay'), disabled: busy,
                onClick: () => void control(playing ? 'pause' : 'resume'),
              }, h(PlayerIcon, { kind: playing ? 'pause' : 'play' })),
              h('button', {
                className: 'np-btn', type: 'button', title: t('playerNext'), disabled: busy,
                onClick: () => void control('next'),
              }, h(PlayerIcon, { kind: 'next' })),
            ),
            h('div', { className: 'np-volWrap' },
              h('span', { title: t('playerVolume') }, h(PlayerIcon, { kind: 'volume' })),
              h('input', {
                className: 'np-volume', type: 'range', min: 0, max: 100, value: volume, disabled: busy,
                'aria-label': t('playerVolume'),
                onChange: (event) => setVolume(Number(event.target.value)),
                onPointerUp: (event) => void control('volume', Number(event.currentTarget.value)),
                onKeyUp: (event) => {
                  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                    void control('volume', Number(event.currentTarget.value));
                  }
                },
              }),
              h('span', null, String(volume)),
            ),
            h('span', { className: 'np-queue', title: t('playerQueue') },
              `${t('playerQueue')} ${player.queueLength}`,
            ),
          ),
          error ? h('div', { className: 'np-error' }, error) : null,
        );
      };
    }

    function makeFloatingPlayer(t) {
      return function FloatingPlayer() {
        const [player, setPlayer] = useState(null);
        const [volume, setVolume] = useState(50);
        const [busy, setBusy] = useState(false);
        const [error, setError] = useState('');
        const [expanded, setExpanded] = useState(false);
        const [position, setPosition] = useState(() => {
          try {
            const raw = window.localStorage.getItem('netease-request-player-position');
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y)) {
                return { x: parsed.x, y: parsed.y };
              }
            }
          } catch {
            // ignore malformed stored position
          }
          return null;
        });
        const drag = useRef(null);

        useEffect(() => {
          let alive = true;
          let timer;
          const tick = async () => {
            let delay = 8000;
            try {
              if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
                delay = 10000;
              } else {
                const response = await fetch(`${API}/player/state`, { headers: { accept: 'application/json' } });
                const data = await response.json().catch(() => null);
                if (alive && response.ok && data?.ok && data.state) {
                  setPlayer(data.state);
                  if (typeof data.state.volume === 'number') setVolume(data.state.volume);
                  setError('');
                  delay = data.state.status === 'playing'
                    ? 2000
                    : data.state.status === 'paused'
                      ? 3000
                      : 8000;
                }
              }
            } catch (fetchError) {
              if (alive) setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
            }
            if (alive) timer = setTimeout(tick, delay);
          };
          void tick();
          return () => {
            alive = false;
            clearTimeout(timer);
          };
        }, []);

        const control = async (action, value) => {
          if (busy) return;
          setBusy(true);
          setError('');
          try {
            const response = await fetch(`${API}/player/control`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ action, value }),
            });
            const data = await response.json().catch(() => null);
            if (!response.ok || !data?.ok) {
              throw new Error(data?.error?.message || `HTTP ${response.status}`);
            }
            if (data.state) {
              setPlayer(data.state);
              if (typeof data.state.volume === 'number') setVolume(data.state.volume);
            }
          } catch (controlError) {
            setError(`${t('playerError')}：${controlError instanceof Error ? controlError.message : String(controlError)}`);
          } finally {
            setBusy(false);
          }
        };

        const clampX = (x, width) => Math.min(Math.max(x, 8), Math.max(8, window.innerWidth - width - 8));
        const clampY = (y) => Math.min(Math.max(y, 8), Math.max(8, window.innerHeight - 64));

        const persistPosition = (next) => {
          try {
            window.localStorage.setItem('netease-request-player-position', JSON.stringify(next));
          } catch {
            // ignore storage failures
          }
        };

        const onPointerDown = (event) => {
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          const rect = event.currentTarget.getBoundingClientRect();
          drag.current = {
            dx: event.clientX - rect.left,
            dy: event.clientY - rect.top,
            startX: event.clientX,
            startY: event.clientY,
            moved: false,
            width: rect.width,
          };
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // capture is best-effort
          }
        };

        const onPointerMove = (event) => {
          const state = drag.current;
          if (!state) return;
          if (!state.moved && Math.hypot(event.clientX - state.startX, event.clientY - state.startY) < 4) return;
          state.moved = true;
          setPosition({
            x: clampX(event.clientX - state.dx, state.width),
            y: clampY(event.clientY - state.dy),
          });
        };

        const onPointerUp = (event) => {
          const state = drag.current;
          drag.current = null;
          try {
            event.currentTarget.releasePointerCapture(event.pointerId);
          } catch {
            // ignore
          }
          if (!state) return;
          if (state.moved) {
            const next = {
              x: clampX(event.clientX - state.dx, state.width),
              y: clampY(event.clientY - state.dy),
            };
            setPosition(next);
            persistPosition(next);
          } else {
            setExpanded((value) => !value);
          }
        };

        if (!player || player.status === 'stopped' || player.status === '') return null;

        const playing = player.status === 'playing';
        const duration = Number(player.duration) || 0;
        const position_ = Number(player.position) || 0;
        const percent = duration > 0 ? Math.min(Math.max((position_ / duration) * 100, 0), 100) : 0;

        const seek = (event) => {
          if (duration <= 0 || busy) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
          void control('seek', ratio * duration);
        };

        const panel = h('div', { className: 'npf-panel' },
          h('div', { className: 'npf-row' },
            h('span', null, formatClock(position_)),
            h('div', {
              className: 'npf-track',
              role: 'progressbar',
              tabIndex: 0,
              'aria-valuemin': 0,
              'aria-valuemax': Math.round(duration),
              'aria-valuenow': Math.round(position_),
              onClick: seek,
              onKeyDown: (event) => {
                if (event.key === 'ArrowRight') void control('seek', position_ + 5);
                else if (event.key === 'ArrowLeft') void control('seek', position_ - 5);
              },
            }, h('div', { className: 'npf-fill', style: { width: `${percent}%` } })),
            h('span', null, formatClock(duration)),
          ),
          h('div', { className: 'npf-controls' },
            h('button', {
              className: 'npf-btn', type: 'button', title: t('playerPrev'), disabled: busy,
              onClick: () => void control('prev'),
            }, h(PlayerIcon, { kind: 'prev' })),
            h('button', {
              className: 'npf-btn', type: 'button', title: t('playerNext'), disabled: busy,
              onClick: () => void control('next'),
            }, h(PlayerIcon, { kind: 'next' })),
            h('span', { className: 'npf-queue' }, `${t('playerQueue')} ${player.queueLength}`),
          ),
          h('div', { className: 'npf-vol' },
            h('span', { title: t('playerVolume') }, h(PlayerIcon, { kind: 'volume' })),
            h('input', {
              type: 'range', min: 0, max: 100, value: volume, disabled: busy,
              'aria-label': t('playerVolume'),
              onChange: (event) => setVolume(Number(event.target.value)),
              onPointerUp: (event) => void control('volume', Number(event.currentTarget.value)),
              onKeyUp: (event) => {
                if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                  void control('volume', Number(event.currentTarget.value));
                }
              },
            }),
            h('span', null, String(volume)),
          ),
        );

        const chevron = h('svg', {
          viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true, focusable: false,
        }, h('path', {
          d: expanded ? 'M3.5 10L8 5.5 12.5 10' : 'M3.5 6L8 10.5 12.5 6',
          fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4,
          'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        }));

        const style = position === null
          ? undefined
          : { left: `${position.x}px`, top: `${position.y}px`, right: 'auto', bottom: 'auto' };

        return h('div', { className: 'npf-root', style },
          h('style', null, CSS),
          expanded ? panel : null,
          h('div', { className: 'npf-bar' },
            h('div', {
              className: 'npf-drag',
              title: player.title || '',
              onPointerDown,
              onPointerMove,
              onPointerUp,
              style: { touchAction: 'none' },
            },
              h('span', { className: 'npf-note' }, h(PlayerIcon, { kind: 'volume' })),
              h('span', { className: 'npf-title' }, player.title || t('playerUnknown')),
            ),
            h('button', {
              className: 'npf-btn npf-play',
              type: 'button',
              title: playing ? t('playerPause') : t('playerPlay'),
              disabled: busy,
              onClick: () => void control(playing ? 'pause' : 'resume'),
            }, h(PlayerIcon, { kind: playing ? 'pause' : 'play' })),
            h('button', {
              className: 'npf-btn',
              type: 'button',
              title: expanded ? '收起' : '展开',
              onClick: () => setExpanded((value) => !value),
            }, chevron),
          ),
          error ? h('div', { className: 'npf-error' }, error) : null,
        );
      };
    }

    function makeSidebarPlayer(t) {
      return function SidebarPlayer() {
        const [player, setPlayer] = useState(null);
        const [volume, setVolume] = useState(50);
        const [busy, setBusy] = useState(false);
        const [error, setError] = useState('');
        const [liked, setLiked] = useState(false);
        const [likedLoading, setLikedLoading] = useState(false);
        const [open, setOpen] = useState(false);
        const [anchor, setAnchor] = useState(null);
        const [queueOpen, setQueueOpen] = useState(false);
        const [queue, setQueue] = useState(null);
        const [queueLoading, setQueueLoading] = useState(false);
        const [queueError, setQueueError] = useState('');
        const rootRef = useRef(null);
        const triggerRef = useRef(null);
        const lastVolumeAt = useRef(0);

        useEffect(() => {
          let alive = true;
          let timer;
          const tick = async () => {
            let delay = 8000;
            try {
              if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
                delay = 10000;
              } else {
                const response = await fetch(`${API}/player/state`, { headers: { accept: 'application/json' } });
                const data = await response.json().catch(() => null);
                if (alive && response.ok && data?.ok && data.state) {
                  setPlayer(data.state);
                  if (typeof data.state.volume === 'number') setVolume(data.state.volume);
                  setError('');
                  delay = data.state.status === 'playing'
                    ? 2000
                    : data.state.status === 'paused'
                      ? 3000
                      : 8000;
                }
              }
            } catch (fetchError) {
              if (alive) setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
            }
            if (alive) timer = setTimeout(tick, delay);
          };
          void tick();
          return () => {
            alive = false;
            clearTimeout(timer);
          };
        }, []);

        useEffect(() => {
          if (!open) return;
          let alive = true;
          setLikedLoading(true);
          fetch(`${API}/player/liked`, { headers: { accept: 'application/json' } })
            .then(async (response) => {
              const data = await response.json().catch(() => null);
              if (alive && response.ok && data?.ok) setLiked(data.liked === true);
            })
            .catch(() => {
              if (alive) setLiked(false);
            })
            .finally(() => {
              if (alive) setLikedLoading(false);
            });
          return () => {
            alive = false;
          };
        }, [open, player?.title, player?.currentIndex]);

        const control = async (action, value) => {
          if (busy) return;
          setBusy(true);
          setError('');
          try {
            const response = await fetch(`${API}/player/control`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ action, value }),
            });
            const data = await response.json().catch(() => null);
            if (!response.ok || !data?.ok) {
              throw new Error(data?.error?.message || `HTTP ${response.status}`);
            }
            if (data.state) {
              setPlayer(data.state);
              if (typeof data.state.volume === 'number') setVolume(data.state.volume);
            }
            if (action === 'like') setLiked(true);
            else if (action === 'unlike') setLiked(false);
          } catch (controlError) {
            setError(`${t('playerError')}：${controlError instanceof Error ? controlError.message : String(controlError)}`);
          } finally {
            setBusy(false);
          }
        };

        const loadQueue = async () => {
          setQueueLoading(true);
          setQueueError('');
          try {
            const response = await fetch(`${API}/player/queue`, { headers: { accept: 'application/json' } });
            const data = await response.json().catch(() => null);
            if (!response.ok || !data?.ok) {
              throw new Error(data?.error?.message || `HTTP ${response.status}`);
            }
            setQueue(asRecord(data.queue));
          } catch (queueFailure) {
            setQueueError(queueFailure instanceof Error ? queueFailure.message : String(queueFailure));
          } finally {
            setQueueLoading(false);
          }
        };

        const postVolume = (value) => fetch(`${API}/player/volume`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ value }),
        }).catch(() => {});

        const sendVolume = (value) => {
          const now = Date.now();
          if (now - lastVolumeAt.current < 30) return;
          lastVolumeAt.current = now;
          void postVolume(value);
        };

        const commitVolume = (value) => {
          lastVolumeAt.current = Date.now();
          void postVolume(value);
        };

        useEffect(() => {
          if (!queueOpen) return;
          void loadQueue();
        }, [queueOpen, player?.title, player?.currentIndex]);

        const place = () => {
          const rect = triggerRef.current?.getBoundingClientRect();
          if (!rect) return;
          setAnchor({
            left: Math.min(Math.max(rect.left, 8), Math.max(8, window.innerWidth - 288)),
            bottom: Math.max(8, window.innerHeight - rect.top + 8),
          });
        };

        const toggle = () => {
          if (open) {
            setOpen(false);
            return;
          }
          place();
          setOpen(true);
        };

        useEffect(() => {
          if (!open) return;
          place();
          const onResize = () => place();
          const onPointerDown = (event) => {
            if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
          };
          const onKeyDown = (event) => {
            if (event.key === 'Escape') setOpen(false);
          };
          window.addEventListener('resize', onResize);
          document.addEventListener('pointerdown', onPointerDown, true);
          document.addEventListener('keydown', onKeyDown);
          return () => {
            window.removeEventListener('resize', onResize);
            document.removeEventListener('pointerdown', onPointerDown, true);
            document.removeEventListener('keydown', onKeyDown);
          };
        }, [open]);

        const active = player !== null && (player.status === 'playing' || player.status === 'paused');
        const playing = player?.status === 'playing';
        const title = player?.title || t('playerIdle');
        const duration = active ? Number(player.duration) || 0 : 0;
        const position = active ? Number(player.position) || 0 : 0;
        const percent = duration > 0 ? Math.min(Math.max((position / duration) * 100, 0), 100) : 0;

        const seek = (event) => {
          if (duration <= 0 || busy) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
          void control('seek', ratio * duration);
        };

        const popover = open && anchor !== null
          ? h('div', {
            className: 'nsp-pop',
            style: { left: `${anchor.left}px`, bottom: `${anchor.bottom}px` },
            role: 'dialog',
            'aria-label': title,
          },
            h('div', { className: 'nsp-title', title }, title),
            active ? null : h('div', { className: 'nsp-hint' }, t('playerIdleHint')),
            h('div', { className: 'nsp-row' },
              h('span', null, formatClock(position)),
              h('div', {
                className: 'nsp-track',
                role: 'progressbar',
                tabIndex: 0,
                'aria-valuemin': 0,
                'aria-valuemax': Math.round(duration),
                'aria-valuenow': Math.round(position),
                onClick: seek,
                onKeyDown: (event) => {
                  if (event.key === 'ArrowRight') void control('seek', position + 5);
                  else if (event.key === 'ArrowLeft') void control('seek', position - 5);
                },
              }, h('div', { className: 'nsp-fill', style: { width: `${percent}%` } })),
              h('span', null, formatClock(duration)),
            ),
            h('div', { className: 'nsp-controls' },
              h('button', {
                className: 'nsp-btn nsp-play', type: 'button',
                title: playing ? t('playerPause') : t('playerPlay'), disabled: !active || busy,
                onClick: () => void control(playing ? 'pause' : 'resume'),
              }, h(PlayerIcon, { kind: playing ? 'pause' : 'play' })),
              h('button', {
                className: 'nsp-btn', type: 'button', title: t('playerNext'), disabled: !active || busy,
                onClick: () => void control('next'),
              }, h(PlayerIcon, { kind: 'next' })),
              h('button', {
                className: 'nsp-btn',
                type: 'button',
                title: liked ? t('playerUnlike') : t('playerLike'),
                'aria-pressed': liked,
                disabled: !active || busy || likedLoading,
                onClick: () => void control(liked ? 'unlike' : 'like'),
              }, h(PlayerIcon, { kind: liked ? 'heartFilled' : 'heart' })),
              h('button', {
                className: 'nsp-queue',
                type: 'button',
                title: queueOpen ? t('playerQueueHide') : t('playerQueueView'),
                'aria-expanded': queueOpen,
                onClick: () => {
                  setQueueOpen((value) => !value);
                },
              }, `${t('playerQueue')} ${queue?.total ?? (active ? player.queueLength : 0)}`),
            ),
            h('div', { className: 'nsp-vol' },
              h('span', { title: t('playerVolume') }, h(PlayerIcon, { kind: 'volume' })),
              h('input', {
                type: 'range', min: 0, max: 100, value: volume, disabled: !active,
                'aria-label': t('playerVolume'),
                onChange: (event) => {
                  const next = Number(event.target.value);
                  setVolume(next);
                  sendVolume(next);
                },
                onPointerUp: (event) => commitVolume(Number(event.currentTarget.value)),
                onKeyUp: (event) => {
                  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                    commitVolume(Number(event.currentTarget.value));
                  }
                },
              }),
              h('span', null, String(volume)),
            ),
            queueOpen ? h('div', { className: 'nsp-queuePanel' },
              queueLoading
                ? h('div', { className: 'nsp-hint' }, t('playerQueueLoading'))
                : queueError !== ''
                  ? h('div', { className: 'nsp-error' }, queueError)
                  : !queue || !Array.isArray(queue.items) || queue.items.length === 0
                    ? h('div', { className: 'nsp-hint' }, t('playerQueueEmpty'))
                    : queue.items.map((item) => h('div', {
                      key: `${item.index}-${item.label}`,
                      className: item.current ? 'nsp-queueRow is-current' : 'nsp-queueRow',
                    },
                      h('span', { className: 'nsp-queueIndex' }, String(item.index)),
                      h('span', { className: 'nsp-queueTitle', title: item.label }, item.label),
                    )),
            ) : null,
            error ? h('div', { className: 'nsp-error' }, error) : null,
          )
          : null;

        return h('div', { className: 'nsp-root', ref: rootRef },
          h('style', null, CSS),
          h('button', {
            ref: triggerRef,
            className: open ? 'nsp-trigger is-open' : 'nsp-trigger',
            type: 'button',
            title,
            'aria-label': t('nav'),
            'aria-expanded': open,
            onClick: toggle,
          },
            h('svg', { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': true, focusable: false },
              h('path', {
                d: 'M6 12.5a2 2 0 11-2-2c.4 0 .7.1 1 .2V3.5l8-1.6v9.1a2 2 0 11-2-2c.4 0 .7.1 1 .2V4.2L6 5.6z',
                fill: 'currentColor',
              }),
            ),
            playing ? h('span', { className: 'nsp-dot' }) : null,
          ),
          popover,
        );
      };
    }

    function makeSettingsPage(t) {
      return function SettingsPage() {
        const [draft, setDraft] = useState(null);
        const [meta, setMeta] = useState(null);
        const [busy, setBusy] = useState(false);
        const [checking, setChecking] = useState(false);
        const [notice, setNotice] = useState(null);
        const [loadError, setLoadError] = useState('');
        const [official, setOfficial] = useState(null);
        const [loginOutput, setLoginOutput] = useState('');
        const [loggingIn, setLoggingIn] = useState(false);

        const readOfficialStatus = useCallback(async () => {
          try {
            const response = await fetch(`${API}/official/status`, { headers: { accept: 'application/json' } });
            const data = await response.json().catch(() => null);
            if (!response.ok || !data?.ok) {
              throw new Error(data?.error?.message || `HTTP ${response.status}`);
            }
            setOfficial(asRecord(data.official));
            return asRecord(data.official);
          } catch (error) {
            setOfficial({ available: false, message: error instanceof Error ? error.message : String(error) });
            return null;
          }
        }, []);

        const load = useCallback(async () => {
          setLoadError('');
          try {
            const response = await fetch(`${API}/config`, { headers: { accept: 'application/json' } });
            const data = await response.json().catch(() => null);
            if (!response.ok || !data) {
              throw new Error(data?.error?.message || `HTTP ${response.status}`);
            }
            setDraft(draftFromConfig(data.config));
            setMeta({
              configPath: typeof data.configPath === 'string' ? data.configPath : '',
            });
            void readOfficialStatus();
          } catch (error) {
            setLoadError(error instanceof Error ? error.message : String(error));
          }
        }, [readOfficialStatus]);

        useEffect(() => {
          void load();
        }, [load]);

        const update = (key) => (event) => {
          const value = event.target.value;
          setDraft((previous) => (previous === null ? previous : { ...previous, [key]: value }));
          setNotice(null);
        };

        const updateOfficial = (key) => (event) => {
          const value = event.target.value;
          setDraft((previous) => (previous === null
            ? previous
            : { ...previous, official: { ...previous.official, [key]: value } }));
          setNotice(null);
        };

        const updateAutoplay = (key) => (event) => {
          const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
          setDraft((previous) => (previous === null
            ? previous
            : { ...previous, autoplay: { ...previous.autoplay, [key]: value } }));
          setNotice(null);
        };

        const payload = () => ({
          searchLimit: Number(draft?.searchLimit ?? 10),
          official: {
            appId: draft?.official.appId ?? '',
            privateKey: draft?.official.privateKey ?? '',
            player: draft?.official.player ?? 'mpv',
          },
          autoplay: {
            enabled: draft?.autoplay.enabled === true,
            onStartup: draft?.autoplay.onStartup !== false,
            pollMinutes: Number(draft?.autoplay.pollMinutes ?? 5),
            startupMood: draft?.autoplay.startupMood ?? 'calm',
            followConversation: draft?.autoplay.followConversation !== false,
          },
        });

        const save = async () => {
          if (!draft || busy) return;
          setBusy(true);
          setNotice(null);
          try {
            const response = await fetch(`${API}/config`, {
              method: 'PUT',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(payload()),
            });
            const data = await response.json().catch(() => null);
            if (!response.ok || !data?.ok) {
              throw new Error(data?.error?.message || `HTTP ${response.status}`);
            }
            setDraft(draftFromConfig(data.config));
            const failures = Array.isArray(data.official?.failures) ? data.official.failures : [];
            if (failures.length > 0) {
              setNotice({
                kind: 'warn',
                text: `${t('applyFailed')}：${failures.map((failure) => `${failure.key}: ${failure.message}`).join('；')}`,
              });
            } else if (data.official && Array.isArray(data.official.applied) && data.official.applied.length > 0) {
              setNotice({ kind: 'ok', text: `${t('saved')} ${t('applied')}（${data.official.applied.join(', ')}）` });
            } else {
              setNotice({ kind: 'ok', text: t('saved') });
            }
            void readOfficialStatus();
          } catch (error) {
            setNotice({
              kind: 'err',
              text: `${t('saveFailed')}：${error instanceof Error ? error.message : String(error)}`,
            });
          } finally {
            setBusy(false);
          }
        };

        const check = async () => {
          if (!draft || checking) return;
          setChecking(true);
          setNotice(null);
          try {
            const status = await readOfficialStatus();
            if (status === null) throw new Error(t('statusFailed'));
            const parts = [status.loggedIn ? t('loggedIn') : t('notLoggedIn')];
            if (status.version) parts.unshift(`ncm-cli ${status.version}`);
            parts.push(status.mpvAvailable ? t('mpvOk') : t('mpvMissing'));
            const ready = status.available && status.loggedIn && status.mpvAvailable;
            setNotice({
              kind: ready ? 'ok' : 'warn',
              text: `${ready ? t('statusOk') : t('statusWarn')} · ${parts.join(' · ')}`,
            });
          } catch (error) {
            setNotice({
              kind: 'err',
              text: `${t('statusFailed')}：${error instanceof Error ? error.message : String(error)}`,
            });
          } finally {
            setChecking(false);
          }
        };

        const startLogin = async () => {
          if (loggingIn) return;
          setLoggingIn(true);
          setNotice(null);
          setLoginOutput('');
          try {
            const response = await fetch(`${API}/official/login`, { method: 'POST' });
            const data = await response.json().catch(() => null);
            if (!response.ok || !data?.ok) {
              throw new Error(data?.error?.message || `HTTP ${response.status}`);
            }
            const login = asRecord(data.login);
            setLoginOutput(String(login.output ?? ''));
            setNotice({ kind: login.ok ? 'ok' : 'warn', text: login.ok ? t('startLogin') : t('loginHint') });
            void readOfficialStatus();
          } catch (error) {
            setNotice({
              kind: 'err',
              text: `${t('loginHint')}${error instanceof Error ? error.message : String(error)}`,
            });
          } finally {
            setLoggingIn(false);
          }
        };

        const discard = () => {
          if (busy || checking) return;
          setNotice(null);
          setLoginOutput('');
          void load();
        };

        if (loadError !== '') {
          return h('div', { className: 'nr-page' },
            h('h2', { className: 'nr-title' }, t('title')),
            h('div', { className: 'nr-notice nr-noticeErr' }, `${t('loadFailed')}：${loadError}`),
            h('div', { className: 'nr-actions' },
              h('button', { className: 'nr-btn', type: 'button', onClick: () => void load() }, t('discard')),
            ),
          );
        }

        if (draft === null) {
          return h('div', { className: 'nr-page' },
            h('h2', { className: 'nr-title' }, t('title')),
            h('p', { className: 'nr-hint' }, t('loading')),
          );
        }

        const field = (label, control, hint) => h('div', { className: 'nr-field' },
          h('label', { className: 'nr-label' }, label),
          control,
          hint ? h('p', { className: 'nr-hint' }, hint) : null,
        );

        const statusItems = [];
        if (official) {
          statusItems.push(h('span', { className: 'nr-statusItem', key: 'cli' },
            official.available ? 'ncm-cli ' : t('cliMissing'),
            h('b', null, official.version || (official.available ? t('unknown') : '')),
          ));
          if (official.cliAppId) {
            statusItems.push(h('span', { className: 'nr-statusItem', key: 'app' },
              'App ID ', h('b', null, official.cliAppId),
            ));
          } else {
            statusItems.push(h('span', { className: 'nr-statusItem nr-warn', key: 'app' }, t('appIdMissing')));
          }
          statusItems.push(h('span', {
            className: official.loggedIn ? 'nr-statusItem nr-okText' : 'nr-statusItem nr-warn',
            key: 'login',
          }, official.loggedIn ? t('loggedIn') : t('notLoggedIn')));
          statusItems.push(h('span', {
            className: official.mpvAvailable ? 'nr-statusItem nr-okText' : 'nr-statusItem nr-warn',
            key: 'mpv',
            title: official.mpvPath || '',
          }, official.mpvAvailable ? t('mpvOk') : t('mpvMissing')));
        }

        return h('div', { className: 'nr-page' },
          h('style', null, CSS),
          h('h2', { className: 'nr-title' }, t('title')),
          h('p', { className: 'nr-subtitle' }, t('subtitle')),
          notice ? h('div', {
            className: notice.kind === 'ok'
              ? 'nr-notice nr-noticeOk'
              : notice.kind === 'warn'
                ? 'nr-notice nr-noticeWarn'
                : 'nr-notice nr-noticeErr',
            role: 'status',
          }, notice.text) : null,

          h('section', { className: 'nr-card' },
            h('h3', { className: 'nr-cardTitle' }, t('officialTitle')),
            h('p', { className: 'nr-hint' }, t('officialIntro')),
            official ? h('div', { className: 'nr-status' }, statusItems) : null,
            official && official.message
              ? h('p', { className: 'nr-hint nr-warn' }, String(official.message))
              : null,
            field(
              t('appId'),
              h('input', {
                className: 'nr-input',
                type: 'text',
                value: draft.official.appId,
                placeholder: 'App ID',
                spellCheck: false,
                onChange: updateOfficial('appId'),
              }),
              t('appIdHint'),
            ),
            field(
              t('privateKey'),
              h('input', {
                className: 'nr-input',
                type: 'password',
                value: draft.official.privateKey,
                placeholder: draft.official.privateKeySet ? t('privateKeySaved') : 'Private Key',
                spellCheck: false,
                autoComplete: 'off',
                onChange: updateOfficial('privateKey'),
              }),
              t('privateKeyHint'),
            ),
            h('div', { className: 'nr-grid' },
              field(
                t('player'),
                h('select', {
                  className: 'nr-select',
                  value: draft.official.player,
                  onChange: updateOfficial('player'),
                },
                  h('option', { value: 'mpv' }, t('playerMpv')),
                  h('option', { value: 'orpheus' }, t('playerOrpheus')),
                ),
                t('playerHint'),
              ),
            ),
            h('div', { className: 'nr-actions' },
              h('button', {
                className: 'nr-btn',
                type: 'button',
                disabled: loggingIn || checking,
                onClick: () => void startLogin(),
              }, loggingIn ? t('starting') : t('startLogin')),
              h('span', { className: 'nr-hint' }, t('loginHint')),
              h('code', { className: 'nr-code' }, t('loginCommand')),
            ),
            loginOutput !== ''
              ? h('div', { className: 'nr-field' },
                h('span', { className: 'nr-label' }, t('loginOutput')),
                h('pre', { className: 'nr-pre' }, loginOutput),
              )
              : null,
            h('p', { className: 'nr-hint' }, t('noCli')),
            h('p', { className: 'nr-hint' }, t('noMpv')),
          ),

          h('section', { className: 'nr-card' },
            h('h3', { className: 'nr-cardTitle' }, t('autoplayTitle')),
            h('label', { className: 'nr-check' },
              h('input', {
                type: 'checkbox',
                checked: draft.autoplay.enabled,
                onChange: updateAutoplay('enabled'),
              }),
              h('span', null, t('autoplayEnable')),
            ),
            h('p', { className: 'nr-hint' }, t('autoplayEnableHint')),
            draft.autoplay.enabled ? h('div', { className: 'nr-field' },
              h('div', { className: 'nr-grid' },
                field(
                  t('autoplayPoll'),
                  h('input', {
                    className: 'nr-input',
                    type: 'number',
                    min: 1,
                    max: 60,
                    value: draft.autoplay.pollMinutes,
                    onChange: updateAutoplay('pollMinutes'),
                  }),
                ),
                field(
                  t('autoplayMood'),
                  h('select', {
                    className: 'nr-select',
                    value: draft.autoplay.startupMood,
                    onChange: updateAutoplay('startupMood'),
                  }, MOOD_OPTIONS.map(([value, key]) => h('option', { key: value, value }, t(key)))),
                ),
              ),
              h('label', { className: 'nr-check' },
                h('input', {
                  type: 'checkbox',
                  checked: draft.autoplay.onStartup,
                  onChange: updateAutoplay('onStartup'),
                }),
                h('span', null, t('autoplayStartup')),
              ),
              h('label', { className: 'nr-check' },
                h('input', {
                  type: 'checkbox',
                  checked: draft.autoplay.followConversation,
                  onChange: updateAutoplay('followConversation'),
                }),
                h('span', null, t('autoplayFollow')),
              ),
            ) : null,
          ),

          h('div', { className: 'nr-actions' },
            h('button', {
              className: 'nr-btn nr-primary',
              type: 'button',
              disabled: busy || checking,
              onClick: () => void save(),
            }, busy ? t('saving') : t('save')),
            h('button', {
              className: 'nr-btn',
              type: 'button',
              disabled: busy || checking,
              onClick: () => void check(),
            }, checking ? t('checking') : t('checkStatus')),
            h('button', {
              className: 'nr-btn',
              type: 'button',
              disabled: busy || checking,
              onClick: discard,
            }, t('discard')),
          ),
          meta?.configPath ? h('p', { className: 'nr-path' }, `${t('configPath')}：${meta.configPath}`) : null,

          h('section', { className: 'nr-card' },
            h('h3', { className: 'nr-cardTitle' }, t('usage')),
            h('p', { className: 'nr-hint' }, t('usageIntro')),
            h('p', { className: 'nr-example' }, t('usageExample')),
            h('p', { className: 'nr-hint' }, t('usageSearch')),
            h('p', { className: 'nr-hint' }, t('usageRequest')),
            h('p', { className: 'nr-hint' }, t('usageTip')),
          ),
        );
      };
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'netease-request: dictionaries');
        const t = ctx.locale.bind(NS);
        const SettingsPage = makeSettingsPage(t);
        ctx.slots.inject('settings.section', function* () {
          yield ctx.slots.register(
            {
              name: 'settings.section',
              id: 'netease-request',
              order: 35,
              label: () => t('nav'),
            },
            SettingsPage,
          );
        });

        const SidebarPlayer = makeSidebarPlayer(t);
        ctx.slots.inject('sidebar.footer.action', function* () {
          yield ctx.slots.register(
            {
              name: 'sidebar.footer.action',
              id: 'netease-request-player',
              order: 0,
              label: () => t('nav'),
            },
            SidebarPlayer,
          );
        });
      },
    };
  },
});
