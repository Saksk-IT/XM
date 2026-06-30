FROM node:22-bookworm-slim AS build

WORKDIR /app
RUN corepack enable && apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY packages packages
COPY apps apps
RUN pnpm build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/tsconfig.base.json ./
COPY --from=build /app/pnpm-lock.yaml ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/shared packages/shared
COPY --from=build /app/apps/api apps/api
COPY --from=build /app/apps/web/dist apps/web/dist

EXPOSE 4000
CMD ["sh", "-c", "pnpm --filter @xm/api db:push && pnpm --filter @xm/api db:seed && pnpm --filter @xm/api start"]
