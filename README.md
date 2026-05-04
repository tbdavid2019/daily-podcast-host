# daily-podcast-host

`daily-podcast-host` 是 `../daily-podcast` 的 Linux 自架版遷移目標。它的目標是把原本依賴 Cloudflare Workers、KV、R2、Workflow、OpenNext 的每日播客流程，改造成可在一般 Linux 主機上用 Docker Compose 運行的版本。

它的核心方向是：

- 把 Cloudflare runtime 依賴拆掉
- 改成標準 Node.js + Next.js + BullMQ + Postgres + Redis + MinIO
- 保留既有的播客對外行為
  - 日期導向的文章頁
  - RSS feed
  - MP3 enclosure
  - byte-range 音訊播放

## TL;DR

- 如果你要的是「可自架的每日科技播客骨架」，這個 repo 已經具備基礎設施與設定層。
- 如果你要的是「已經完整跑通的 production 播客生成系統」，目前還差最後一段真實來源抓取、LLM 生成、TTS 生成的完整移植與端到端驗證。

## 功能概覽

- Linux 自架部署，不依賴 Cloudflare Workers
- Next.js standalone web runtime
- BullMQ queue-based worker orchestration
- Postgres durable storage
- Redis transient workflow state / lock / dedupe
- MinIO / S3-compatible audio storage
- RSS 與音訊 route 骨架
- variant/date-based worker commands
- replay / duplicate-run protection 骨架

目前這個 repo 已經具備：

- monorepo/workspace 結構
- `web` / `worker` / `redis` / `postgres` / `minio` / `proxy` 的 Compose 骨架
- Node-safe 的 shared core package
- Postgres / Redis / MinIO 的 storage abstraction
- Next.js standalone web runtime 骨架
- BullMQ worker orchestration 骨架

目前這個 repo **尚未完成真正的端到端內容生成驗證**。不過目前狀態已經不是只有骨架：

- 來源抓取邏輯已接入 `apps/worker`
- LLM 文稿生成流程已接入 `apps/worker`
- TTS 與音訊合併/上傳流程已接入 `apps/worker`

現在主要缺的是：

- 在真實 Docker/憑證環境完成整套跑通
- 驗證產出的 episode、RSS、音訊播放、重試與 replay 行為

## 架構總覽

```text
                        +----------------------+
                        |      Reverse Proxy   |
                        |        (Caddy)       |
                        +----------+-----------+
                                   |
                                   v
                        +----------------------+
                        |       apps/web       |
                        |  Next.js standalone  |
                        +----------+-----------+
                                   |
                    +--------------+--------------+
                    |                             |
                    v                             v
          +-------------------+         +-------------------+
          |     Postgres      |         |   MinIO / S3      |
          | episode metadata  |         | final audio files |
          | workflow history  |         | temp audio parts  |
          +-------------------+         +-------------------+

                                   ^
                                   |
                        +----------+-----------+
                        |     apps/worker      |
                        |  BullMQ orchestration|
                        +----------+-----------+
                                   |
                                   v
                        +----------------------+
                        |        Redis         |
                        | queue / dedupe / lock|
                        +----------------------+
```

## 處理流程

預期完整流程如下：

1. scheduler 或人工指令觸發 `run-daily`
2. worker 將 `generate-script` 工作送進 BullMQ
3. worker 抓取來源內容，整理 story list
4. worker 呼叫 LLM 生成摘要、逐字稿、部落格內容、簡介
5. worker 將 script / episode metadata 寫入 Postgres
6. worker 觸發 `generate-audio`
7. worker 呼叫 TTS，合併音檔後寫入 MinIO
8. web 從 Postgres 讀資料、從 MinIO 提供音訊與 range playback
9. RSS 僅在音檔存在時輸出 enclosure

目前 `worker` 已經具備來源抓取、LLM 生成、TTS 生成與物件儲存上傳的實作；目前主要未完成的是實機驗證與 production hardening。

## 專案結構

- `apps/web`
  Linux/Node 版網站入口，負責首頁、文章頁、RSS 與音訊路由。
- `apps/worker`
  Linux/Node 版背景工作程序，負責排程、佇列、重播、腳本與音訊任務協調。
