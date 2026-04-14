FROM node:20-alpine AS build

WORKDIR /app

ARG VITE_MAPTILER_API_KEY
ENV VITE_MAPTILER_API_KEY=$VITE_MAPTILER_API_KEY

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
ENV VITE_MAPTILER_API_KEY=
ENV MAPTILER_API_KEY=
ENV GEO_LOOKUP_COUNTRY=

COPY package*.json ./
COPY server/package*.json ./server/

RUN npm install --omit=dev --workspace server

COPY server ./server
COPY --from=build /app/client/dist ./client/dist

EXPOSE 3001

CMD ["node", "server/src/index.js"]
