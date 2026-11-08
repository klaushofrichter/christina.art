FROM node:26-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
# The content is checked and compiled here, at build time: bio, works and
# exhibitions (content/*.json) plus the image manifest become
# dist/content.json. Bad data fails the build, so it never reaches the cluster.
COPY scripts/build-content.ts ./scripts/
COPY content ./content
RUN npm run build

FROM node:26-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
COPY public ./public
# The uid rather than the name, so the image is verifiably non-root on its
# own (`node` is uid 1000 in the official images). The cluster's
# securityContext (runAsNonRoot, runAsUser/Group 1000) says the same thing
# from the other side; neither should be the only place it holds.
USER 1000:1000
# Stamped by the deploy so the running container can report which build it is
# on /health; "dev" for local builds. Last, because every release has a new
# one and anything after it would be rebuilt on each deploy.
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
EXPOSE 8080
CMD ["node", "dist/server.js"]
