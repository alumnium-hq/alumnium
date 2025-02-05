test:
	poetry run behave
	poetry run pytest

test-anthropic:
	ALUMNIUM_MODEL=anthropic make test

test-aws_anthropic:
	ALUMNIUM_MODEL=aws_anthropic make test

test-aws_meta:
	ALUMNIUM_MODEL=aws_meta make test

test-azure_openai:
	ALUMNIUM_MODEL=azure_openai make test

test-google:
	ALUMNIUM_MODEL=google make test

test-openai:
	ALUMNIUM_MODEL=openai make test

test-all: test-anthropic test-aws_anthropic test-aws_meta test-azure_openai test-google test-openai
