check-format:
	poetry run ruff check .

format:
	poetry run ruff check --fix .
	poetry run ruff format .

test:
	poetry run pytest

serve:
	poetry run alumnium-server

serve-dev:
	poetry run uvicorn alumnium.server.main:app --host 0.0.0.0 --port 8000 --reload