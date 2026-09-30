FROM debian:bookworm-slim

ARG TARGETARCH
ARG VERSION
WORKDIR /app

ADD https://github.com/krallin/tini/releases/download/v0.19.0/tini-${TARGETARCH} /tini
RUN chmod +x /tini

RUN groupadd --gid 65532 alumnium && \
    useradd --uid 65532 --gid 65532 --home-dir /home/alumnium --create-home --shell /usr/sbin/nologin alumnium

RUN mkdir -p /app/.alumnium/cache && chown -R alumnium:alumnium /app/.alumnium
RUN --mount=type=bind,source=packages/typescript/dist/bin,target=/tmp/bins \
    ARCH=$([ "$TARGETARCH" = "amd64" ] && echo "x64" || echo "arm64") && \
    cp /tmp/bins/alumnium-${VERSION}-linux-${ARCH} /app/alumnium && \
    chmod +x /app/alumnium

EXPOSE 8013
VOLUME ["/app/.alumnium/cache"]

USER 65532:65532

ENTRYPOINT ["/tini", "--"]
CMD ["/app/alumnium", "server", "--host", "0.0.0.0"]
