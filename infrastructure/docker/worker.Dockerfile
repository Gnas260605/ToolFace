# Stage 1: Build
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat
RUN npm install -g pnpm@9.5.0

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json .prettierrc .eslintrc.js ./
COPY packages/ ./packages/
COPY apps/worker/ ./apps/worker/

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @newsflow/config build
RUN pnpm --filter @newsflow/contracts build
RUN pnpm --filter @newsflow/database db:generate
RUN pnpm --filter @newsflow/database build
RUN pnpm --filter worker build

# Stage 2: Production runner
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat
RUN npm install -g pnpm@9.5.0

WORKDIR /app

ENV NODE_ENV=production

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/ ./packages/
COPY apps/worker/package.json ./apps/worker/package.json
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
RUN pnpm install --prod --frozen-lockfile
COPY --from=builder /app/packages/database/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/packages/database/node_modules/.prisma ./node_modules/.prisma
RUN chown -R node:node /app

USER node

CMD ["node", "apps/worker/dist/main"]
