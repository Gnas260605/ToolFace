# Stage 1: Build
FROM node:20-slim AS builder
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
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
RUN pnpm --filter @newsflow/video-studio build
RUN pnpm --filter worker build

# Stage 2: Production runner
FROM node:20-slim AS runner
# Video Studio runtime: FFmpeg (libass for captions), fonts with Vietnamese glyphs, Edge TTS.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ffmpeg fonts-dejavu-core python3 python3-pip \
  && pip3 install --no-cache-dir --break-system-packages 'edge-tts>=7,<8' \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@9.5.0

WORKDIR /app

ENV NODE_ENV=production

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/ ./packages/
COPY apps/worker/package.json ./apps/worker/package.json
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
RUN pnpm install --prod --frozen-lockfile
RUN pnpm --filter @newsflow/database db:generate
COPY --from=builder /app/packages/config/dist ./packages/config/dist
COPY --from=builder /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=builder /app/packages/database/dist ./packages/database/dist
COPY --from=builder /app/packages/video-studio/dist ./packages/video-studio/dist
# Render scratch space and the shared content cache (mount a volume at /var/cache/video-studio).
ENV VIDEO_STUDIO_CACHE_DIR=/var/cache/video-studio
RUN mkdir -p /var/cache/video-studio && chown -R node:node /var/cache/video-studio
RUN chown -R node:node /app

USER node

CMD ["node", "apps/worker/dist/main"]
