# Chipper. Two paths to the same result: a Node version manager, or Docker.
# Neither needs remembering — every target works the same way.

NPM := npm
PORT ?= 2447
DOCKER_IMAGE := chipper-dev
DOCKER_RUN := docker run --rm -it -v "$(PWD)":/app -v /app/node_modules -p $(PORT):$(PORT) -e PORT=$(PORT) $(DOCKER_IMAGE)

.DEFAULT_GOAL := help
.PHONY: help bootstrap setup dev test test-watch check build clean docker-build docker-dev docker-test docker-check

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

bootstrap: ## First time on this machine: base tools, pinned Node, dependencies
	@command -v brew >/dev/null || { echo "Install Homebrew first: https://brew.sh"; exit 1; }
	brew bundle --file=Brewfile
	mise install
	$(MAKE) setup

setup: ## Install pinned dependencies (exact lockfile, never resolves anew)
	$(NPM) ci --no-audit --no-fund

dev: ## Vite dev server (PORT=2447 by default; override with PORT=xxxx)
	$(NPM) run dev

test: ## Run the test suite once
	$(NPM) run test:run

test-watch: ## Run tests in watch mode
	$(NPM) run test

check: ## Everything CI runs: types, svelte, formatting, tests
	$(NPM) run typecheck
	$(NPM) run format:check
	$(NPM) run test:run

build: ## Static bundle into dist/
	$(NPM) run build

clean: ## Remove build output and installed dependencies
	rm -rf dist node_modules

docker-build: ## Build the dev image
	docker build -t $(DOCKER_IMAGE) .

docker-dev: docker-build ## Dev server inside the container
	$(DOCKER_RUN) npm run dev -- --host 0.0.0.0

docker-test: docker-build ## Tests inside the container
	$(DOCKER_RUN) npm run test:run

docker-check: docker-build ## Full check inside the container
	$(DOCKER_RUN) make check
