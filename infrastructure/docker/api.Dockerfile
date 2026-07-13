# Stage 1: Build
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat
RUN npm install -g pnpm@9.5.0

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json .prettierrc .eslintrc.js ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @newsflow/config build
RUN pnpm --filter @newsflow/contracts build
RUN pnpm --filter @newsflow/database db:generate
RUN pnpm --filter @newsflow/database build
RUN pnpm --filter api build

# Stage 2: Production runner
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat
RUN npm install -g pnpm@9.5.0

WORKDIR /app

ENV NODE_ENV=production

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/ ./packages/
COPY apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
RUN pnpm install --prod --frozen-lockfile
RUN pnpm --filter @newsflow/database db:generate
RUN chown -R node:node /app

USER node

EXPOSE 3001

CMD ["node", "apps/api/dist/main"]
