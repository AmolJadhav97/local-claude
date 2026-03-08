FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY backend/package.json ./

# Install dependencies
RUN npm install --production

# Copy backend source
COPY backend/ ./

# Copy frontend
COPY frontend/ /app/../frontend/

EXPOSE 3000

CMD ["node", "server.js"]
