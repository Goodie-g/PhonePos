# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev --no-audit --no-fund
COPY prisma ./prisma
RUN npx prisma generate
COPY src ./src
COPY start.sh ./start.sh
ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000
CMD ["sh", "./start.sh"]
