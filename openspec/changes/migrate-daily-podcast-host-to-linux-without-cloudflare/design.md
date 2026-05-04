## Context

The source project was built around Cloudflare primitives rather than generic Node.js interfaces. The web layer reads Cloudflare bindings directly via `getCloudflareContext()`, the generation pipeline is implemented with `cloudflare:workers` Workflow entrypoints, KV is used for script/content state and workflow locks, and R2 stores generated audio. The target repository, `daily-podcast-host`, needs to run the same core product on a Linux host using Docker Compose without preserving any Cloudflare runtime dependency.

This migration is cross-cutting: it changes the execution model, data persistence model, deployment topology, and part of the Next.js runtime integration. It also needs to preserve podcast-specific behavior such as date-keyed episode lookup, RSS enclosure validation, and audio byte-range support for podcast clients.

## Goals / Non-Goals

**Goals:**
- Run the application on Linux with Docker Compose and no Cloudflare runtime.
- Preserve the existing daily pipeline behavior for script generation and audio generation.
- Preserve podcast-consumer-facing behavior including RSS shape, enclosure stability, and range-capable audio delivery.
- Separate durable data, transient workflow state, and binary audio storage behind explicit adapters.
- Establish a structure that is simple enough for a single VPS first, while still being extensible later.

**Non-Goals:**
- Maintaining dual support for Cloudflare and Linux in the same runtime path.
- Preserving OpenNext or Wrangler in the final deployed system.
- Recreating Cloudflare Workflow semantics exactly.
- Introducing a large microservice architecture for v1.

## Decisions

### 1. Use a split runtime of `web` + `worker`

The Next.js application and the generation pipeline have different operational concerns. The web layer needs low-latency reads and audio delivery, while the worker layer needs scheduled background execution, retries, and duplicate-run protection.

Chosen approach:
- `web`: Next.js standalone server
- `worker`: Node.js worker process with CLI and queue processors

Alternative considered:
- Single monolith process for both web and jobs

Why not:
- It couples request-serving concerns with long-running background work and makes retries, scheduling, and failure recovery messier.

### 2. Use BullMQ with Redis for orchestration

Cloudflare Workflow currently provides retries, ordering, and stateful progression between script and audio phases. On Linux, BullMQ is a pragmatic replacement because it provides queues, delayed jobs, retries, and visibility using Redis as a backend.

Chosen approach:
- BullMQ queues for `generate-script` and `generate-audio`
- Redis locks for duplicate-run protection

Alternative considered:
- Cron plus shell scripts with no queue

Why not:
- Too weak for retries, observability, and replay of failed runs.

### 3. Use Postgres for durable episode metadata

The current KV model mixes short-lived workflow state with durable episode data. The Linux version should split these concerns. Postgres is the default durable store because it is operationally common, queryable, and safer for future data growth than Redis or ad hoc file storage.

Chosen approach:
- Postgres for episodes, stories, dialogue lines, workflow runs, and source logs

Alternative considered:
- SQLite for v1

Why not by default:
- SQLite can reduce moving parts, but Postgres fits the likely long-term operational model better. SQLite remains a fallback option if deployment simplicity becomes more important than queryability.

### 4. Use MinIO for audio object storage

Generated podcast audio is a binary asset with predictable object paths. MinIO preserves the operational model of object storage while remaining self-hostable and S3-compatible.

Chosen approach:
- MinIO bucket for final MP3 files and optional temporary batch artifacts

Alternative considered:
- Local filesystem storage only

Why not:
- Filesystem-only storage complicates future scaling, makes object existence checks less portable, and is a poorer match for current R2-based assumptions.

### 5. Replace direct Cloudflare binding access with adapter-backed data access

The Next.js application currently reads Cloudflare bindings in server components and route handlers. That coupling needs to be removed entirely rather than simulated.

Chosen approach:
- Introduce shared adapters in `packages/storage`
- Let both `web` and `worker` read and write through shared interfaces

Alternative considered:
- Create an internal HTTP API layer first

Why not:
- It adds a second service boundary before there is a proven need, increasing migration complexity without clear v1 benefit.

### 6. Preserve external behavior where it matters

Consumers of the podcast care about episode pages, RSS behavior, and playable audio URLs more than the internal execution engine. The migration should preserve external behavior even if the internal architecture changes significantly.

Chosen approach:
- Preserve date-based episode lookup semantics
- Preserve audio object path convention: `YYYY/MM/DD/{env}/{variant}-{date}.mp3`
- Preserve RSS rule that an enclosure is exposed only when audio exists
- Preserve byte-range support for audio delivery

Alternative considered:
- Redesign routes and storage conventions during migration

Why not:
- It mixes platform migration with product changes and makes validation harder.

## Risks / Trade-offs

- Queue design grows too complex too early → Keep v1 to a small number of job types and sequential orchestration.
- Existing KV key structure hides assumptions in web routes and RSS generation → Inventory key patterns before replacing data access and preserve externally visible lookup behavior.
- Linux/container runtime differences affect audio generation or concatenation → Add focused tests around Blob/Buffer conversion and validate with real generated audio.
- Podcast clients break if range requests or content headers regress → Explicitly test `Range` behavior and `Content-Type`/`Content-Length` handling before cutover.
- Postgres + Redis + MinIO adds more moving parts than Cloudflare-managed services → Accept the operational cost in exchange for self-hosting and keep the stack bounded to a single-host Compose layout first.

## Migration Plan

1. Scaffold the target repository structure and define the environment contract.
2. Inventory every Cloudflare runtime, storage, and routing dependency in the source project.
3. Extract shared business logic into Node-safe modules with no Cloudflare imports.
4. Implement storage adapters for Postgres, Redis, and MinIO.
5. Rebuild the generation pipeline as BullMQ-backed worker commands with retries and dedupe.
6. Port the Next.js app off `getCloudflareContext()` and onto adapter-backed reads.
7. Build the Docker Compose deployment with persistent services and health checks.
8. Validate one full daily run end-to-end, compare output with the current system, and prepare cutover steps.

Rollback strategy:
- Do not cut over DNS or production traffic until the Linux stack can generate and serve a full episode successfully.
- Keep the Cloudflare deployment untouched during migration so rollback is simply “continue serving from existing production”.

## Open Questions

- Should v1 use Postgres immediately, or allow SQLite as a temporary bootstrap option?
- Should MinIO run inside the same Compose stack or point to an external S3-compatible service?
- Is the target deployment definitely a single VPS first, or should Swarm-oriented concerns affect the initial file layout?
- Does the web layer need an internal API boundary later for scaling, or is direct adapter access sufficient for the expected operating model?