- `packages/core`
  從原始專案抽出的 Node-safe 共用邏輯，例如 prompts、story selection、article mapping、audio chunking。
- `packages/storage`
  Postgres / Redis / MinIO 的抽象介面與 adapter。
- `infra/compose`
  Compose 與反向代理相關設定。
- `docs`
  環境契約、Cloudflare 依賴盤點、切換與回滾說明。

## 目前狀態

### 已完成

- workspace 結構建立
- `packages/core` 共用邏輯抽取
- `packages/storage` 抽象介面與 adapter
- `apps/web` 基本 Node runtime 與 route 骨架
- `apps/worker` BullMQ orchestration 與 CLI command 骨架
- Dockerfiles
- `docker-compose.yml`
- workspace `pnpm typecheck`

### 尚未完成

- 真實 Docker/Compose 環境端到端產出驗證
- 真實 MP3 與播放客戶端實測
- replay / retry / duplicate protection 的實機驗證
- production hardening 與異常情境驗證

## 系統需求

建議至少準備以下環境：

- Linux 主機或可執行 Docker 的開發環境
- Node.js 20+
- `pnpm` 10+
- Docker 與 Docker Compose
- 可用的 LLM API
- 可用的 TTS 後端

## 安裝方式

### 1. 安裝依賴

```bash
pnpm install
```

### 2. 建立環境變數

複製範例設定：

```bash
cp .env.example .env
```

接著依照你的環境修改 `.env`。

### 3. 先做靜態檢查

```bash
pnpm typecheck
```

### 4. 啟動 Compose 骨架

```bash
docker compose up -d --build
```

如果你只是先驗證設定檔是否合理，也可以先跑：

```bash
docker compose config
```

### 5. 啟動本地 worker 命令

目前 `worker` 支援的命令骨架如下：

```bash
node apps/worker/dist/index.js worker
node apps/worker/dist/index.js run-daily 2026-05-04 hacker-news
node apps/worker/dist/index.js generate-script 2026-05-04 hacker-news
node apps/worker/dist/index.js generate-audio 2026-05-04 hacker-news
node apps/worker/dist/index.js replay 2026-05-04 hacker-news
```

如果要先編譯 worker：

```bash
pnpm --filter @daily-podcast-host/worker build
```

## 快速開始

如果你想先把整個 repo 跑起來並驗證「結構」沒有問題，可以照這個順序：

```bash
pnpm install
cp .env.example .env
pnpm typecheck
docker compose up -d --build
```

如果你想手動觸發某一天的流程骨架：

```bash
pnpm --filter @daily-podcast-host/worker build
node apps/worker/dist/index.js run-daily 2026-05-04 hacker-news
```

如果你想只跑 web 型別檢查：

```bash
pnpm --filter @daily-podcast-host/web typecheck
```

如果你想只跑 worker 型別檢查：

```bash
pnpm --filter @daily-podcast-host/worker typecheck
```

## 環境變數總覽

完整說明可見 [docs/environment-contract.md](/Users/david/Documents/git/tbdavid2019/daily-podcast-host/docs/environment-contract.md:1)。下面是最常用的分組說明。

### Web 設定

- `NODE_ENV`
  Next.js 執行模式，正式環境通常為 `production`。
- `PORT`
  Web 服務監聽埠。
- `NEXT_PUBLIC_BASE_URL`
  網站對外公開網址，例如 `https://podcast.example.com`。
- `NEXT_STATIC_HOST`
  音訊與靜態內容的公開前綴，通常可設成 `https://podcast.example.com/static`。
- `NEXT_REVALIDATE_SECONDS`
  首頁與 RSS 的重建快取秒數。

### Worker 設定

- `WORKER_ENV`
  邏輯環境名稱，例如 `production`、`staging`。
- `DEFAULT_PODCAST_VARIANT`
  預設頻道，目前預設是 `hacker-news`。
- `TIMEZONE_OFFSET`
  日期計算用時區偏移，台北通常設 `8`。
- `TIMEZONE_NAME`
  時區名稱，例如 `Asia/Taipei`。
- `RUN_DAILY_CRON`
  每日排程字串。
- `QUEUE_PREFIX`
  BullMQ 的 prefix。
