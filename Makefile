.DEFAULT_GOAL := start

# Build the app image (and db) and run with live reload. The source is
# bind-mounted, so saving a file recompiles and reloads automatically.
# Runs in the foreground so you see logs; press Ctrl-C to stop.
.PHONY: start
start:
	docker compose up --build

# Same as start but detached (background).
.PHONY: up
up:
	docker compose up --build -d

# Stop and remove containers (keeps the postgres volume).
.PHONY: down
down:
	docker compose down

# Stop and remove containers AND volumes (wipes the database).
.PHONY: clean
clean:
	docker compose down -v

# Tail application logs.
.PHONY: logs
logs:
	docker compose logs -f app

# Open an interactive shell in the running app container.
.PHONY: shell
shell:
	docker compose exec app bash

# Run the test suite inside the container (MIX_ENV=test).
.PHONY: test
test:
	docker compose run --rm -e MIX_ENV=test app mix test
