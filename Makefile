install:
	bun install
	cd packages/python && poetry install

build: build-core build-python

build-core:
	cd packages/typescript && bun run build

build-python:
	cd packages/python && poetry build

clean:
	cd packages/typescript && bun run clean
	cd packages/python && poetry poe clean

check-format:
	cd packages/typescript && bun run check-format
	cd packages/python && poetry poe check-format

format:
	cd packages/typescript && bun run format
	cd packages/python && poetry poe format

test:
	cd packages/typescript && bun run test
	cd packages/python && poetry poe test

types:
	bun tsgo --build

start-server:
	cd packages/python && poetry run alumnium-server

start-server-docker:
	docker build -t alumnium-server .
	docker run -ti --rm -p 8013:8013 \
		-v $(PWD)/.alumnium/cache:/app/.alumnium/cache \
		--env-file .env \
		-e ALUMNIUM_CACHE \
		-e ALUMNIUM_LOG_PATH=stdout \
		-e ALUMNIUM_OLLAMA_URL \
		alumnium-server

start-mcp:
	@cd packages/typescript && fnox exec -- bun ./src/cli.ts mcp
