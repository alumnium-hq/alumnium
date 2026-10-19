FROM debian:bookworm-slim AS binary

ARG TARGETARCH
ARG VERSION
WORKDIR /app

ADD https://github.com/krallin/tini/releases/download/v0.19.0/tini-${TARGETARCH} /tini
RUN chmod +x /tini

RUN groupadd -r -g 10001 alumnium && useradd --no-log-init -r -u 10001 -g alumnium alumnium

RUN mkdir -p /app/.alumnium/cache && chown -R alumnium:alumnium /app/.alumnium
RUN --mount=type=bind,source=packages/typescript/dist/bin,target=/tmp/bins \
    ARCH=$([ "$TARGETARCH" = "amd64" ] && echo "x64" || echo "arm64") && \
    cp /tmp/bins/alumnium-${VERSION}-linux-${ARCH} /app/alumnium && \
    chmod +x /app/alumnium

ENV ALUMNIUM_HOST=0.0.0.0 \
    ALUMNIUM_MCP_TRANSPORT=http

EXPOSE 8013 8014
VOLUME ["/app/.alumnium/cache"]

USER 10001

ENTRYPOINT ["/tini", "--", "/app/alumnium"]
CMD ["server"]

FROM binary AS web

USER root
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/alumnium/playwright \
    SE_CACHE_PATH=/opt/alumnium/selenium \
    SE_OFFLINE=true \
    CLOAKBROWSER_CACHE_DIR=/opt/alumnium/cloakbrowser

ARG TARGETARCH
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    /app/alumnium install --driver playwright && \
    /app/alumnium install --driver cloakbrowser && \
    if [ "$TARGETARCH" = "amd64" ]; then /app/alumnium install --driver selenium; fi && \
    rm -rf /var/lib/apt/lists/* && \
    chmod -R a+rX /opt/alumnium

USER 10001
