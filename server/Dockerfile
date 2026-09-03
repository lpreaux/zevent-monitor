FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:24-alpine AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S nodejs && adduser -S zevent -G nodejs
COPY --from=production-dependencies --chown=zevent:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=zevent:nodejs /app/dist ./dist
COPY --chown=zevent:nodejs package.json ./package.json
USER zevent
EXPOSE 3000
CMD ["node", "dist/index.js"]
