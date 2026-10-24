# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

RUN npm ci

RUN DATABASE_URL="mysql://placeholder:placeholder@localhost:3306/placeholder" npx prisma generate

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

RUN npm ci --omit=dev

# Copy generated prisma client dari builder, tidak perlu generate ulang
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

COPY --from=builder /app/dist ./dist

EXPOSE 3233

CMD ["node", "dist/index.js"]
