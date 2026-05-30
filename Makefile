# =============================================================================
# Developer convenience wrapper around docker compose.
# =============================================================================
COMPOSE := docker compose

.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | sort \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

.PHONY: env
env: ## Create .env from .env.example if it does not exist
	@test -f .env || (cp .env.example .env && echo "Created .env — edit the secrets before running 'make up'.")

.PHONY: up
up: env ## Build and start the full stack
	$(COMPOSE) up --build -d

.PHONY: up-fg
up-fg: env ## Build and start the stack in the foreground (stream logs)
	$(COMPOSE) up --build

.PHONY: down
down: ## Stop the stack (keep volumes)
	$(COMPOSE) down

.PHONY: clean
clean: ## Stop the stack and remove named volumes (DESTROYS data)
	$(COMPOSE) down -v

.PHONY: ps
ps: ## Show container + health status
	$(COMPOSE) ps

.PHONY: logs
logs: ## Tail logs from all services
	$(COMPOSE) logs -f --tail=100

.PHONY: build
build: ## Build all images without starting
	$(COMPOSE) build

.PHONY: config
config: ## Validate and render the resolved compose configuration
	$(COMPOSE) config
