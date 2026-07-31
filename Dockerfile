# syntax=docker/dockerfile:1

# ---- Build the React client ----
FROM node:24-alpine AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- Runtime image: Express API + built client, one process/port ----
FROM node:24-alpine
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=client-build /app/client/dist /app/client/dist

# .git is excluded from the context, so the commit comes from the host —
# blank for dev builds; a blank value just disables the Layout icon's link.
ARG GIT_COMMIT=
ENV GIT_COMMIT=$GIT_COMMIT

RUN apk add --no-cache tzdata
ENV TZ=Pacific/Auckland

ENV PORT=4100
EXPOSE 4100
# SQLite data file lives here — mount a host volume over this path so data
# survives image rebuilds/updates.
VOLUME ["/app/server/data"]

CMD ["node", "src/index.js"]
