FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS base

RUN apk add --no-cache dumb-init

WORKDIR /usr/src/app

FROM base AS deps

COPY --chown=node:node package.json yarn.lock /usr/src/app/

RUN yarn install --frozen-lockfile

FROM deps AS builder

COPY --chown=node:node . /usr/src/app

# The public SDK license key is supplied at build time, not persisted in an image layer.
RUN --mount=type=secret,id=tldraw_license_key,required=false \
	VITE_TLDRAW_LICENSE_KEY="$([ -f /run/secrets/tldraw_license_key ] && cat /run/secrets/tldraw_license_key || printf '')" \
	yarn build

FROM deps AS prod-deps

RUN yarn install --production --frozen-lockfile

FROM base AS app

COPY --chown=node:node --from=builder /usr/src/app/dist /usr/src/app/dist
COPY --chown=node:node --from=prod-deps /usr/src/app/node_modules /usr/src/app/node_modules

ENV NODE_ENV=production \
    CONFIG_DIR=/config

RUN mkdir -p /config && chown node:node /config
USER node

WORKDIR /usr/src/app

CMD ["dumb-init", "node", "dist/src/server/server.node.js"]