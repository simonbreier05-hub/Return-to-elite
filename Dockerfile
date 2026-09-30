# StayClean — runs on any Docker host (no Railway needed). See docs/deployment.md.
#   docker build -t stayclean .
#   docker run -p 3000:3000 -e DATABASE_URL=... -e AUTH_SECRET=... -v stayclean_uploads:/app/uploads stayclean

# ---- Stage 1: install dependencies (includes everything the build needs)
FROM node:22-slim AS deps
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- Stage 2: generate Prisma client (Postgres) and build Next.js
FROM deps AS build
COPY . .
RUN npm run build:railway

# ---- Stage 3: slim runtime image
FROM node:22-slim AS runtime
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates bash \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /app/uploads && chown node:node /app/uploads
USER node
VOLUME ["/app/uploads"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Applies the DB schema (prisma db push), seeds an EMPTY database once, then starts the server.
CMD ["npm", "run", "start:railway"]
