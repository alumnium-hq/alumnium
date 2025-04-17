format:
	poetry run autoflake .
	poetry run black .
	poetry run flake8 alumnium examples
	poetry run isort .
	poetry run pyprojectsort

test:
	mkdir -p log/
	poetry run behave
	poetry run pytest

check-format:
	poetry run autoflake --check-diff .
	poetry run black --check --diff .
	poetry run isort --check .
	poetry run flake8 .
	poetry run pyprojectsort --diff

test-anthropic:
	ALUMNIUM_MODEL=anthropic ALUMNIUM_LOG_PATH=log/anthropic.log make test

test-aws_anthropic:
	ALUMNIUM_MODEL=aws_anthropic ALUMNIUM_LOG_PATH=log/aws_anthropic.log make test

test-aws_meta:
	ALUMNIUM_MODEL=aws_meta ALUMNIUM_LOG_PATH=log/aws_meta.log make test

test-azure_openai:
	ALUMNIUM_MODEL=azure_openai ALUMNIUM_LOG_PATH=log/azure_openai.log make test

test-google:
	ALUMNIUM_MODEL=google ALUMNIUM_LOG_PATH=log/google.log make test

test-openai:
	ALUMNIUM_MODEL=openai ALUMNIUM_LOG_PATH=log/openai.log make test

test-all: test-anthropic test-aws_anthropic test-aws_meta test-azure_openai test-google test-openai
