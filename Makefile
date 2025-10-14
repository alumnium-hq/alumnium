install:
	cd packages/python && poetry install
	cd packages/typescript && npm install

build:
	cd packages/python && poetry build
	cd packages/typescript && npm run build

clean:
	cd packages/python && poetry poe clean
	cd packages/typescript && npm run clean

check-format:
	cd packages/python && poetry poe check-format
	cd packages/typescript && npm run check-format

format:
	cd packages/python && poetry poe format
	cd packages/typescript && npm run format

test:
	cd packages/python && poetry poe test

start-server:
	cd packages/python && poetry run server

start-server-docker:
	docker build -t alumnium-server .
	docker run -ti --rm -p 8013:8013 \
		-v $(PWD)/.alumnium/cache:/app/.alumnium/cache \
		--env-file .env \
		-e ALUMNIUM_CACHE \
		-e ALUMNIUM_LOG_PATH=stdout \
		-e ALUMNIUM_OLLAMA_URL \
		alumnium-server
