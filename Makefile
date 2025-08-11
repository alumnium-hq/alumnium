check-format:
	poetry run ruff check .
	poetry run pyprojectsort --diff

format:
	poetry run ruff check --fix .
	poetry run ruff format .
	poetry run pyprojectsort

test:
	mkdir -p log/
	poetry run behave
	poetry run pytest examples/pytest

test-anthropic:
	ALUMNIUM_MODEL=anthropic ALUMNIUM_LOG_PATH=log/anthropic.log make test

test-aws_anthropic:
	ALUMNIUM_MODEL=aws_anthropic ALUMNIUM_LOG_PATH=log/aws_anthropic.log make test

test-aws_meta:
	ALUMNIUM_MODEL=aws_meta ALUMNIUM_LOG_PATH=log/aws_meta.log make test

test-azure_openai:
	ALUMNIUM_MODEL=azure_openai ALUMNIUM_LOG_PATH=log/azure_openai.log make test

test-deepseek:
	ALUMNIUM_MODEL=deepseek ALUMNIUM_LOG_PATH=log/deepseek.log make test

test-google:
	ALUMNIUM_MODEL=google ALUMNIUM_LOG_PATH=log/google.log make test

test-mistralai:
	ALUMNIUM_MODEL=mistralai ALUMNIUM_LOG_PATH=log/mistralai.log make test

test-ollama:
	ALUMNIUM_MODEL=ollama ALUMNIUM_LOG_PATH=log/ollama.log make test

test-openai:
	ALUMNIUM_MODEL=openai ALUMNIUM_LOG_PATH=log/openai.log make test

test-all: test-anthropic test-aws_anthropic test-aws_meta test-azure_openai test-google test-ollama test-openai

# Server commands
server-install:
	cd alumnium/server && poetry install

server-format:
	cd alumnium/server && make format

server-check-format:
	cd alumnium/server && make check-format

server-test:
	cd alumnium/server && make test

server-serve:
	cd alumnium/server && make serve

server-serve-dev:
	cd alumnium/server && make serve-dev

# Combined commands
install-all:
	poetry install
	make server-install

format-all:
	make format
	make server-format

check-format-all:
	make check-format
	make server-check-format

test-all-components: test server-test
