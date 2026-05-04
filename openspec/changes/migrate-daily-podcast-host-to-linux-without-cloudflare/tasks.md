## 1. Repository Foundation

- [x] 1.1 Create the target repository structure under `apps/`, `packages/`, and `infra/`
- [x] 1.2 Add root workspace configuration, `.gitignore`, and `.env.example`
- [x] 1.3 Document the Linux-side environment contract grouped by web, worker, storage, and proxy concerns

## 2. Cloudflare Dependency Inventory

- [x] 2.1 Inventory all `cloudflare:workers` imports and direct binding usages in the source project
- [x] 2.2 Inventory all `getCloudflareContext()` usages in pages and route handlers
- [x] 2.3 Inventory KV key patterns, R2 object paths, and audio range-serving behavior that must be preserved

## 3. Shared Core Extraction

- [x] 3.1 Extract prompts, story selection, and summarization logic into a shared Node-safe package
- [x] 3.2 Extract TTS orchestration, dialogue chunking, and audio shaping logic into shared modules
- [x] 3.3 Remove Cloudflare-only imports from shared business logic paths

## 4. Storage Abstractions

- [x] 4.1 Define shared interfaces for content, scripts, audio, run locks, and run history
- [x] 4.2 Implement Postgres-backed durable episode persistence
- [x] 4.3 Implement Redis-backed transient workflow state, dedupe, and lock handling
- [x] 4.4 Implement MinIO-backed audio storage with existence checks and path convention support

## 5. Worker Orchestration

- [x] 5.1 Add BullMQ queues for script generation and audio generation
- [x] 5.2 Implement `generate-script`, `generate-audio`, and `run-daily` worker commands
- [x] 5.3 Implement retry policy, failed-run recording, and duplicate-run protection
- [x] 5.4 Support manual replay for a specific date and variant

## 6. Web Runtime Port

- [x] 6.1 Remove OpenNext-specific runtime assumptions and set standalone Next.js output
- [x] 6.2 Replace Cloudflare-backed homepage and post-page reads with adapter-backed reads
- [x] 6.3 Replace RSS generation with adapter-backed durable content and audio existence checks
- [x] 6.4 Port the audio route to support byte-range playback from MinIO-backed storage

## 7. Compose Deployment

- [x] 7.1 Create Dockerfiles for the web and worker services
- [x] 7.2 Add `docker-compose.yml` for web, worker, Redis, Postgres, MinIO, and reverse proxy
- [x] 7.3 Add persistent volumes, startup ordering, health checks, and scheduler configuration

## 8. Validation and Cutover Prep

- [ ] 8.1 Run one full episode generation flow locally against the Compose stack
- [ ] 8.2 Validate homepage, post page, RSS output, and enclosure URLs against expected behavior
- [ ] 8.3 Verify browser playback and range-based audio playback with a real generated file
- [x] 8.4 Prepare cutover and rollback notes before changing production traffic
