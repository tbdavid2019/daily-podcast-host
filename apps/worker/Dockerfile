FROM node:26.12.1-alpine AS base
WORKDIR /app

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/storage/package.json packages/storage/package.json

RUN corepack enable

COPY . .

RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @daily-podcast-host/worker build

CMD ["node", "apps/worker/dist/index.js", "worker"]
