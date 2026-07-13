# Stage 1: Build
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat
RUN npm install -g pnpm@9.5.0

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json .prettierrc .eslintrc.js ./
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @newsflow/config build
RUN pnpm --filter @newsflow/contracts build
RUN pnpm --filter @newsflow/database db:generate
RUN pnpm --filter @newsflow/database build
RUN pnpm --filter web build

# Stage 2: Runner
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat
RUN npm install -g pnpm@9.5.0

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/ ./packages/
COPY apps/web/package.json ./apps/web/package.json
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
RUN pnpm install --prod --frozen-lockfile
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
RUN chown -R node:node /app

USER node

EXPOSE 3000

CMD ["pnpm", "--filter", "web", "start"]
