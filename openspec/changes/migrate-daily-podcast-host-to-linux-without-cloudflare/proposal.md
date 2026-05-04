## Why

`daily-podcast` currently depends on Cloudflare Workers, KV, R2, Workflows, and OpenNext-specific runtime behavior, which makes it unsuitable for direct deployment on a standard Linux host. This change is needed to make the system self-hostable with Docker Compose while preserving the current daily content pipeline, RSS output, and podcast playback behavior.

## What Changes

- Replace Cloudflare runtime dependencies with a Linux-native deployment model based on `web`, `worker`, `redis`, `postgres`, `minio`, and reverse proxy services.
- Rebuild the daily script and audio pipeline as a Node.js worker process with retry, dedupe, and scheduled execution outside Cloudflare Workflows.
- Replace KV/R2-backed storage access with explicit adapters for durable metadata, transient locks/cache, and object storage.
- Remove OpenNext and Cloudflare runtime helpers from the Next.js application so pages, RSS, and audio routes can run on standard Node.
- Preserve externally visible podcast behavior, including date-based audio paths, RSS enclosure validation, and byte-range audio delivery.

## Capabilities

### New Capabilities
- `self-hosted-podcast-runtime`: Run the podcast web application and background generation pipeline on Linux using Docker Compose instead of Cloudflare-managed services.
- `podcast-storage-abstraction`: Persist durable episode metadata in a database, transient workflow state in Redis, and audio assets in S3-compatible object storage through explicit adapters.
- `podcast-generation-orchestration`: Execute daily script generation, audio generation, retries, and duplicate-run protection through a Node-based orchestration layer.

### Modified Capabilities
- None.

## Impact

- Affected systems: Next.js runtime, workflow execution, storage layer, deployment topology, and environment configuration.
- Affected code areas from the source project: `workflow/*`, `worker/*`, `app/page.tsx`, `app/post/**`, `app/rss.xml/route.ts`, `app/static/[...path]/route.ts`, `open-next.config.ts`, and `wrangler.jsonc`.
- New dependencies likely include BullMQ, Redis client libraries, Postgres access layer, and S3-compatible object storage tooling.
- Deployment will move from Wrangler/Cloudflare to Dockerfiles, Docker Compose, and Linux service configuration.
