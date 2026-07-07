# Single-stage image: keeps devDependencies so the TypeORM ts-node CLI can run
# migrations on container boot (see docker-compose `command`).
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["node", "dist/main"]
