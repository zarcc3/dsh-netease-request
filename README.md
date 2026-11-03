# 网易云点歌（DSH 插件）

在 DeepSeek Harness Web UI 里通过**网易云音乐开放平台**搜索、点歌并在本机播放的个人插件。

插件使用官方 `@music163/ncm-cli`，不依赖第三方网易云 API 服务。

## 功能

- **Agent 工具**
  - `netease_search_songs`：搜索歌曲，返回歌名、歌手、专辑、时长、是否可播、网易云页面链接
  - `netease_request_song`：点歌并在本机播放（mpv）
  - `netease_queue_liked`：从「喜欢的音乐」随机加 N 首到队列；没有播放时会先开始播放第一首
  - `netease_play_playlist`：按歌单名播放创建或收藏的歌单
- **侧边栏播放器**
  - 常驻音符按钮，点击展开播放面板
  - 当前歌曲、进度、播放/暂停、下一首
  - 队列数量可点击展开队列列表，当前歌曲高亮
  - 音量实时调节（拖动即生效）
- **设置页（设置 → 网易云点歌）**
  - App ID / Private Key / 播放器
  - ncm-cli、登录状态、mpv 检测
  - 启动扫码登录

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
- ncm-cli 凭证与缓存：`%USERPROFILE%\.config\ncm-cli\`
- Private Key 只保存在本机设置文件和 ncm-cli 凭证中，不会写入仓库。

## 结构

```text
index.js           Host 半侧：设置接口、ncm-cli 调用、Agent 工具
client.js          Client 半侧：设置页、侧边栏播放器
cordis.patch.yml   Bundle patch
locale/            插件管理器中显示的标题与描述
icon.svg           插件图标
```

## 说明

- 官方 CLI 的 `prev` 目前只会重播当前歌曲，因此播放器未提供「上一首」。
- 单曲队列在 `ncm-cli queue` 中返回加密 ID，插件会用当前播放标题替换。
- 队列单曲删除不受官方 CLI 支持（仅 add / clear）。

## License

MIT
