FROM node:18-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy rest of the application code
COPY . .

# Build TypeScript code
RUN npm run build

# Expose the port
EXPOSE 10000

# Start the application using compiled JavaScript
CMD ["node", "dist/index.js"]
