# Official Node 24 multi-platform manifest, pinned for the local-only parser.
FROM node:24-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54
WORKDIR /app
COPY --chown=65534:65534 parser.mjs /app/parser.mjs
USER 65534:65534
ENTRYPOINT ["/usr/bin/timeout", "--signal=KILL", "10s", "node", "--max-old-space-size=160", "/app/parser.mjs"]
