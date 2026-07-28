FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm

USER root

# Keep OS-level tooling in the image so bootstrap only installs project-scoped
# dependencies. The browser libraries cover Playwright Chromium; bootstrap
# installs the browser binary that matches the package lock.
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        fonts-liberation \
        iproute2 \
        jq \
        libasound2 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libcups2 \
        libdbus-1-3 \
        libdrm2 \
        libgbm1 \
        libglib2.0-0 \
        libnss3 \
        libpango-1.0-0 \
        libx11-6 \
        libx11-xcb1 \
        libxcb1 \
        libxcomposite1 \
        libxdamage1 \
        libxext6 \
        libxfixes3 \
        libxkbcommon0 \
        libxrandr2 \
        libxshmfence1 \
        lsof \
        netcat-openbsd \
        postgresql-client \
        procps \
        xdg-utils \
    && rm -rf /var/lib/apt/lists/*

ENV PLAYWRIGHT_BROWSERS_PATH=/home/node/.cache/ms-playwright

USER node
