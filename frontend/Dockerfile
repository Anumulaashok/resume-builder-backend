# Stage 1: Build Next.js application
FROM node:20-alpine AS builder

WORKDIR /app

ARG BACKEND_URL=http://backend:10000
ENV BACKEND_URL=${BACKEND_URL}

# Copy package manifests
COPY package*.json ./

# Install all dependencies
RUN npm install

# Copy frontend source code
COPY . .

# Build Next.js application
RUN npm run build

# Stage 2: Production runner
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV BACKEND_URL=http://backend:10000

# Copy package manifests
COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy build artifacts and static assets
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts

EXPOSE 3000

CMD ["npm", "start"]
