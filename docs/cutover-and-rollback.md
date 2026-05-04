# Cutover And Rollback Notes

## Preconditions

- `pnpm install` has completed successfully on the target host.
- `pnpm --filter @daily-podcast-host/web typecheck` passes.
- `pnpm --filter @daily-podcast-host/worker typecheck` passes.
- Postgres has the `episodes` and `workflow_runs` tables from `packages/storage/sql/init.sql`.
- MinIO bucket `S3_BUCKET` exists and is reachable from both `web` and `worker`.
- Redis, Postgres, and MinIO health checks pass in Compose.
- At least one episode record and one matching audio object exist in the Linux-hosted stack.

## Cutover Steps

1. Bring up the stack with `docker compose up -d --build`.
2. Confirm `web`, `worker`, `scheduler`, `redis`, `postgres`, `minio`, and `proxy` are healthy.
3. Manually enqueue one replay run for a known date and variant before moving traffic.
4. Verify homepage, post page, RSS output, and byte-range audio playback against that known episode.
5. Point the public reverse proxy or DNS at the Linux host only after the checks above succeed.
6. Keep the Cloudflare deployment untouched during initial traffic shift.

## Rollback Steps

1. Stop sending traffic to the Linux host by restoring the previous DNS or proxy target.
2. Leave the Cloudflare deployment serving traffic while the Linux stack is inspected offline.
3. Preserve Postgres and MinIO volumes; do not delete generated state during rollback.
4. Review `workflow_runs` for the failed window and inspect worker logs before any second cutover attempt.

## Operational Notes

- The current worker queue layer is in place, but end-to-end validation still depends on wiring the full script-generation and audio-generation implementations into the Linux worker runtime.
- Do not treat this repository as production-ready until tasks `8.1` through `8.3` are completed with a real generated episode.
