# Stage 1: builder
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package manifests
COPY package*.json ./

# Install all dependencies
RUN npm install

# Copy application source code
COPY . .

# Compile TypeScript
RUN npm run build

# Stage 2: runner
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy package manifests
COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy compiled dist from builder
COPY --from=builder /app/dist ./dist

# Expose application port
EXPOSE 10000

# Start the service
CMD ["node", "dist/app.js"]
