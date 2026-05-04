# Validation Checklist

這份清單用來在有 Docker、真實 LLM/TTS 憑證、可連外網路的機器上，驗證 OpenSpec 的 `8.1` 到 `8.3`。

## 0. 前置條件

- 已安裝 Docker 與 Docker Compose
- 已建立 `.env`
- `.env` 內已填好：
  - `OPENAI_*`
  - `TTS_*`
  - `S3_*`
  - `DATABASE_URL`
  - `REDIS_URL`
- 可連到外部來源：
  - Hacker News
  - Reddit
  - GitHub
  - Product Hunt
  - Dev.to
- 機器可呼叫 LLM 與 TTS API

## 1. 安裝與靜態檢查

```bash
pnpm install
pnpm typecheck
pnpm --filter @daily-podcast-host/worker build
```

預期結果：

- `pnpm typecheck` 成功
- `apps/worker/dist/index.js` 產出成功

## 2. 啟動 Compose

```bash
docker compose up -d --build
docker compose ps
```

預期結果：

- `web`
- `worker`
- `scheduler`
- `redis`
- `postgres`
- `minio`
- `proxy`

都應該進入可運作狀態。

## 3. 初始化檢查

檢查服務狀態：

```bash
docker compose logs web --tail=100
docker compose logs worker --tail=100
docker compose logs postgres --tail=100
docker compose logs minio --tail=100
docker compose logs redis --tail=100
```

預期結果：

- 沒有明顯 crash loop
- Postgres 已建立 `episodes` 與 `workflow_runs`
- worker 沒有環境變數缺失錯誤

## 4. 手動觸發一集生成

挑一個日期，例如：

```bash
docker compose exec worker node apps/worker/dist/index.js run-daily 2026-05-04 hacker-news
```

或者直接拆開跑：

```bash
docker compose exec worker node apps/worker/dist/index.js generate-script 2026-05-04 hacker-news
docker compose exec worker node apps/worker/dist/index.js generate-audio 2026-05-04 hacker-news
```

預期結果：

- `workflow_runs` 有 `script` 與 `audio` 記錄
- `episodes` 表新增一筆資料
- MinIO bucket 內有對應音檔

## 5. 驗證資料庫

```bash
docker compose exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select env, variant, episode_date, title from episodes order by episode_date desc limit 5;"
docker compose exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select env, variant, episode_date, phase, status, attempts from workflow_runs order by updated_at desc limit 10;"
```

預期結果：

- `episodes` 有新資料
- `workflow_runs` 中 `script` / `audio` 最終為 `completed`

## 6. 驗證 MinIO 音檔

確認物件 key 符合慣例：

- `YYYY/MM/DD/{env}/{variant}-{date}.mp3`

如果你有 `mc` 可用：

```bash
mc ls local/${S3_BUCKET}/2026/05/04/${WORKER_ENV}/
```

預期結果：

- 看得到 `hacker-news-2026-05-04.mp3`

## 7. 驗證首頁與文章頁

打開：

- `/`
- `/post/2026-05-04`
- `/post/2026-05-04/hacker-news`

或用 curl：

```bash
curl -I http://localhost:3000/
curl -I http://localhost:3000/post/2026-05-04
curl -I http://localhost:3000/post/2026-05-04/hacker-news
```

預期結果：

- `200 OK`
- 首頁可看到文章
- 文章頁可看到標題、摘要、播放器

## 8. 驗證 RSS

```bash
curl http://localhost:3000/rss.xml
```

檢查：

- 有 `<item>`
- 有對應日期文章
- 若音檔存在，應有 `<enclosure>`

額外檢查：

- enclosure URL 指向 `/static/...`
- URL 路徑符合 `YYYY/MM/DD/{env}/{variant}-{date}.mp3`

## 9. 驗證音訊直連

```bash
curl -I "http://localhost:3000/static/2026/05/04/${WORKER_ENV}/hacker-news-2026-05-04.mp3"
```

預期結果：

- `200 OK`
- `Accept-Ranges: bytes`
- `Content-Type: audio/mpeg` 或對應音訊類型

## 10. 驗證 Range Playback

```bash
curl -I \
  -H "Range: bytes=0-1023" \
  "http://localhost:3000/static/2026/05/04/${WORKER_ENV}/hacker-news-2026-05-04.mp3"
```

預期結果：

- `206 Partial Content`
- `Content-Range`
- `Accept-Ranges: bytes`

## 11. 驗證瀏覽器播放

在瀏覽器打開文章頁，確認：

- audio player 可載入
- 可正常播放
- 可拖曳進度
- 不會立即 404 或卡住

## 12. 驗證 Replay

```bash
docker compose exec worker node apps/worker/dist/index.js replay 2026-05-04 hacker-news
```

預期結果：

- 任務重新排入
- 不會因為既有資料直接 crash
- `workflow_runs` 有更新

## 13. 驗證 Duplicate Protection

快速連續執行兩次：

```bash
docker compose exec worker node apps/worker/dist/index.js run-daily 2026-05-04 hacker-news
docker compose exec worker node apps/worker/dist/index.js run-daily 2026-05-04 hacker-news
```

預期結果：

- 至少一個會被 lock / duplicate protection 擋下
- 不應該產生兩個完全重疊的有效執行

## 14. 驗證 Retry

你可以暫時讓：

- TTS key 錯誤
- LLM key 錯誤
- 外部服務暫時 unreachable

再重跑一次，觀察：

- `workflow_runs.status`
- BullMQ job retry
- worker logs

預期結果：

- 任務失敗時有紀錄
- 有 retry 行為
- 最終失敗不應無聲吞掉

## 15. 完成判定

你可以把 `8.1` 到 `8.3` 視為完成，至少要滿足：

- 成功生成一集
- Postgres 有 episode 與 run history
- MinIO 有最終音檔
- 首頁 / 文章頁 / RSS 可正常呈現
- enclosure 正確輸出
- byte-range 返回 `206`
- 瀏覽器內可正常播放

## 16. 若失敗，先收集這些

```bash
docker compose logs worker --tail=300
docker compose logs web --tail=300
docker compose logs postgres --tail=200
docker compose logs minio --tail=200
docker compose logs redis --tail=200
```

以及：

- 失敗日期
- 使用的 variant
- `.env` 中哪一類 provider 在用
- 哪一步失敗
