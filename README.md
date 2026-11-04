# 网易云点歌（DSH 插件）

在 DeepSeek Harness Web UI 里通过**网易云音乐开放平台**搜索、点歌并在本机播放的个人插件。

插件使用官方 `@music163/ncm-cli`，不依赖第三方网易云 API 服务。

## 功能

- **Agent 工具**
  - `netease_search_songs`：搜索歌曲，返回歌名、歌手、专辑、时长、是否可播、网易云页面链接
  - `netease_request_song`：点歌并在本机播放（mpv）
  - `netease_queue_liked`：从「喜欢的音乐」随机加 N 首到队列；没有播放时会先开始播放第一首
  - `netease_queue_songs`：按一组「歌名 + 歌手」查询，匹配后批量加入队列；没有播放时自动开始，`replace=true` 可先清空当前队列
  - `netease_play_playlist`：按歌单名播放创建或收藏的歌单
  - `netease_radar_playlists`：私人雷达歌单，可按序号直接播放
  - `netease_heartbeat`：心动模式歌曲推荐（基于喜欢的歌单），可列出或直接播放
  - `netease_daily_recommend`：每日推荐歌曲，可列出或直接播放
  - `netease_like_current`：把当前播放/暂停的歌曲加入「喜欢的音乐」；已喜欢会直接返回
  - `netease_play_mood`：记录对话氛围；仅在当前没有播放时挑一首适合的歌，不会打断播放/暂停中的音乐
- **侧边栏播放器**
  - 常驻音符按钮，点击展开播放面板
  - 当前歌曲、进度、播放/暂停、下一首
  - 红心按钮：把当前歌曲加入「喜欢的音乐」
  - 队列数量可点击展开队列列表，当前歌曲高亮
  - 音量实时调节（拖动即生效）
- **自动播放**
  - DSH 启动时播放一首舒缓音乐
  - 每 5 分钟低频检查一次，仅在 stopped 状态添加一首
  - 播放或暂停时完全不修改播放器和队列
  - 20 种氛围：舒缓、专注、暧昧、威严、战斗、悬疑、惊悚、史诗等，覆盖小说/剧情场景
- **情绪选歌缓存**
  - 每种情绪在内存中缓存候选歌曲，首次搜索 50 首
  - 有缓存时直接筛选，不重复搜索
  - 缓存全部去重后，改为搜索该情绪的歌单并缓存曲目
  - 仅内存保存，DSH 重启后清零
- **播放去重**
  - 最近 100 首 FIFO 集合，超出后淘汰最旧记录
  - 只有自动播放选歌会跳过已播放歌曲；推荐工具不过滤
  - 主动点歌、主动加队列不查重，但播放/入队成功后会写回集合
  - 播放歌单（含私人雷达）时记录歌单内全部可播放歌曲
  - 去重键优先级：加密 ID → 32 位 hex 歌单曲目 ID → 原始 ID → 歌名|歌手
  - 持久化到 `netease-request/history.json`，启动读取、退出写入
- **设置页（设置 → 网易云点歌）**
  - App ID / Private Key / 播放器
  - ncm-cli、登录状态、mpv 检测
  - 启动扫码登录
  - 自动播放开关、轮询间隔、启动风格、对话跟随

## 依赖

- DeepSeek Harness Desktop（Web profile）
- Node.js >= 18
- 官方 CLI：`npm install -g @music163/ncm-cli`
- 本机播放器：[mpv](https://mpv.io/installation/)（Windows 推荐 `winget install --id shinchiro.mpv --exact`）

## 安装

1. 安装依赖：

   ```bash
   npm install -g @music163/ncm-cli
   ```

2. 将本目录作为 bundle 安装到 DSH profile（通过插件管理器或 Cordis patch）。
3. 在 设置 → 网易云点歌 填写开放平台 App ID / Private Key，选择 mpv 并保存。
4. 登录：

   ```bash
   ncm-cli login --background
   ```

5. 在对话中说「点歌 <歌名> <歌手>」。

## 配置与数据

- 插件设置：`%USERPROFILE%\.dsh\netease-request\config.json`
- 去重历史：`%USERPROFILE%\.dsh\netease-request\history.json`
- ncm-cli 凭证与缓存：`%USERPROFILE%\.config\ncm-cli\`
- Private Key 只保存在本机设置文件和 ncm-cli 凭证中，不会写入仓库。

## 结构

```text
index.js           Host 半侧：设置接口、ncm-cli 调用、Agent 工具、自动播放
mood.js            情绪选歌模块（可独立修改关键词与选歌策略）
client.js          Client 半侧：设置页、侧边栏播放器
cordis.patch.yml   Bundle patch
locale/            插件管理器中显示的标题与描述
icon.svg           插件图标
```

## 说明

- 官方 CLI 的 `prev` 目前只会重播当前歌曲，因此播放器未提供「上一首」。
- 单曲队列在 `ncm-cli queue` 中返回加密 ID，插件会用当前播放标题替换。
- 队列单曲删除不受官方 CLI 支持（仅 add / clear）。
- `ncm-cli state` 会把暂停报告成 `stopped`，插件额外记录暂停标记，避免自动播放恢复暂停中的音乐。
- 插件卸载或 DSH 进程退出时会同步执行 `ncm-cli stop`，停止播放并让 mpv 退出。

## License

MIT
