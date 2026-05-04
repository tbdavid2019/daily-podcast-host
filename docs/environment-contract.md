# Linux Environment Contract

This document defines the environment groups needed by the Linux-hosted replacement for `../daily-podcast`.

## Web

- `NODE_ENV`: Standard Next.js runtime mode.
- `PORT`: Web service listen port.
- `NEXT_PUBLIC_BASE_URL`: Canonical public origin used for RSS and metadata links.
- `NEXT_STATIC_HOST`: Public host prefix used when generating enclosure and post URLs.
- `NEXT_REVALIDATE_SECONDS`: Cache interval for homepage and RSS regeneration.

## Worker

- `WORKER_ENV`: Replaces the Cloudflare environment name in durable/transient key prefixes.
- `DEFAULT_PODCAST_VARIANT`: Default channel/variant to run when none is provided.
- `TIMEZONE_OFFSET`: Hour offset used for display-date and fetch-date calculations.
- `TIMEZONE_NAME`: Human-readable timezone label for logs and scheduling context.
- `RUN_DAILY_CRON`: Cron schedule for automatic daily enqueueing.
- `QUEUE_PREFIX`: BullMQ namespace prefix.
- `QUEUE_CONCURRENCY`: Worker-side queue concurrency limit.
- `QUEUE_JOB_ATTEMPTS`: Retry ceiling for recoverable jobs.
- `QUEUE_JOB_BACKOFF_MS`: Base retry delay for backoff policy.

## AI And Content Fetching

- `OPENAI_BASE_URL`: OpenAI-compatible API base URL.
- `OPENAI_API_KEY`: API credential for script generation and summarization.
- `OPENAI_MODEL`: Primary generation model for script creation.
- `OPENAI_THINKING_MODEL`: Optional higher-latency model for deeper reasoning tasks.
- `OPENAI_MAX_TOKENS`: Prompt-side token budget.
- `OPENAI_MAX_COMPLETION_TOKENS`: Completion token ceiling.
- `JINA_KEY`: Optional credential for Jina-based content extraction.
- `FIRECRAWL_KEY`: Optional credential for Firecrawl fallback extraction.

## Audio / TTS

- `TTS_PROVIDER`: Active TTS backend selector.
- `TTS_API_URL`: Base URL for custom TTS backends.
- `TTS_API_ID`: Optional upstream TTS account or deployment identifier.
- `TTS_API_KEY`: TTS API credential.
- `TTS_MODEL`: Voice synthesis model selection.
- `MAN_VOICE_ID`: Voice id for male dialogue lines.
- `WOMAN_VOICE_ID`: Voice id for female dialogue lines.
- `AUDIO_SPEED`: Global synthesis speed multiplier.
- `GEMINI_TTS_API_KEY`: Credential for Gemini TTS mode.
- `GEMINI_TTS_MODEL`: Gemini TTS model name.

## Storage

### Postgres

- `POSTGRES_HOST`
- `POSTGRES_PORT`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `DATABASE_URL`

### Redis

- `REDIS_HOST`
- `REDIS_PORT`
- `REDIS_PASSWORD`
- `REDIS_URL`

### S3 / MinIO

- `S3_ENDPOINT`: Internal S3-compatible endpoint.
- `S3_REGION`: S3 region value for client configuration.
- `S3_ACCESS_KEY`: Access key for object storage.
- `S3_SECRET_KEY`: Secret key for object storage.
- `S3_BUCKET`: Bucket for final episode audio and optional temp artifacts.
- `S3_FORCE_PATH_STYLE`: Enables MinIO-compatible addressing.
- `MINIO_CONSOLE_PORT`: Admin console port for local operations.

## Reverse Proxy

- `PROXY_HTTP_PORT`: External HTTP port.
- `PROXY_HTTPS_PORT`: External HTTPS port.
- `LETSENCRYPT_EMAIL`: Certificate registration address for automated TLS management.
