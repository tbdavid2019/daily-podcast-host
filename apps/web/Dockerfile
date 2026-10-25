FROM node:26.12.1-alpine AS base
WORKDIR /app

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/storage/package.json packages/storage/package.json

RUN corepack enable

COPY . .

RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @daily-podcast-host/web build

EXPOSE 3000
CMD ["pnpm", "--filter", "@daily-podcast-host/web", "start"]
