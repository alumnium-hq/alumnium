install:
	bun install
	cd packages/python && uv sync

build: build-core build-python

build-core:
	cd packages/typescript && bun run build

build-python:
	cd packages/python && uv build

clean:
	cd packages/typescript && bun run clean
	cd packages/python && uv poe clean

check-format:
	cd packages/typescript && bun run check-format
	cd packages/python && uv poe check-format

format:
	cd packages/typescript && bun run format
	cd packages/python && uv poe format

test:
	cd packages/typescript && bun run test
	cd packages/python && uv poe test

types:
	bun tsgo --build

start-server:
	cd packages/typescript && fnox exec -- bun ./src/cli.ts server

start-mcp:
	@cd packages/typescript && fnox exec -- bun ./src/cli/bin.ts mcp
