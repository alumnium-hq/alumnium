FROM python:3.10-slim

WORKDIR /app

RUN mkdir -p /app/.alumnium/cache

RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN pip install poetry

COPY packages/python/pyproject.toml packages/python/poetry.lock packages/python/poetry.toml packages/python/README.md ./
RUN poetry install --no-root --with server --no-interaction --no-ansi

COPY packages/python/src ./src
RUN poetry install --only-root --no-interaction --no-ansi

ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8013
VOLUME ["/app/.alumnium/cache"]

CMD ["alumnium-server"]
