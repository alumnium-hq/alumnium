install:
	cd packages/core && bun install
	cd packages/python && poetry install
	cd packages/typescript && npm install

build:
	cd packages/core && bun run build
	cd packages/python && poetry build
	cd packages/typescript && npm run build

clean:
	cd packages/core && bun run clean
	cd packages/python && poetry poe clean
	cd packages/typescript && npm run clean

check-format:
	cd packages/core && bun run check-format
	cd packages/python && poetry poe check-format
	cd packages/typescript && npm run check-format

format:
	cd packages/core && bun run format
	cd packages/python && poetry poe format
	cd packages/typescript && npm run format

test:
	cd packages/core && bun run test
	cd packages/python && poetry poe test

types:
	bun tsc --build

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
	@cd packages/core && bun ./src/mcp/mcpCli.ts