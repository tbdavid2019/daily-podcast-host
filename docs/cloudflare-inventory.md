# Cloudflare Dependency Inventory

Source project: `../daily-podcast`

## 2.1 `cloudflare:workers` Imports And Direct Binding Usage

### `cloudflare:workers` imports

- `workflow/index.ts`: `WorkflowEntrypoint`, `WorkflowEvent`, `WorkflowStep`, `WorkflowStepConfig`
- `workflow/audio.ts`: `WorkflowEntrypoint`, `WorkflowEvent`, `WorkflowStep`, `WorkflowStepConfig`

### Direct bindings and runtime-specific services

- `worker/index.ts`
  - `HACKER_NEWS_WORKFLOW`: creates script workflow runs
  - `HACKER_NEWS_AUDIO_WORKFLOW`: creates audio workflow runs
  - `HACKER_NEWS_KV`: duplicate-run lock, run status, script fetch
  - `ASSETS`: proxies static/audio asset fetches
- `workflow/index.ts`
  - `HACKER_NEWS_KV`: script/content cache, story-content cache, workflow lock keys
  - `HACKER_NEWS_AUDIO_WORKFLOW`: chained audio generation trigger
- `workflow/audio.ts`
  - `HACKER_NEWS_KV`: loads generated script payloads
  - `HACKER_NEWS_R2`: uploads temp batch audio, writes final MP3, reads temp artifacts, deletes temps
- `app/page.tsx`, `app/post/[date]/page.tsx`, `app/post/[date]/[variant]/page.tsx`, `app/rss.xml/route.ts`
  - `HACKER_NEWS_KV`: reads `script:*` and legacy `content:*` records
  - `NEXT_STATIC_HOST`: builds public page and enclosure URLs
  - `NEXTJS_ENV`: selects the logical environment prefix
- `app/static/[...path]/route.ts`
  - `HACKER_NEWS_R2`: serves byte-range and full-object audio responses

## 2.2 `getCloudflareContext()` Usage Inventory

- `app/page.tsx`
  - Reads `NEXTJS_ENV`, `NEXT_STATIC_HOST`, and `HACKER_NEWS_KV` inside the homepage server component.
- `app/post/[date]/page.tsx`
  - Reads `NEXTJS_ENV`, `NEXT_STATIC_HOST`, and `HACKER_NEWS_KV` in both `generateMetadata()` and the page component.
- `app/post/[date]/[variant]/page.tsx`
  - Same pattern as the date page, but keyed by variant-aware routes.
- `app/rss.xml/route.ts`
  - Reads `NEXTJS_ENV`, `NEXT_STATIC_HOST`, `HACKER_NEWS_KV`, and `HACKER_NEWS_R2`.
- `app/static/[...path]/route.ts`
  - Reads `HACKER_NEWS_R2` for full and partial audio responses.

The Linux port needs a replacement service container or module-level bootstrap for these environment-backed dependencies so route code can depend on explicit adapters instead of request-scoped Cloudflare context.

## 2.3 Preserved KV Keys, R2 Paths, And Audio Behavior

### KV key patterns

- Script payloads: `script:{env}:{variant}:{date}`
- Legacy durable content fallback: `content:{env}:hacker-news:{date}`
- Per-story fetched content cache: `content:{env}:hacker-news:{date}:story-contents:{storyId}`
- Running lock in worker trigger: `workflow:{env}:{variant}:{date}:{phase}`
- Audio workflow running lock in script workflow: `audio-workflow:{env}:{variant}:{date}`

### R2 object path conventions

- Final audio: `YYYY/MM/DD/{env}/{variant}-{date}.mp3`
- Temporary batch audio: `YYYY/MM/DD/{env}/temp/{variant}-batch-{batchIndex}-{timestamp}.mp3`

### Audio route behavior to preserve

- Accepts `Range` requests and returns `206 Partial Content` when a valid range is supplied.
- Returns `Accept-Ranges: bytes` on both ranged and non-ranged responses.
- Uses object metadata content type when available and falls back to `application/octet-stream`.
- Exposes cacheable immutable responses for generated audio assets.
- RSS enclosure publication is gated by object existence; the enclosure is omitted if the audio object is missing.