- `QUEUE_CONCURRENCY`
  worker 併發數。
- `QUEUE_JOB_ATTEMPTS`
  任務失敗後的最大重試次數。
- `QUEUE_JOB_BACKOFF_MS`
  重試 backoff 基準毫秒數。

## 來源設定

這個專案的內容來源設計延續自 `../daily-podcast`，核心是多來源的技術新聞與社群內容彙整。根據目前從原始專案抽出的邏輯，預期支援的來源包含：

- `hacker-news`
- `reddit`
- `github-trending`
- `product-hunt`
- `dev-to`

### 預設主來源

目前預設 `variant` 是：

```env
DEFAULT_PODCAST_VARIANT=hacker-news
```

也就是說，若沒有特別指定，worker 會以 `hacker-news` 作為主要流程入口。

### 內容抓取相關設定

- `JINA_KEY`
  若你使用 Jina 作為文章內容抽取後端，可在這裡提供金鑰。
- `FIRECRAWL_KEY`
  若你使用 Firecrawl 作為備援抓取服務，可在這裡提供金鑰。

### 來源層的現況

README 需要明講這件事：

- 來源種類與 story selection 規則已經被抽到 `packages/core`
- `apps/worker` 已經有實際抓取、整合、快取與文稿生成流程
- 但這一套仍需要在真實 provider 與 Docker 環境完成驗證

也就是說，設定欄位與流程骨架已經準備好了，但你不能把它當成已完成的 production ingestion pipeline。

## Worker 指令

目前 `apps/worker` 提供的命令入口：

- `worker`
  啟動 BullMQ worker 進程。
- `run-daily <date> <variant>`
  建立某一天某個 variant 的每日執行任務。
- `generate-script <date> <variant>`
  直接執行腳本生成命令骨架。
- `generate-audio <date> <variant>`
  直接執行音訊生成命令骨架。
- `replay <date> <variant>`
  以人工重播模式重新排入任務。

範例：

```bash
node apps/worker/dist/index.js worker
node apps/worker/dist/index.js run-daily 2026-05-04 hacker-news
node apps/worker/dist/index.js replay 2026-05-04 hacker-news
```

## LLM 設定

目前 repo 內保留了與原始專案相容的 LLM 環境變數設計。

### 必填欄位

- `OPENAI_BASE_URL`
  OpenAI 相容 API 的 base URL。
- `OPENAI_API_KEY`
  LLM 金鑰。
- `OPENAI_MODEL`
  主要生成模型，用於腳本生成與摘要。

### 選填欄位

- `OPENAI_THINKING_MODEL`
  若你想把高推理成本的工作拆給另一個模型，可在這裡設定。
- `OPENAI_MAX_TOKENS`
  prompt token 預算。
- `OPENAI_MAX_COMPLETION_TOKENS`
  completion token 上限。

### 範例

```env
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5-mini
OPENAI_THINKING_MODEL=
OPENAI_MAX_TOKENS=8192
OPENAI_MAX_COMPLETION_TOKENS=32768
```

### 現況說明

目前 `packages/core` 已經有：

- podcast script prompt
- story summarize prompt
- blog summarize prompt
- intro prompt

目前 `apps/worker` 已經把 `generateText` / `generateObject` 路徑重新接回來了。所以：

- 設定結構已就位
- 參數命名已對齊
- 真正的 LLM 生產流程已接入，但尚未在外部環境完成整體驗證

## TTS 設定

TTS 欄位也保留了與來源專案相容的設計。

### 基本欄位

- `TTS_PROVIDER`
  使用哪一個 TTS 後端，例如 `edge-tts` 或自訂 provider。
- `TTS_API_URL`
  自訂 TTS 後端網址。
- `TTS_API_ID`
  某些後端需要的 deployment/account id。
- `TTS_API_KEY`
  TTS API 金鑰。
- `TTS_MODEL`
  語音模型名稱。
- `MAN_VOICE_ID`
  男聲 speaker id。
- `WOMAN_VOICE_ID`
  女聲 speaker id。
- `AUDIO_SPEED`
  語速倍率。

### Gemini TTS 相關欄位

- `GEMINI_TTS_API_KEY`
- `GEMINI_TTS_MODEL`

