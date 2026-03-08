FROM node:20-alpine

# Force upgrade all Alpine packages to get latest security patches
RUN apk update && apk upgrade --no-cache

WORKDIR /app

COPY backend/package.json ./
RUN npm install --production

COPY backend/ ./
COPY frontend/ /app/../frontend/

EXPOSE 3000

CMD ["node", "server.js"]