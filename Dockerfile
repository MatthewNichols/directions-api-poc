FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

RUN npm install

COPY . .

RUN npm run build

FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

COPY package*.json ./
COPY server/package*.json ./server/

RUN npm install --omit=dev --workspace server

COPY server ./server
COPY --from=build /app/client/dist ./client/dist

EXPOSE 3001

CMD ["node", "server/src/index.js"]