### 範例

```env
TTS_PROVIDER=edge-tts
TTS_API_URL=
TTS_API_ID=
TTS_API_KEY=
TTS_MODEL=
MAN_VOICE_ID=
WOMAN_VOICE_ID=
AUDIO_SPEED=1.0
GEMINI_TTS_API_KEY=
GEMINI_TTS_MODEL=
```

### 現況說明

目前 `packages/core` 已經抽出了：

- dialogue chunking
- audio buffer combine
- WAV/PCM 包裝邏輯

目前 TTS 供應商串接與最終音訊合併/上傳流程已接入 `apps/worker`，但仍需要在真實 API 與真實音檔環境完成驗證。

## 儲存層設定

### Postgres

用來存放 durable episode metadata 與 workflow run history。

```env
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=daily_podcast
POSTGRES_USER=daily_podcast
POSTGRES_PASSWORD=change-me
DATABASE_URL=postgresql://daily_podcast:change-me@postgres:5432/daily_podcast
```

初始化 SQL 在：

- [packages/storage/sql/init.sql](/Users/david/Documents/git/tbdavid2019/daily-podcast-host/packages/storage/sql/init.sql:1)

### Redis

用來處理：

- queue backend
- dedupe
- run lock
- transient workflow state

```env
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_URL=redis://redis:6379
```

### MinIO / S3

用來儲存最終音訊檔與暫存批次音訊。

```env
S3_ENDPOINT=http://minio:9000
S3_REGION=us-east-1
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=podcast-audio
S3_FORCE_PATH_STYLE=true
MINIO_CONSOLE_PORT=9001
```

### 音檔路徑慣例

沿用來源系統的輸出慣例：

- 最終音檔：`YYYY/MM/DD/{env}/{variant}-{date}.mp3`
- 暫存批次：`YYYY/MM/DD/{env}/temp/{variant}-batch-{batchIndex}-{timestamp}.mp3`

## 反向代理設定

### 基本欄位

```env
PROXY_HTTP_PORT=80
PROXY_HTTPS_PORT=443
LETSENCRYPT_EMAIL=ops@example.com
```

目前 Caddy 設定在：

- [infra/compose/caddy/Caddyfile](/Users/david/Documents/git/tbdavid2019/daily-podcast-host/infra/compose/caddy/Caddyfile:1)

## 本機開發與驗證

### 已確認可通過

目前 repo 已完成並確認：

```bash
pnpm install
pnpm typecheck
```

### 尚未在此環境完成

以下項目仍需要在有 Docker 與完整 provider 憑證的主機上完成：

- `docker compose up -d --build`
- 真實 episode 生成
- 首頁/文章頁/RSS 實測
- byte-range 播放驗證

## 部署建議

### 單機部署

目前 repo 預設走單機 Compose 模式，最適合：

- VPS
- 小型雲端 VM
- 家用 Linux 主機

### 最低建議

實際需求取決於：

- 來源數量
- LLM model 大小
- TTS provider 音檔生成速度
- 保留多少歷史集數

保守建議：

- 2 vCPU
- 4 GB RAM
- 30 GB SSD

如果你要留更多音檔、跑更多來源或較重的 TTS，建議直接拉到：

- 4 vCPU
- 8 GB RAM
- 80 GB SSD

## FAQ

### 這個專案現在能直接拿來生產嗎？

還不建議直接當成已驗證完成的 production 系統。原因不是因為只剩骨架，而是因為仍缺真實外部環境下的端到端驗證。

### 這個專案和原本的 `../daily-podcast` 差在哪？

原始專案依賴 Cloudflare runtime。這個 repo 的目標是改成一般 Linux 主機可執行的版本，並把 runtime 依賴改成 Postgres / Redis / MinIO / BullMQ / Next.js standalone。

### 為什麼要拆成 `web` 跟 `worker`？

因為網站請求處理和背景生成任務的運作特性完全不同。分開之後：

- web 可專注在低延遲讀取
- worker 可專注在排程、重試、失敗記錄與 replay

### Postgres / Redis / MinIO 各自做什麼？

- Postgres：durable episode metadata、workflow history
- Redis：queue backend、lock、dedupe、transient state
- MinIO：最終音檔與暫存批次音訊

