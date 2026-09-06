FROM node:24-alpine AS base
RUN npm install --global pnpm@11.13.1
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/mobile/package.json ./apps/mobile/package.json
RUN pnpm install --frozen-lockfile --filter @zevent-monitor/api...

FROM dependencies AS build
COPY apps/api ./apps/api
RUN pnpm --filter @zevent-monitor/api build
RUN pnpm --filter @zevent-monitor/api deploy --prod /prod/api

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S nodejs && adduser -S zevent -G nodejs
COPY --from=build --chown=zevent:nodejs /prod/api ./
USER zevent
EXPOSE 3000
CMD ["node", "dist/index.js"]