### RSS 什麼時候會出現 enclosure？

只有當對應音檔存在於 MinIO/S3 時，RSS 才應該輸出 enclosure。這個規則是為了保持和原系統一致，避免 podcast client 抓到不存在的音檔。

### 可以不用 MinIO 改用真正的 S3 嗎？

可以。只要 S3-compatible 設定正確，理論上可以替換成外部 S3 或其他相容物件儲存。

### 可以不用 Postgres 改用 SQLite 嗎？

設計文件裡有提過這個方向，但目前 repo 已經先以 Postgres 為主要 durable store。

## Troubleshooting

### `docker: command not found`

你的機器沒有安裝 Docker，或 PATH 裡沒有 `docker`。先安裝 Docker Desktop 或 Linux Docker Engine。

### `docker compose config` 失敗

先確認：

- Docker 已安裝
- `.env` 已建立
- `docker-compose.yml` 沒有被手動改壞

### `pnpm typecheck` 失敗

先執行：

```bash
pnpm install
```

如果是新加依賴或 lockfile 狀態不同，再跑：

```bash
pnpm install --no-frozen-lockfile
```

### `web` 啟動但沒有文章

這通常代表：

- Postgres 裡沒有 episode 資料
- worker 還沒成功寫入 durable records
- 完整生成流程尚未接回

### RSS 沒有 enclosure

通常代表：

- MinIO 裡沒有對應音檔
- 音檔 key 與 episode metadata 不一致
- range/audio route 還沒接到真實生成檔

### worker 有 queue 但沒有真正產出音檔

這不是異常，可能只是目前 repo 尚未把完整 TTS 實作接回來。請把它視為 migration-in-progress 的狀態，而不是 finished production bug。

## Roadmap

### Phase 1: Foundation

- [x] workspace 結構
- [x] storage abstractions
- [x] worker/web runtime skeleton
- [x] Docker/Compose skeleton

### Phase 2: Production Logic Migration

- [x] 完整移植來源抓取邏輯
- [x] 完整移植 LLM script generation
- [x] 完整移植 blog / intro generation
- [x] 完整移植 TTS 與 audio merging

### Phase 3: Validation

- [ ] 本機 Compose 端到端生成一集
- [ ] 驗證首頁、文章頁、RSS
- [ ] 驗證 byte-range playback
- [ ] 驗證 replay / retry / duplicate protection

### Phase 4: Cutover

- [ ] 壓力與穩定性檢查
- [ ] 正式域名切換
- [ ] 回滾方案演練

## 已知限制

這份 README 必須清楚說明目前狀態：

1. `web` 與 `worker` 已經有正式目錄、型別、設定與執行骨架。
2. storage abstraction 已建立。
3. Compose 與 Dockerfiles 已建立。
4. 真正的內容抓取、LLM 生成、TTS 生產流程，仍在遷移中。
5. 因此目前比較準確的定位是：
   一個已完成基礎架構與設定層的 self-hosted migration repo，而不是已 fully cutover 的 production 系統。

## 貢獻方向

如果你要繼續推這個 repo，最值得優先做的是：

1. 把 `../daily-podcast/workflow/index.ts` 的實際 LLM 流程拆進 `apps/worker`
2. 把 `../daily-podcast/workflow/audio.ts` 的實際 TTS / 音檔流程拆進 `apps/worker`
3. 把來源抓取與 story content cache 正式落到 Redis / Postgres 設計中
4. 在真實 Docker 環境完成 `8.1` 到 `8.3`

## 相關文件

- [docs/environment-contract.md](/Users/david/Documents/git/tbdavid2019/daily-podcast-host/docs/environment-contract.md:1)
- [docs/cloudflare-inventory.md](/Users/david/Documents/git/tbdavid2019/daily-podcast-host/docs/cloudflare-inventory.md:1)
- [docs/cutover-and-rollback.md](/Users/david/Documents/git/tbdavid2019/daily-podcast-host/docs/cutover-and-rollback.md:1)
- [openspec change tasks](/Users/david/Documents/git/tbdavid2019/daily-podcast-host/openspec/changes/migrate-daily-podcast-host-to-linux-without-cloudflare/tasks.md:1)
